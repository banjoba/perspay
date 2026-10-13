export const PHASE_ORDER = ['none', 'fresh', 'full', 'ok', 'due', 'urgent', 'critical', 'shock'];
const MS_PER_MIN = 60000;

export function lastFeedingBefore(feedings, now) {
  let last = null;
  for (const f of feedings) {
    if (f.at <= now && (!last || f.at > last.at)) last = f;
  }
  return last;
}

export function minutesBetween(fromTs, toTs) {
  return Math.floor((toTs - fromTs) / MS_PER_MIN);
}

export function phaseFor(minutes, settings) {
  if (minutes == null) return 'none';
  if (minutes < 30) return 'fresh';
  if (minutes < settings.minGapMin) return 'full';
  if (minutes < settings.dueGapMin) return 'ok';
  if (minutes < settings.urgentGapMin) return 'due';
  if (minutes < settings.urgentGapMin + 60) return 'urgent';
  if (minutes < settings.urgentGapMin + 120) return 'critical';
  return 'shock';
}

export function isAtLeast(phase, other) {
  return PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf(other);
}

export function isQuietHour(date, settings) {
  if (!settings.quietEnabled) return false;
  const hour = date.getHours();
  const { quietStartHour: start, quietEndHour: end } = settings;
  if (start === end) return false;
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

export function isMorning(date, settings) {
  const hour = date.getHours();
  return hour >= settings.quietEndHour && hour < settings.quietEndHour + 3;
}

const pad = (n) => String(n).padStart(2, '0');

export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function feedingsOfDay(feedings, key) {
  return feedings.filter((f) => dayKey(f.at) === key).sort((a, b) => a.at - b.at);
}

export function gapsOf(dayFeedings) {
  return dayFeedings.slice(1).map((f, i) => ({
    from: dayFeedings[i],
    to: f,
    minutes: minutesBetween(dayFeedings[i].at, f.at),
  }));
}

export function gapQuality(minutes, settings) {
  if (minutes < settings.minGapMin) return 'early';
  if (minutes <= settings.urgentGapMin) return 'good';
  if (minutes <= settings.urgentGapMin + 60) return 'late';
  return 'bad';
}

export function dayQuality(dayFeedings, settings) {
  if (!dayFeedings.length) return 'empty';
  const qualities = gapsOf(dayFeedings).map((g) => gapQuality(g.minutes, settings));
  if (qualities.some((q) => q === 'bad' || q === 'early')) return 'bad';
  if (qualities.some((q) => q === 'late')) return 'meh';
  return dayFeedings.length >= 2 ? 'good' : 'meh';
}

export function dayStats(dayFeedings, settings) {
  const gaps = gapsOf(dayFeedings).map((g) => g.minutes);
  const avgGap = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;
  const maxGap = gaps.length ? Math.max(...gaps) : null;
  return { count: dayFeedings.length, avgGap, maxGap, quality: dayQuality(dayFeedings, settings) };
}

export function monthStats(feedings, year, month, settings, now = Date.now()) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = dayKey(now);
  let total = 0;
  let activeDays = 0;
  let goodDays = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = dayKey(new Date(year, month, day).getTime());
    if (key > todayKey) break;
    const list = feedingsOfDay(feedings, key);
    if (!list.length) continue;
    activeDays += 1;
    total += list.length;
    if (dayQuality(list, settings) === 'good') goodDays += 1;
  }
  return { total, activeDays, goodDays, avgPerDay: activeDays ? total / activeDays : 0 };
}

export function goodDayStreak(feedings, settings, now = Date.now()) {
  let streak = 0;
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  const todayList = feedingsOfDay(feedings, dayKey(cursor.getTime()));
  if (dayQuality(todayList, settings) !== 'good') cursor.setDate(cursor.getDate() - 1);
  for (let i = 0; i < 366; i += 1) {
    const list = feedingsOfDay(feedings, dayKey(cursor.getTime()));
    if (dayQuality(list, settings) !== 'good') break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function plural(n, forms) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

export function formatDuration(minutes) {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!total) return 'меньше минуты';
  if (hours && rest) return `${hours} ч ${rest} мин`;
  if (hours) return `${hours} ч`;
  return `${rest} мин`;
}

export function formatClock(minutes) {
  const total = Math.max(0, Math.round(minutes));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function formatHours(minutes) {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1).replace('.', ',')} ч`;
}

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function formatDayTitle(date) {
  return capitalize(date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }));
}

export function formatMonthTitle(date) {
  const raw = date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return capitalize(raw.replace(/\s*г\.$/, ''));
}

export function formatCount(n, forms) {
  return `${n} ${plural(n, forms)}`;
}
