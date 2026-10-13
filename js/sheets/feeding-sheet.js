import { openSheet, closeSheet } from '../components/sheet.js';
import { showToast } from '../components/toast.js';
import { addFeeding, updateFeeding, removeFeeding, getState } from '../store.js';
import { lastFeedingBefore, minutesBetween, formatDuration, formatTime } from '../feeding.js';
import { toDateValue, toTimeValue, escapeHtml } from '../util.js';

export function openFeedingSheet(feeding = null, defaultTs = Date.now()) {
  const date = new Date(feeding ? feeding.at : defaultTs);
  openSheet(template(feeding, date), (panel) => bind(panel, feeding));
}

function template(feeding, date) {
  return `
    <h3>${feeding ? 'Кормление' : 'Добавить кормление'}</h3>
    <div class="field-row">
      <div class="field"><label for="f-date">Дата</label><input id="f-date" type="date" value="${toDateValue(date)}" max="${toDateValue(new Date())}"></div>
      <div class="field"><label for="f-time">Время</label><input id="f-time" type="time" value="${toTimeValue(date)}"></div>
    </div>
    <div class="field"><label for="f-note">Заметка</label><input id="f-note" type="text" placeholder="курица, полпорции, вкусняшка…" value="${escapeHtml(feeding?.note || '')}" autocomplete="off"></div>
    <p class="sheet__hint" id="f-hint"></p>
    <button class="btn btn--primary" id="f-save" type="button">Сохранить</button>
    ${feeding ? '<button class="btn btn--danger" id="f-delete" type="button">Удалить</button>' : ''}
  `;
}

function readTimestamp(panel) {
  const dateValue = panel.querySelector('#f-date').value;
  const timeValue = panel.querySelector('#f-time').value;
  if (!dateValue || !timeValue) return null;
  const [y, m, d] = dateValue.split('-').map(Number);
  const [hh, mm] = timeValue.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime();
}

function hintFor(ts, excludeId) {
  const { feedings, settings } = getState();
  const previous = lastFeedingBefore(feedings.filter((f) => f.id !== excludeId && f.at < ts), ts);
  if (!previous) return 'Это будет первое кормление в записях.';
  const gap = minutesBetween(previous.at, ts);
  const base = `Предыдущее было в ${formatTime(previous.at)}, разрыв ${formatDuration(gap)}.`;
  if (gap < settings.minGapMin) return `${base} Рановато, но Персик не против.`;
  if (gap > settings.urgentGapMin) return `${base} Персик успел пострадать.`;
  return base;
}

function bind(panel, feeding) {
  const hint = panel.querySelector('#f-hint');
  const refreshHint = () => {
    const ts = readTimestamp(panel);
    hint.textContent = ts ? hintFor(ts, feeding?.id) : '';
  };
  panel.querySelector('#f-date').addEventListener('change', refreshHint);
  panel.querySelector('#f-time').addEventListener('change', refreshHint);
  refreshHint();

  panel.querySelector('#f-save').addEventListener('click', () => save(panel, feeding));
  const deleteBtn = panel.querySelector('#f-delete');
  if (deleteBtn) bindDelete(deleteBtn, feeding);
}

function save(panel, feeding) {
  const ts = readTimestamp(panel);
  if (!ts) return;
  if (ts > Date.now() + 60000) {
    panel.querySelector('#f-hint').textContent = 'Персик пока не умеет есть в будущем.';
    return;
  }
  const note = panel.querySelector('#f-note').value.trim();
  if (feeding) {
    updateFeeding(feeding.id, { at: ts, note });
    showToast(`Изменено: ${formatTime(ts)}`);
  } else {
    const created = addFeeding(ts, note);
    showToast(`Добавлено: ${formatTime(ts)}`, { actionLabel: 'Отменить', onAction: () => removeFeeding(created.id) });
  }
  closeSheet();
}

function bindDelete(button, feeding) {
  let armed = false;
  button.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      button.textContent = 'Точно удалить?';
      return;
    }
    const snapshot = { ...feeding };
    removeFeeding(feeding.id);
    closeSheet();
    showToast('Запись удалена', { actionLabel: 'Вернуть', onAction: () => addFeeding(snapshot.at, snapshot.note) });
  });
}
