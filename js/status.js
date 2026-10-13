import {
  lastFeedingBefore, minutesBetween, phaseFor, isAtLeast, isQuietHour, isMorning,
  dayKey, feedingsOfDay, dayQuality,
} from './feeding.js';

const PHASE_STICKER = {
  none: 'detective',
  fresh: 'fed',
  full: 'full',
  ok: 'ok',
  due: 'due',
  urgent: 'urgent',
  critical: 'critical',
  shock: 'shocked',
};

const PHASE_LABEL = {
  none: 'Нет записей',
  fresh: 'Сытый',
  full: 'Сытый',
  ok: 'Можно',
  due: 'Пора',
  urgent: 'Срочно',
  critical: 'Критично',
  shock: 'Шок',
};

const PHASE_TONE = {
  none: 'neutral',
  fresh: 'sage',
  full: 'sage',
  ok: 'peach',
  due: 'amber',
  urgent: 'coral',
  critical: 'coral',
  shock: 'coral',
};

function pickSticker({ phase, minutes, quiet, morning, today, todayQuality, settings }) {
  if (phase === 'none') return 'detective';
  if (quiet) return 'night';
  if (morning && isAtLeast(phase, 'due')) return 'morning';
  if (phase === 'fresh' && todayQuality === 'good' && today.length >= 3) return 'party';
  if (phase === 'full' && minutes >= settings.minGapMin - 20) return 'waiting';
  return PHASE_STICKER[phase];
}

export function computeStatus(state, now = Date.now()) {
  const { feedings, settings } = state;
  const last = lastFeedingBefore(feedings, now);
  const minutes = last ? minutesBetween(last.at, now) : null;
  const phase = phaseFor(minutes, settings);
  const date = new Date(now);
  const quiet = isQuietHour(date, settings) && phase !== 'none';
  const morning = isMorning(date, settings);
  const today = feedingsOfDay(feedings, dayKey(now));
  const todayQuality = dayQuality(today, settings);
  const sticker = pickSticker({ phase, minutes, quiet, morning, today, todayQuality, settings });
  return {
    now,
    last,
    minutes,
    phase,
    quiet,
    today,
    todayQuality,
    sticker,
    settings,
    label: quiet ? 'Спит' : PHASE_LABEL[phase],
    tone: quiet ? 'plum' : PHASE_TONE[phase],
    fraction: minutes == null ? 0 : Math.min(minutes / settings.urgentGapMin, 1),
    canFeed: minutes == null || minutes >= settings.minGapMin,
  };
}
