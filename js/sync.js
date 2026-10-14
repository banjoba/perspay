import { getState, subscribe, mergeFeedings } from './store.js';

export const SYNC_BASE = 'https://185-173-144-167.sslip.io/persik/';
export const WIDGET_SOURCE = 'https://banjoba.github.io/perspay/widget/persik-widget.js';
const META_KEY = 'perspay.sync';
const PUSH_DELAY_MS = 1500;

const listeners = new Set();
let pushTimer = null;

function loadMeta() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(META_KEY)) || {};
  } catch {
    stored = {};
  }
  return { ...stored, token: stored.token || makeToken(), enabled: stored.enabled !== false };
}

function saveMeta() {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(meta));
}

function makeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let meta = loadMeta();

export function getSyncMeta() {
  return meta;
}

export function onSyncChange(fn) {
  listeners.add(fn);
}

export function isValidToken(token) {
  return /^[a-f0-9]{24,64}$/.test(token);
}

export function enableSync() {
  if (!meta.token) meta.token = makeToken();
  meta.enabled = true;
  meta.lastError = '';
  saveMeta();
  schedulePush(0);
}

export function disableSync() {
  meta.enabled = false;
  saveMeta();
}

export function adoptToken(token) {
  meta = { ...meta, token, enabled: true, lastError: '' };
  saveMeta();
}

export function schedulePush(delay = PUSH_DELAY_MS) {
  if (!meta.enabled || !meta.token) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushNow(), delay);
}

export async function pushNow({ keepalive = false } = {}) {
  if (!meta.enabled || !meta.token) return false;
  clearTimeout(pushTimer);
  try {
    const response = await fetch(SYNC_BASE + meta.token, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(getState()),
      keepalive,
    });
    if (!response.ok) throw new Error(String(response.status));
    meta.lastPushAt = Date.now();
    meta.lastError = '';
  } catch {
    meta.lastError = 'Не удалось отправить, попробую позже';
  }
  saveMeta();
  return !meta.lastError;
}

export async function pullNow() {
  if (!meta.token) return { status: 'no-token' };
  const response = await fetch(SYNC_BASE + meta.token, { cache: 'no-store' });
  if (response.status === 404) return { status: 'empty' };
  if (!response.ok) throw new Error(String(response.status));
  const data = await response.json();
  if (!Array.isArray(data.feedings)) throw new Error('bad data');
  if (!data.feedings.length) return { status: 'empty' };
  return { status: 'ok', added: mergeFeedings(data.feedings), remote: data.feedings.length };
}

export function widgetStub(token) {
  return [
    '// Персик — виджет кормления. Код виджета подгружается с сайта приложения.',
    `const TOKEN = "${token}";`,
    '// Имя команды в «Быстрых командах», которая открывает приложение. Пусто = открывать сайт в Safari.',
    'const OPEN_SHORTCUT = "Персик";',
    `const SOURCE = "${WIDGET_SOURCE}";`,
    'const fm = FileManager.local();',
    'const cachePath = fm.joinPath(fm.cacheDirectory(), "persik-widget.js");',
    'let code = null;',
    'try {',
    '  const req = new Request(SOURCE);',
    '  req.timeoutInterval = 10;',
    '  const fresh = await req.loadString();',
    '  if (fresh.includes("PERSIK_WIDGET")) { code = fresh; fm.writeString(cachePath, fresh); }',
    '} catch (e) {}',
    'if (!code && fm.fileExists(cachePath)) code = fm.readString(cachePath);',
    'try {',
    '  if (!code) throw new Error("нужен интернет при первом запуске");',
    '  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;',
    '  await new AsyncFunction("TOKEN", "OPEN_SHORTCUT", code)(TOKEN, OPEN_SHORTCUT);',
    '} catch (e) {',
    '  const w = new ListWidget();',
    '  w.addText("Персик: " + e.message);',
    '  Script.setWidget(w);',
    '  Script.complete();',
    '}',
    '',
  ].join('\n');
}

export function initSync() {
  saveMeta();
  subscribe(() => schedulePush());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && pushTimer) pushNow({ keepalive: true });
  });
  if (meta.enabled && meta.token && !meta.lastPushAt) schedulePush(0);
}
