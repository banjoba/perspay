import { getState, addFeeding, removeFeeding } from '../store.js';
import { computeStatus } from '../status.js';
import { pickPhrase, pickTemplate, fillTemplate } from '../phrases.js';
import { formatDuration, formatTime, formatCount, formatDayTitle } from '../feeding.js';
import { burstConfetti } from '../components/confetti.js';
import { showToast } from '../components/toast.js';
import { openFeedingSheet } from '../sheets/feeding-sheet.js';
import { logItem, findFeeding, previousOf } from './log-item.js';

const els = {
  date: document.getElementById('home-date'),
  bubble: document.getElementById('bubble'),
  bubbleText: document.getElementById('bubble-text'),
  sticker: document.getElementById('hero-sticker'),
  pill: document.getElementById('status-pill'),
  ringWrap: document.getElementById('ring-wrap'),
  ring: document.querySelector('.ring'),
  progress: document.getElementById('ring-progress'),
  tickMin: document.getElementById('tick-min'),
  tickDue: document.getElementById('tick-due'),
  paw: document.getElementById('paw-btn'),
  pawLabel: document.getElementById('paw-label'),
  meta: document.getElementById('feed-meta'),
  next: document.getElementById('feed-next'),
  todayCount: document.getElementById('today-count'),
  todayLog: document.getElementById('today-log'),
  addManual: document.getElementById('add-manual'),
};

const CIRCUMFERENCE = 2 * Math.PI * 100;
const TONES = ['neutral', 'sage', 'peach', 'amber', 'coral', 'plum'];

let transient = null;
let transientTimer = null;
let transientSeq = 0;
let phrase = { key: null, template: '' };

export function initHome() {
  els.paw.addEventListener('click', onPawTap);
  els.addManual.addEventListener('click', () => openFeedingSheet(null));
  els.todayLog.addEventListener('click', onLogTap);
  els.bubble.addEventListener('click', () => {
    phrase = { key: null, template: '' };
    renderHome();
  });
  renderHome();
}

export function renderHome(now = Date.now()) {
  const state = getState();
  const status = computeStatus(state, now);
  const shown = transient && transient.until > now ? transient : null;
  els.date.textContent = formatDayTitle(new Date(now));
  renderHero(status, shown);
  renderRing(status);
  renderFeedBlock(status);
  renderTodayLog(state, status);
}

function renderHero(status, shown) {
  const stickerId = shown ? shown.sticker : status.sticker;
  const key = shown ? `transient:${shown.id}` : stickerId;
  if (phrase.key !== key) {
    phrase = { key, template: shown ? shown.phrase : pickTemplate(stickerId) };
    replay(els.bubble, 'is-swapping');
  }
  els.bubbleText.textContent = fillTemplate(phrase.template, { m: formatDuration(status.minutes ?? 0) });
  setSticker(stickerId);
  els.pill.textContent = shown ? shown.label : status.label;
  setTone(els.pill, 'pill', shown ? shown.tone : status.tone);
}

function setSticker(id) {
  const src = `stickers/${id}.webp`;
  if (els.sticker.getAttribute('src') === src) return;
  els.sticker.setAttribute('src', src);
  replay(els.sticker, 'is-swapping');
}

function setTone(el, prefix, tone) {
  TONES.forEach((t) => el.classList.remove(`${prefix}--${t}`));
  el.classList.add(`${prefix}--${tone}`);
}

function replay(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

function renderRing(status) {
  const { settings, fraction, minutes } = status;
  els.progress.style.strokeDashoffset = (CIRCUMFERENCE * (1 - fraction)).toFixed(2);
  els.progress.classList.toggle('is-over', minutes != null && minutes >= settings.urgentGapMin);
  setTone(els.ring, 'ring', status.tone);
  placeTick(els.tickMin, settings.minGapMin / settings.urgentGapMin);
  placeTick(els.tickDue, settings.dueGapMin / settings.urgentGapMin);
}

function placeTick(el, fraction) {
  const angle = Math.PI * 2 * fraction;
  el.setAttribute('cx', (110 + 100 * Math.cos(angle)).toFixed(1));
  el.setAttribute('cy', (110 + 100 * Math.sin(angle)).toFixed(1));
}

function renderFeedBlock(status) {
  const { last, minutes, settings, canFeed } = status;
  els.paw.classList.toggle('is-early', !canFeed);
  if (!last) {
    els.pawLabel.textContent = 'Первое кормление';
    els.meta.textContent = 'Персика ещё не кормили';
    els.next.textContent = 'Нажми лапку, когда он поест';
    return;
  }
  els.pawLabel.textContent = canFeed ? 'Покормить' : `Рано ещё · ${formatDuration(settings.minGapMin - minutes)}`;
  els.meta.textContent = `Последний раз в ${formatTime(last.at)} · ${formatDuration(minutes)} назад`;
  els.next.textContent = nextWindowText(last.at, minutes, settings);
}

function nextWindowText(lastAt, minutes, settings) {
  const at = (gapMin) => formatTime(lastAt + gapMin * 60000);
  if (minutes < settings.minGapMin) return `Можно с ${at(settings.minGapMin)} · пора к ${at(settings.dueGapMin)}`;
  if (minutes < settings.dueGapMin) return `Пора к ${at(settings.dueGapMin)} · обязательно до ${at(settings.urgentGapMin)}`;
  if (minutes < settings.urgentGapMin) return `Обязательно до ${at(settings.urgentGapMin)}`;
  return `Опоздание ${formatDuration(minutes - settings.urgentGapMin)}`;
}

function renderTodayLog(state, status) {
  const { today, settings } = status;
  els.todayCount.textContent = today.length ? formatCount(today.length, ['кормление', 'кормления', 'кормлений']) : 'пока пусто';
  if (!today.length) {
    els.todayLog.innerHTML = '<li class="log__empty">Сегодня записей нет. Лапка ждёт.</li>';
    return;
  }
  els.todayLog.innerHTML = today.map((f) => logItem(f, previousOf(state.feedings, f), settings)).join('');
}

function onLogTap(e) {
  const button = e.target.closest('[data-id]');
  if (!button) return;
  const feeding = findFeeding(getState().feedings, button.dataset.id);
  if (feeding) openFeedingSheet(feeding);
}

function onPawTap() {
  const status = computeStatus(getState());
  if (!status.canFeed) {
    refuse(status);
    return;
  }
  const at = Date.now();
  setTransient({ sticker: 'eating', phrase: pickPhrase('eating', { t: formatTime(at) }), label: 'Ням', tone: 'sage' }, 5000);
  const feeding = addFeeding(at);
  burstConfetti(els.ringWrap);
  showToast(`Покормлен в ${formatTime(at)}`, { actionLabel: 'Отменить', onAction: () => removeFeeding(feeding.id) });
}

function refuse(status) {
  const phraseText = pickPhrase('sly', { m: formatDuration(status.minutes) });
  setTransient({ sticker: 'sly', phrase: phraseText, label: 'Рано', tone: 'peach' }, 4500);
  replay(els.paw, 'is-shaking');
  renderHome();
}

function setTransient(data, ms) {
  clearTimeout(transientTimer);
  transientSeq += 1;
  transient = { ...data, id: transientSeq, until: Date.now() + ms };
  transientTimer = setTimeout(() => {
    transient = null;
    renderHome();
  }, ms + 20);
}
