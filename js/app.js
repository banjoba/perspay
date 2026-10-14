import { subscribe } from './store.js';
import { initHome, renderHome } from './views/home.js';
import { initDiary, renderDiary } from './views/diary.js';
import { initPersik, renderPersik } from './views/persik.js';
import { initSync } from './sync.js';

const APP_VERSION = '7';
const VIEW_KEY = 'perspay.view';
const HINT_KEY = 'perspay.installHintDismissed';
const tabs = [...document.querySelectorAll('.tab')];
const views = {
  home: document.getElementById('view-home'),
  diary: document.getElementById('view-diary'),
  persik: document.getElementById('view-persik'),
};

function showView(name) {
  const target = views[name] ? name : 'home';
  Object.entries(views).forEach(([key, el]) => el.classList.toggle('is-active', key === target));
  tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.view === target));
  try {
    sessionStorage.setItem(VIEW_KEY, target);
  } catch {
    /* ignore */
  }
}

function readSaved(key) {
  try {
    return sessionStorage.getItem(key) || localStorage.getItem(key);
  } catch {
    return null;
  }
}

function renderAll() {
  renderHome();
  renderDiary();
  renderPersik();
}

function initInstallHint() {
  const hint = document.getElementById('install-hint');
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  if (!isIos || standalone || readSaved(HINT_KEY)) return;
  hint.hidden = false;
  document.getElementById('install-close').addEventListener('click', () => {
    hint.hidden = true;
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      /* ignore */
    }
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => reg.update()).catch(() => {});
}

function showVersion() {
  const about = document.querySelector('.about');
  if (about) about.textContent = `perspay v${APP_VERSION} · дневник кормления Персика`;
}

initSync();
initHome();
initDiary();
initPersik();
tabs.forEach((tab) => tab.addEventListener('click', () => showView(tab.dataset.view)));
showView(readSaved(VIEW_KEY) || 'home');
subscribe(renderAll);
setInterval(renderAll, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) renderAll();
});
window.addEventListener('pageshow', renderAll);
initInstallHint();
showVersion();
registerServiceWorker();
