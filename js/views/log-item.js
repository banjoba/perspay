import { minutesBetween, gapQuality, formatDuration, formatTime, dayKey } from '../feeding.js';
import { escapeHtml } from '../util.js';

function gapLabel(feeding, previous, gap) {
  if (!previous) return 'первое в записях';
  if (dayKey(previous.at) === dayKey(feeding.at)) return `через ${formatDuration(gap)}`;
  return 'первое за день';
}

export function logItem(feeding, previous, settings) {
  const gap = previous ? minutesBetween(previous.at, feeding.at) : null;
  const sameDay = previous && dayKey(previous.at) === dayKey(feeding.at);
  const dotClass = sameDay ? `log__dot--${gapQuality(gap, settings)}` : '';
  const note = feeding.note ? `<span class="log__note">${escapeHtml(feeding.note)}</span>` : '';
  return `<li><button class="log__item" type="button" data-id="${feeding.id}">
    <span class="log__dot ${dotClass}"></span>
    <span class="log__time">${formatTime(feeding.at)}</span>
    <span class="log__body"><span class="log__gap">${gapLabel(feeding, previous, gap)}</span>${note}</span>
    <span class="log__chev">›</span>
  </button></li>`;
}

export function findFeeding(feedings, id) {
  return feedings.find((f) => f.id === id) || null;
}

export function previousOf(feedings, feeding) {
  let previous = null;
  for (const f of feedings) {
    if (f.at < feeding.at && f.id !== feeding.id && (!previous || f.at > previous.at)) previous = f;
  }
  return previous;
}
