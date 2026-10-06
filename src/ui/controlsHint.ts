/** One-line controls reminder under the rink. Replaced by the real controls card in M6. */
export function mountControlsHint(text: string): void {
  const el = document.createElement('div');
  el.textContent = text;
  Object.assign(el.style, {
    position: 'fixed',
    left: '50%',
    bottom: '6px',
    transform: 'translateX(-50%)',
    font: '13px system-ui, sans-serif',
    color: 'rgba(242, 239, 230, 0.7)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  });
  document.body.appendChild(el);
}
