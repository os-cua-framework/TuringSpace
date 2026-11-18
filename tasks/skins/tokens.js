export const COLOR = Object.freeze({
  ink: '#263746', muted: '#627485', accent: '#1677b8', danger: '#c94c4c',
  success: '#269d6d', paper: '#f7f9fa', line: '#c9d5dd', data: ['#3d8fd1', '#e06d58', '#4ca578', '#d9a43a', '#8c6cc4', '#4f9da6'],
});
export const SPACE = Object.freeze({ xs: 4, sm: 8, md: 12, lg: 16 });
export const RADIUS = Object.freeze({ chip: 5, card: 8, panel: 10 });
export const LABEL = Object.freeze({ font: 'system-ui, -apple-system, sans-serif', size: 10, weight: 700, tracking: '.04em' });

export function card(g, r, { selected = false, fill = COLOR.paper } = {}) {
  g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, RADIUS.card);
  g.fillStyle = fill; g.fill(); g.strokeStyle = selected ? COLOR.accent : COLOR.line;
  g.lineWidth = selected ? 2 : 1; g.stroke(); g.lineWidth = 1;
}
export function chip(g, r, text, selected = false) {
  card(g, r, { selected, fill: selected ? '#e7f4ff' : '#fff' });
  g.fillStyle = selected ? COLOR.accent : COLOR.muted;
  g.font = `${LABEL.weight} ${LABEL.size}px ${LABEL.font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, r.x + r.w / 2, r.y + r.h / 2 + .5);
}
