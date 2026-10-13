import { getState } from '../store.js';
import {
  dayKey, keyToDate, feedingsOfDay, dayStats, dayQuality, gapsOf, gapQuality,
  monthStats, goodDayStreak, formatDayTitle, formatMonthTitle, formatClock, formatCount,
} from '../feeding.js';
import { logItem, findFeeding, previousOf } from './log-item.js';
import { openFeedingSheet } from '../sheets/feeding-sheet.js';

const els = {
  month: document.getElementById('cal-month'),
  grid: document.getElementById('cal-grid'),
  prev: document.getElementById('cal-prev'),
  next: document.getElementById('cal-next'),
  dayTitle: document.getElementById('day-title'),
  dayCount: document.getElementById('day-count'),
  dayBody: document.getElementById('day-body'),
  monthStats: document.getElementById('month-stats'),
  monthNote: document.getElementById('month-note'),
};

const FEEDING_FORMS = ['кормление', 'кормления', 'кормлений'];
let viewMonth = startOfMonth(new Date());
let selectedKey = dayKey(Date.now());

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function initDiary() {
  els.prev.addEventListener('click', () => shiftMonth(-1));
  els.next.addEventListener('click', () => shiftMonth(1));
  els.grid.addEventListener('click', onDayTap);
  els.dayBody.addEventListener('click', onDayBodyTap);
  renderDiary();
}

export function renderDiary() {
  renderCalendar();
  renderDay();
  renderMonth();
}

function shiftMonth(delta) {
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1);
  renderDiary();
}

function onDayTap(e) {
  const cell = e.target.closest('[data-key]');
  if (!cell || cell.disabled) return;
  selectedKey = cell.dataset.key;
  renderDiary();
}

function onDayBodyTap(e) {
  const feedingBtn = e.target.closest('[data-id]');
  if (feedingBtn) {
    const feeding = findFeeding(getState().feedings, feedingBtn.dataset.id);
    if (feeding) openFeedingSheet(feeding);
    return;
  }
  if (e.target.closest('[data-add]')) openFeedingSheet(null, defaultTsForSelected());
}

function defaultTsForSelected() {
  if (selectedKey === dayKey(Date.now())) return Date.now();
  const d = keyToDate(selectedKey);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

function renderCalendar() {
  const { feedings, settings } = getState();
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const todayKey = dayKey(Date.now());
  const leading = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  els.month.textContent = formatMonthTitle(viewMonth);
  const cells = Array.from({ length: leading }, () => '<span></span>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = dayKey(new Date(year, month, day).getTime());
    cells.push(dayCell(day, key, feedingsOfDay(feedings, key), settings, todayKey));
  }
  els.grid.innerHTML = cells.join('');
}

function dayCell(day, key, list, settings, todayKey) {
  const isToday = key === todayKey;
  const classes = ['cal__day'];
  if (list.length && (!isToday || list.length >= 2)) classes.push(`q-${dayQuality(list, settings)}`);
  if (isToday) classes.push('is-today');
  if (key === selectedKey) classes.push('is-selected');
  if (key > todayKey) classes.push('is-future');
  const dots = '<i></i>'.repeat(Math.min(list.length, 4));
  const disabled = key > todayKey ? 'disabled' : '';
  return `<button class="${classes.join(' ')}" type="button" data-key="${key}" ${disabled}><span>${day}</span><span class="cal__dots">${dots}</span></button>`;
}

function renderDay() {
  const { feedings, settings } = getState();
  const list = feedingsOfDay(feedings, selectedKey);
  els.dayTitle.textContent = formatDayTitle(keyToDate(selectedKey));
  els.dayCount.textContent = list.length ? formatCount(list.length, FEEDING_FORMS) : '';
  if (!list.length) {
    els.dayBody.innerHTML = emptyDayHtml();
    return;
  }
  const items = list.map((f, i) => logItem(f, i ? list[i - 1] : previousOf(feedings, f), settings)).join('');
  els.dayBody.innerHTML = `${statsHtml(dayStats(list, settings))}${stripHtml(list, settings)}<ul class="log">${items}</ul>${addButtonHtml()}`;
}

function emptyDayHtml() {
  const isToday = selectedKey === dayKey(Date.now());
  const text = isToday
    ? 'Сегодня записей пока нет. Лапка на главном экране ждёт.'
    : 'В этот день записей нет. Либо не кормили, либо забыли нажать лапку.';
  return `<div class="empty"><img src="stickers/detective.webp" alt=""><p>${text}</p></div>${addButtonHtml()}`;
}

function addButtonHtml() {
  return '<button class="btn btn--ghost" type="button" data-add>+ Добавить запись</button>';
}

function statsHtml({ count, avgGap, maxGap }) {
  return `<div class="stats">${tilesHtml([
    { value: count, label: 'кормлений' },
    { value: avgGap == null ? '–' : formatClock(avgGap), label: 'средний' },
    { value: maxGap == null ? '–' : formatClock(maxGap), label: 'максимум' },
  ])}</div>`;
}

function tilesHtml(tiles) {
  return tiles.map((t) => `<div class="stat"><span class="stat__value">${t.value}</span><span class="stat__label">${t.label}</span></div>`).join('');
}

function stripHtml(list, settings) {
  const x = (ts) => {
    const d = new Date(ts);
    return (10 + (300 * (d.getHours() * 60 + d.getMinutes())) / 1440).toFixed(1);
  };
  const gaps = gapsOf(list).map((g) => {
    const from = Number(x(g.from.at));
    const width = Math.max(Number(x(g.to.at)) - from, 1).toFixed(1);
    return `<rect class="strip__gap strip__gap--${gapQuality(g.minutes, settings)}" x="${from}" y="18" width="${width}" height="8" rx="4"/>`;
  }).join('');
  const dots = list.map((f) => `<circle class="strip__dot" cx="${x(f.at)}" cy="22" r="6"/>`).join('');
  const labels = [0, 6, 12, 18, 24].map((h) => `<text class="strip__label" x="${10 + (300 * h) / 24}" y="41" text-anchor="middle">${h}</text>`).join('');
  return `<svg class="strip" viewBox="0 0 320 46" aria-hidden="true"><rect class="strip__base" x="10" y="18" width="300" height="8" rx="4"/>${gaps}${dots}${labels}</svg>`;
}

function renderMonth() {
  const { feedings, settings } = getState();
  const stats = monthStats(feedings, viewMonth.getFullYear(), viewMonth.getMonth(), settings);
  const streak = goodDayStreak(feedings, settings);
  els.monthStats.innerHTML = tilesHtml([
    { value: stats.total, label: 'кормлений' },
    { value: stats.avgPerDay ? stats.avgPerDay.toFixed(1).replace('.', ',') : '–', label: 'в день' },
    { value: stats.goodDays, label: 'хороших дней' },
  ]);
  els.monthNote.textContent = monthNote(stats, streak);
}

function monthNote(stats, streak) {
  if (!stats.total) return 'В этом месяце записей нет. Персик либо постился, либо приложение ещё не знало о нём.';
  if (streak >= 3) return `Серия хороших дней: ${formatCount(streak, ['день', 'дня', 'дней'])} подряд. Персик в восторге.`;
  if (stats.goodDays >= stats.activeDays * 0.7) return 'Почти все дни хорошие. Персик доволен режимом.';
  return 'Есть дни с опозданиями. Персик их не забыл.';
}
