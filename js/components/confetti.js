const COLORS = ['#F6B79A', '#F2A07C', '#9DC3A2', '#F0C06F', '#F4C6D0', '#B49BCB'];

export function burstConfetti(container, count = 18) {
  for (let i = 0; i < count; i += 1) {
    const piece = document.createElement('i');
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const distance = 90 + Math.random() * 70;
    piece.className = 'confetti';
    piece.style.background = COLORS[i % COLORS.length];
    piece.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    piece.style.setProperty('--dy', `${Math.sin(angle) * distance - 30}px`);
    piece.style.setProperty('--rot', `${Math.round(Math.random() * 540 - 270)}deg`);
    container.appendChild(piece);
    piece.addEventListener('animationend', () => piece.remove());
  }
}
