import { STICKERS } from '../phrases.js';
import { getState, updateSettings, exportJson, replaceState, resetState } from '../store.js';
import { openSheet, closeSheet } from '../components/sheet.js';
import { showToast } from '../components/toast.js';
import { formatHours } from '../feeding.js';
import { clamp, toDateValue, escapeHtml } from '../util.js';
import {
  getSyncMeta, onSyncChange, enableSync, disableSync, adoptToken, pullNow, pushNow, isValidToken, widgetStub,
} from '../sync.js';
import { formatTime } from '../feeding.js';

const els = {
  grid: document.getElementById('sticker-grid'),
  rules: document.getElementById('settings-rules'),
  quiet: document.getElementById('settings-quiet'),
  widget: document.getElementById('settings-widget'),
  exportBtn: document.getElementById('data-export'),
  importBtn: document.getElementById('data-import'),
  fileInput: document.getElementById('data-file'),
  resetBtn: document.getElementById('data-reset'),
};

const RULES = [
  { key: 'minGapMin', label: 'Не раньше чем', hint: 'Раньше лапка откажет' },
  { key: 'dueGapMin', label: 'Пора кормить', hint: 'Персик начинает смотреть' },
  { key: 'urgentGapMin', label: 'Обязательно', hint: 'Красный уровень' },
];

let renderedSettings = '';

export function initPersik() {
  renderStickerGrid();
  els.grid.addEventListener('click', onStickerTap);
  els.rules.addEventListener('click', onRuleTap);
  els.quiet.addEventListener('change', onQuietChange);
  els.widget.addEventListener('click', onWidgetTap);
  els.widget.addEventListener('change', onWidgetToggle);
  onSyncChange(renderWidget);
  renderWidget();
  bindData();
  renderPersik();
}

export function renderPersik() {
  const { settings } = getState();
  const snapshot = JSON.stringify(settings);
  if (snapshot === renderedSettings) return;
  renderedSettings = snapshot;
  renderRules(settings);
  renderQuiet(settings);
}

function renderStickerGrid() {
  els.grid.innerHTML = STICKERS.map((s) => `
    <button class="sticker" type="button" data-sticker="${s.id}">
      <img src="stickers/${s.id}.webp" alt="${s.title}" loading="lazy">
      <span>${s.title}</span>
    </button>`).join('');
}

function onStickerTap(e) {
  const button = e.target.closest('[data-sticker]');
  if (!button) return;
  const sticker = STICKERS.find((s) => s.id === button.dataset.sticker);
  if (!sticker) return;
  const shareBtn = navigator.share ? '<button class="btn btn--primary" id="share-sticker" type="button">Поделиться</button>' : '';
  openSheet(`
    <img class="sticker-big" src="stickers/${sticker.id}.webp" alt="${sticker.title}">
    <h3 style="text-align:center">${sticker.title}</h3>
    <p class="sticker-caption">${sticker.caption}</p>
    ${shareBtn}
    <button class="btn btn--ghost" id="close-sticker" type="button">Закрыть</button>
  `, (panel) => {
    panel.querySelector('#share-sticker')?.addEventListener('click', () => shareSticker(sticker));
    panel.querySelector('#close-sticker').addEventListener('click', closeSheet);
  });
}

async function shareSticker(sticker) {
  const url = new URL(`stickerpack/persik-${sticker.id}.png`, location.href).href;
  const title = `Персик: ${sticker.title}`;
  try {
    const blob = await fetch(url).then((r) => r.blob());
    const file = new File([blob], `persik-${sticker.id}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return;
    }
    await navigator.share({ title, url });
  } catch {
    /* share cancelled */
  }
}

function renderRules(settings) {
  els.rules.innerHTML = RULES.map((rule) => `
    <div class="row">
      <div><span class="row__label">${rule.label}</span><span class="row__hint">${rule.hint}</span></div>
      <div class="stepper" data-key="${rule.key}">
        <button type="button" data-dir="-1" aria-label="Меньше">−</button>
        <output>${formatHours(settings[rule.key])}</output>
        <button type="button" data-dir="1" aria-label="Больше">+</button>
      </div>
    </div>`).join('');
}

function onRuleTap(e) {
  const button = e.target.closest('[data-dir]');
  if (!button) return;
  const key = button.closest('[data-key]').dataset.key;
  const current = getState().settings;
  const next = normalizeRules({ ...current, [key]: current[key] + Number(button.dataset.dir) * 30 }, key);
  updateSettings(next);
}

function normalizeRules(settings, changedKey) {
  const r = { ...settings };
  r.minGapMin = clamp(r.minGapMin, 30, 600);
  r.dueGapMin = clamp(r.dueGapMin, 60, 660);
  r.urgentGapMin = clamp(r.urgentGapMin, 90, 720);
  if (changedKey === 'minGapMin') {
    r.dueGapMin = Math.max(r.dueGapMin, r.minGapMin + 30);
    r.urgentGapMin = Math.max(r.urgentGapMin, r.dueGapMin + 30);
  } else if (changedKey === 'dueGapMin') {
    r.minGapMin = Math.min(r.minGapMin, r.dueGapMin - 30);
    r.urgentGapMin = Math.max(r.urgentGapMin, r.dueGapMin + 30);
  } else {
    r.dueGapMin = Math.min(r.dueGapMin, r.urgentGapMin - 30);
    r.minGapMin = Math.min(r.minGapMin, r.dueGapMin - 30);
  }
  return r;
}

function hourOptions(selected) {
  return Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === selected ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('');
}

function renderQuiet(settings) {
  els.quiet.innerHTML = `
    <div class="row">
      <div><span class="row__label">Не тревожить ночью</span><span class="row__hint">Ночью Персик спит, а не голодает</span></div>
      <label class="switch"><input type="checkbox" data-quiet="enabled" ${settings.quietEnabled ? 'checked' : ''}><i></i></label>
    </div>
    <div class="row">
      <span class="row__label">С</span>
      <select class="select" data-quiet="start">${hourOptions(settings.quietStartHour)}</select>
    </div>
    <div class="row">
      <span class="row__label">До</span>
      <select class="select" data-quiet="end">${hourOptions(settings.quietEndHour)}</select>
    </div>`;
}

function onQuietChange(e) {
  const field = e.target.dataset.quiet;
  if (field === 'enabled') updateSettings({ quietEnabled: e.target.checked });
  if (field === 'start') updateSettings({ quietStartHour: Number(e.target.value) });
  if (field === 'end') updateSettings({ quietEndHour: Number(e.target.value) });
  showToast('Сохранено. Персик одобряет.');
}

function bindData() {
  els.exportBtn.addEventListener('click', downloadExport);
  els.importBtn.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', importFile);
  bindReset();
}

function downloadExport() {
  const blob = new Blob([exportJson()], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `persik-${toDateValue(new Date())}.json`;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(link.href);
    link.remove();
  }, 1000);
}

async function importFile() {
  const file = els.fileInput.files[0];
  els.fileInput.value = '';
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed.feedings)) throw new Error('bad file');
    replaceState(parsed);
    showToast(`Импортировано: ${parsed.feedings.length} записей`);
  } catch {
    showToast('Не удалось прочитать файл');
  }
}

function bindReset() {
  let armed = false;
  els.resetBtn.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      els.resetBtn.textContent = 'Точно стереть всё?';
      setTimeout(() => {
        armed = false;
        els.resetBtn.textContent = 'Стереть всё';
      }, 4000);
      return;
    }
    resetState();
    armed = false;
    els.resetBtn.textContent = 'Стереть всё';
    showToast('Всё стёрто. Персик начинает с чистого листа.');
  });
}

function renderWidget() {
  const meta = getSyncMeta();
  const status = meta.lastError
    ? `<span class="row__hint">${meta.lastError}</span>`
    : meta.lastPushAt ? `<span class="row__hint">Отправлено в ${formatTime(meta.lastPushAt)}</span>` : '<span class="row__hint">Ещё не отправлялось</span>';
  const enabledRows = meta.enabled ? `
    <div class="row">
      <div><span class="row__label">Код синхронизации</span><code class="sync-code">${meta.token}</code></div>
      <button class="btn btn--ghost btn--inline" type="button" data-widget="copy-code">Скопировать</button>
    </div>
    <div class="row"><div><span class="row__label">Статус</span>${status}</div><button class="btn btn--ghost btn--inline" type="button" data-widget="push">Отправить</button></div>
    <button class="btn btn--primary" type="button" data-widget="howto">Как поставить виджет</button>` : '';
  els.widget.innerHTML = `
    <div class="row">
      <div><span class="row__label">Синхронизация для виджета</span><span class="row__hint">Дневник уходит на сервер, виджет читает его оттуда. Скрипт копируй из того приложения, где ведёшь дневник</span></div>
      <label class="switch"><input type="checkbox" data-widget="toggle" ${meta.enabled ? 'checked' : ''}><i></i></label>
    </div>
    ${enabledRows}
    <button class="btn btn--ghost" type="button" data-widget="restore">Подтянуть записи по коду</button>`;
}

function onWidgetToggle(e) {
  if (e.target.dataset.widget !== 'toggle') return;
  if (e.target.checked) {
    enableSync();
    showToast('Синхронизация включена');
  } else {
    disableSync();
  }
}

function onWidgetTap(e) {
  const action = e.target.closest('[data-widget]')?.dataset.widget;
  if (action === 'copy-code') copyText(getSyncMeta().token, 'Код скопирован');
  if (action === 'push') pushNow().then((ok) => showToast(ok ? 'Отправлено' : 'Не получилось отправить'));
  if (action === 'howto') openHowToSheet();
  if (action === 'restore') openRestoreSheet();
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(message);
  } catch {
    showToast('Не удалось скопировать, выдели текст вручную');
  }
}

function openHowToSheet() {
  const token = getSyncMeta().token;
  openSheet(`
    <h3>Виджет Персика</h3>
    <ol class="steps">
      <li>Делай это в том приложении, где ведёшь дневник (значок на экране «Домой»).</li>
      <li>Поставь из App Store бесплатное приложение <b>Scriptable</b>.</li>
      <li>Нажми кнопку ниже, скрипт скопируется в буфер.</li>
      <li>В Scriptable нажми «+», вставь скрипт, назови его «Персик» и закрой.</li>
      <li>На экране «Домой» зажми пустое место → «+» → найди Scriptable → выбери размер.</li>
      <li>Зажми новый виджет → «Изменить виджет» → Script: «Персик».</li>
      <li>Тап по виджету сразу записывает кормление и показывает «Ням!». Раньше двух часов Персик откажет. Виджет обновится через пару минут, приложение подтянет запись при следующем открытии.</li>
      <li>Кнопка «Открыть дневник» в этом окне запускает команду <b>Персик</b> из «Быстрых команд»: создай её с одним действием «Открыть приложение» → «Персик».</li>
    </ol>
    <p class="sheet__hint">Код синхронизации уже вшит в скрипт. Правило двух часов работает и для виджета: раньше срока Персик откажет.</p>
    <button class="btn btn--primary" type="button" id="copy-stub">Скопировать скрипт</button>
    <button class="btn btn--ghost" type="button" id="close-howto">Закрыть</button>
  `, (panel) => {
    panel.querySelector('#copy-stub').addEventListener('click', () => copyText(widgetStub(token), 'Скрипт скопирован, вставь его в Scriptable'));
    panel.querySelector('#close-howto').addEventListener('click', closeSheet);
  });
}

function openRestoreSheet() {
  openSheet(`
    <h3>Подтянуть записи</h3>
    <p class="sheet__hint">Вставь код синхронизации с другого телефона. Записи объединятся с текущими, ничего не удалится. Дальше этот телефон будет отправлять дневник под этим же кодом.</p>
    <div class="field"><label for="restore-code">Код</label><input id="restore-code" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="32 символа" value="${escapeHtml(getSyncMeta().token || '')}"></div>
    <p class="sheet__hint" id="restore-hint"></p>
    <button class="btn btn--primary" type="button" id="restore-go">Подтянуть</button>
  `, (panel) => {
    panel.querySelector('#restore-go').addEventListener('click', () => restoreFromCode(panel));
  });
}

async function restoreFromCode(panel) {
  const hint = panel.querySelector('#restore-hint');
  const code = panel.querySelector('#restore-code').value.trim().toLowerCase();
  if (!isValidToken(code)) {
    hint.textContent = 'Код выглядит неправильно.';
    return;
  }
  adoptToken(code);
  try {
    const result = await pullNow();
    if (result.status === 'empty') {
      hint.textContent = 'На сервере по этому коду записей нет. Этот телефон теперь отправляет свои под этим кодом.';
      return;
    }
    closeSheet();
    showToast(result.added ? `Добавлено записей: ${result.added}` : 'Новых записей нет, всё уже на месте');
  } catch {
    hint.textContent = 'Сервер не ответил. Проверь интернет и попробуй ещё раз.';
  }
}
