const toast = document.getElementById('toast');
const textEl = document.getElementById('toast-text');
const actionEl = document.getElementById('toast-action');
let hideTimer = null;
let currentAction = null;

export function showToast(message, { actionLabel = '', onAction = null, duration = 5000 } = {}) {
  clearTimeout(hideTimer);
  textEl.textContent = message;
  actionEl.textContent = actionLabel;
  actionEl.hidden = !actionLabel;
  currentAction = onAction;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  hideTimer = setTimeout(hideToast, duration);
}

export function hideToast() {
  toast.classList.remove('is-visible');
  hideTimer = setTimeout(() => {
    toast.hidden = true;
  }, 250);
}

actionEl.addEventListener('click', () => {
  if (currentAction) currentAction();
  currentAction = null;
  hideToast();
});
