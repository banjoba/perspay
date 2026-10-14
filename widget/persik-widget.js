// PERSIK_WIDGET v5 — Scriptable widget for the Persik feeding diary.
// Runs inside the stub copied from the app; TOKEN comes from the stub or the widget parameter.
// Tapping the widget opens Scriptable in app mode and feeds right away: POST /feed (the server
// enforces the minimum gap) → short result → the app merges the feeding on its next open.
// «Открыть дневник» runs the Shortcut named OPEN_SHORTCUT (opens the home-screen app); empty = Safari.
const SYNC_BASE = "https://185-173-144-167.sslip.io/persik/";
const STICKER_BASE = "https://banjoba.github.io/perspay/stickerpack/persik-";
const APP_URL = "https://banjoba.github.io/perspay/";
const REFRESH_MINUTES = 5;

const token = (typeof TOKEN !== "undefined" && TOKEN) || args.widgetParameter || "";
const shortcutName = typeof OPEN_SHORTCUT === "undefined" ? "Персик" : OPEN_SHORTCUT;
const OPEN_URL = shortcutName ? `shortcuts://run-shortcut?name=${encodeURIComponent(shortcutName)}` : APP_URL;
const fm = FileManager.local();
const family = config.widgetFamily || "medium";

const COLORS = {
  bg: Color.dynamic(new Color("#FBF4EA"), new Color("#221B17")),
  text: Color.dynamic(new Color("#4A3A2F"), new Color("#F3E9DE")),
  muted: Color.dynamic(new Color("#8C7A6B"), new Color("#BEAC9C")),
  sage: new Color("#6FA276"),
  peach: new Color("#E58A5F"),
  amber: new Color("#C9931E"),
  coral: new Color("#D9604A"),
  plum: new Color("#8E6FAE"),
};

const PHASES = [
  { id: "fresh", label: "Сытый", tone: "sage", sticker: "fed" },
  { id: "full", label: "Сытый", tone: "sage", sticker: "full" },
  { id: "ok", label: "Можно", tone: "peach", sticker: "ok" },
  { id: "due", label: "Пора", tone: "amber", sticker: "due" },
  { id: "urgent", label: "Срочно", tone: "coral", sticker: "urgent" },
  { id: "critical", label: "Критично", tone: "coral", sticker: "critical" },
  { id: "shock", label: "Шок", tone: "coral", sticker: "shocked" },
];

function phaseFor(minutes, s) {
  if (minutes < 30) return PHASES[0];
  if (minutes < s.minGapMin) return PHASES[1];
  if (minutes < s.dueGapMin) return PHASES[2];
  if (minutes < s.urgentGapMin) return PHASES[3];
  if (minutes < s.urgentGapMin + 60) return PHASES[4];
  if (minutes < s.urgentGapMin + 120) return PHASES[5];
  return PHASES[6];
}

function isQuiet(date, s) {
  if (!s.quietEnabled || s.quietStartHour === s.quietEndHour) return false;
  const h = date.getHours();
  return s.quietStartHour > s.quietEndHour
    ? h >= s.quietStartHour || h < s.quietEndHour
    : h >= s.quietStartHour && h < s.quietEndHour;
}

function clock(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function duration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
}

async function loadState() {
  const cachePath = fm.joinPath(fm.cacheDirectory(), `persik-state-${token.slice(0, 8)}.json`);
  try {
    const req = new Request(SYNC_BASE + token);
    req.timeoutInterval = 10;
    const data = await req.loadJSON();
    const status = req.response ? req.response.statusCode : 200;
    if (status === 404 || !data || !Array.isArray(data.feedings)) return { data: null, reason: "nodata" };
    if (!data.feedings.length) return { data: null, reason: "nofeedings" };
    fm.writeString(cachePath, JSON.stringify(data));
    return { data, offline: false };
  } catch (e) {
    if (fm.fileExists(cachePath)) return { data: JSON.parse(fm.readString(cachePath)), offline: true };
    return { data: null, reason: "offline" };
  }
}

async function loadSticker(id) {
  const path = fm.joinPath(fm.cacheDirectory(), `persik-sticker-${id}.png`);
  if (fm.fileExists(path)) return fm.readImage(path);
  try {
    const req = new Request(`${STICKER_BASE}${id}.png`);
    req.timeoutInterval = 10;
    const img = await req.loadImage();
    fm.writeImage(path, img);
    return img;
  } catch (e) {
    return null;
  }
}

function describe(data, now) {
  const s = Object.assign({ minGapMin: 120, dueGapMin: 180, urgentGapMin: 240, quietEnabled: true, quietStartHour: 0, quietEndHour: 7 }, data.settings || {});
  const past = data.feedings.filter((f) => f.at <= now.getTime());
  if (!past.length) return { label: "Нет записей", tone: "plum", sticker: "detective", detail: "Нажми лапку в приложении", last: null };
  const last = past.reduce((a, b) => (a.at > b.at ? a : b));
  const minutes = Math.floor((now.getTime() - last.at) / 60000);
  const phase = phaseFor(minutes, s);
  const quiet = isQuiet(now, s);
  const at = (gap) => clock(last.at + gap * 60000);
  let detail;
  if (minutes < s.minGapMin) detail = `Можно с ${at(s.minGapMin)}`;
  else if (minutes < s.dueGapMin) detail = `Пора к ${at(s.dueGapMin)}`;
  else if (minutes < s.urgentGapMin) detail = `Обязательно до ${at(s.urgentGapMin)}`;
  else detail = `Опоздание ${duration(minutes - s.urgentGapMin)}`;
  return {
    label: quiet ? "Спит" : phase.label,
    tone: quiet ? "plum" : phase.tone,
    sticker: quiet ? "night" : phase.sticker,
    detail: quiet ? "Ночь, утром завтрак" : detail,
    last,
    minutes,
    todayCount: past.filter((f) => new Date(f.at).toDateString() === now.toDateString()).length,
  };
}

async function feedNow() {
  const req = new Request(`${SYNC_BASE}${token}/feed`);
  req.method = "POST";
  req.headers = { "Content-Type": "text/plain" };
  req.body = "{}";
  req.timeoutInterval = 10;
  try {
    return await req.loadJSON();
  } catch (e) {
    return { ok: false, message: "Нет связи с сервером, попробуй ещё раз" };
  }
}

async function runInApp() {
  if (!token) {
    await showResult("Нет кода", "Скопируй скрипт из приложения: Персик → Виджет на экране");
    return;
  }
  const result = await feedNow();
  const openDiary = await showResult(result.ok ? "Ням!" : "Рано", result.message || "");
  if (openDiary) Safari.open(OPEN_URL);
}

async function showResult(title, message) {
  const done = new Alert();
  done.title = title;
  done.message = message;
  done.addAction("Готово");
  done.addAction("Открыть дневник");
  return (await done.presentAlert()) === 1;
}

function addTimer(stack, last, size) {
  const t = last ? stack.addDate(new Date(last.at)) : stack.addText("—");
  if (last) t.applyTimerStyle();
  t.font = Font.boldRoundedSystemFont(size);
  t.textColor = COLORS.text;
  t.minimumScaleFactor = 0.6;
  t.lineLimit = 1;
  return t;
}

function addLabel(stack, text, size, color, bold) {
  const t = stack.addText(text);
  t.font = bold ? Font.boldRoundedSystemFont(size) : Font.mediumRoundedSystemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
  return t;
}

async function buildHome(info, offline) {
  const w = new ListWidget();
  w.backgroundColor = COLORS.bg;
  w.setPadding(14, 14, 12, 14);
  const toneColor = COLORS[info.tone] || COLORS.muted;
  const sticker = await loadSticker(info.sticker);
  const small = family === "small";

  const row = w.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  if (sticker) {
    const img = row.addImage(sticker);
    img.imageSize = small ? new Size(54, 54) : new Size(96, 96);
    row.addSpacer(small ? 8 : 14);
  }
  const col = row.addStack();
  col.layoutVertically();
  addLabel(col, "Персик", small ? 11 : 12, COLORS.muted, true);
  addLabel(col, info.label.toUpperCase(), small ? 15 : 20, toneColor, true);
  addTimer(col, info.last, small ? 22 : 30);
  if (!small) {
    addLabel(col, info.last ? `Ел в ${clock(info.last.at)} · ${info.detail}` : info.detail, 12, COLORS.muted, false);
  }
  w.addSpacer();
  const footer = w.addStack();
  footer.layoutHorizontally();
  addLabel(footer, small ? info.detail : `Сегодня: ${info.todayCount ?? 0}`, 11, COLORS.muted, false);
  footer.addSpacer();
  addLabel(footer, offline ? "офлайн" : clock(Date.now()), 10, COLORS.muted, false);
  return w;
}

function buildAccessory(info) {
  const w = new ListWidget();
  if (family === "accessoryCircular") {
    w.addAccessoryWidgetBackground = true;
    const st = w.addStack();
    st.layoutVertically();
    st.centerAlignContent();
    addLabel(st, "🐾", 14, COLORS.text, true);
    addLabel(st, info.label, 11, COLORS.text, true);
    return w;
  }
  const st = w.addStack();
  st.layoutVertically();
  addLabel(st, `Персик · ${info.label}`, 13, COLORS.text, true);
  const t = addTimer(st, info.last, 16);
  t.textColor = COLORS.text;
  addLabel(st, info.detail, 11, COLORS.text, false);
  return w;
}

function buildMessage(title, text) {
  const w = new ListWidget();
  w.backgroundColor = COLORS.bg;
  w.setPadding(14, 14, 14, 14);
  addLabel(w, "Персик", 12, COLORS.muted, true);
  addLabel(w, title, 16, COLORS.text, true);
  const t = w.addText(text);
  t.font = Font.mediumRoundedSystemFont(12);
  t.textColor = COLORS.muted;
  return w;
}

async function main() {
  if (config.runsInApp) {
    await runInApp();
    Script.complete();
    return;
  }
  let widget;
  if (!token) {
    widget = buildMessage("Нет кода", "Скопируй скрипт из приложения: Персик → Виджет на экране");
  } else {
    const { data, offline, reason } = await loadState();
    if (!data && reason === "offline") {
      widget = buildMessage("Нет связи", "Проверь интернет, виджет обновится сам");
    } else if (!data) {
      widget = buildMessage("Записей по коду нет", "Включи синхронизацию в том приложении, где ведёшь дневник, и скопируй скрипт заново");
    } else {
      const info = describe(data, new Date());
      widget = family.startsWith("accessory") ? buildAccessory(info) : await buildHome(info, offline);
    }
  }
  widget.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60000);
  Script.setWidget(widget);
  Script.complete();
}

await main();
