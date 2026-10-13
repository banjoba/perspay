const backdrop = document.getElementById('sheet');
const panel = backdrop.querySelector('.sheet');
let closeTimer = null;

export function openSheet(html, onOpen) {
  clearTimeout(closeTimer);
  panel.innerHTML = `<div class="sheet__grab"></div>${html}`;
  panel.style.transform = '';
  backdrop.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => backdrop.classList.add('is-open')));
  if (onOpen) onOpen(panel);
}

export function closeSheet() {
  backdrop.classList.remove('is-open');
  closeTimer = setTimeout(() => {
    backdrop.hidden = true;
    panel.innerHTML = '';
  }, 300);
}

export function isSheetOpen() {
  return !backdrop.hidden;
}

backdrop.addEventListener('click', (e) => {
  if (e.target === backdrop) closeSheet();
});

let dragStartY = null;

panel.addEventListener('touchstart', (e) => {
  if (panel.scrollTop > 0) return;
  dragStartY = e.touches[0].clientY;
}, { passive: true });

panel.addEventListener('touchmove', (e) => {
  if (dragStartY == null) return;
  const dy = e.touches[0].clientY - dragStartY;
  if (dy <= 0) return;
  panel.classList.add('is-dragging');
  panel.style.transform = `translateY(${dy}px)`;
}, { passive: true });

panel.addEventListener('touchend', (e) => {
  if (dragStartY == null) return;
  const dy = e.changedTouches[0].clientY - dragStartY;
  panel.classList.remove('is-dragging');
  dragStartY = null;
  if (dy > 90) {
    closeSheet();
  } else {
    panel.style.transform = '';
  }
});
