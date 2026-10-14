const STORAGE_KEY = 'perspay.v1';

export const DEFAULT_SETTINGS = {
  minGapMin: 120,
  dueGapMin: 180,
  urgentGapMin: 240,
  quietEnabled: true,
  quietStartHour: 0,
  quietEndHour: 7,
};

const listeners = new Set();
let state = load();

function emptyState() {
  return { feedings: [], settings: { ...DEFAULT_SETTINGS } };
}

function normalize(raw) {
  const feedings = Array.isArray(raw?.feedings)
    ? raw.feedings.filter((f) => f && Number.isFinite(f.at)).map((f) => ({ id: f.id || makeId(), at: f.at, note: f.note || '' }))
    : [];
  return {
    feedings: feedings.sort((a, b) => a.at - b.at),
    settings: { ...DEFAULT_SETTINGS, ...(raw?.settings || {}) },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : emptyState();
  } catch {
    return emptyState();
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode or quota: keep working in memory */
  }
  listeners.forEach((fn) => fn(state));
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function addFeeding(at = Date.now(), note = '') {
  const feeding = { id: makeId(), at, note };
  state.feedings = [...state.feedings, feeding].sort((a, b) => a.at - b.at);
  persist();
  return feeding;
}

export function updateFeeding(id, patch) {
  state.feedings = state.feedings
    .map((f) => (f.id === id ? { ...f, ...patch } : f))
    .sort((a, b) => a.at - b.at);
  persist();
}

export function removeFeeding(id) {
  state.feedings = state.feedings.filter((f) => f.id !== id);
  persist();
}

export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  persist();
}

export function mergeFeedings(incoming) {
  const knownIds = new Set(state.feedings.map((f) => f.id));
  const knownMinutes = new Set(state.feedings.map((f) => Math.round(f.at / 60000)));
  let added = 0;
  for (const f of incoming) {
    if (!f || !Number.isFinite(f.at)) continue;
    const minute = Math.round(f.at / 60000);
    if (knownIds.has(f.id) || knownMinutes.has(minute)) continue;
    state.feedings.push({ id: f.id || makeId(), at: f.at, note: f.note || '' });
    knownMinutes.add(minute);
    added += 1;
  }
  state.feedings.sort((a, b) => a.at - b.at);
  persist();
  return added;
}

export function replaceState(raw) {
  state = normalize(raw);
  persist();
}

export function resetState() {
  state = emptyState();
  persist();
}

export function exportJson() {
  return JSON.stringify({ app: 'perspay', version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2);
}
