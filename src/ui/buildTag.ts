/** Small DOM label in the corner showing the build, so playtest feedback can name a version. */
export function mountBuildTag(): void {
  const el = document.createElement('div');
  el.textContent = `Spellstick ${__BUILD_ID__}`;
  Object.assign(el.style, {
    position: 'fixed',
    right: '8px',
    bottom: '6px',
    font: '11px monospace',
    color: 'rgba(242, 239, 230, 0.45)',
    pointerEvents: 'none',
  });
  document.body.appendChild(el);
}
