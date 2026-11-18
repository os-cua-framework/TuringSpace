import { rr, UI_FONT } from './panel.js';

export const MAX_ANIM = 0.6;

export const CLOCK = { paused: false, epoch: 0, step: false };
export function setClockPaused(p) { if (CLOCK.step) p = true; if (CLOCK.paused && !p) CLOCK.epoch++; CLOCK.paused = !!p; }

export function clockState() { return { t: 0, steps: 0 }; }

export function visT(env) {
  const c = env._clk, t = env.state?.t ?? 0;
  if (env.manifest?.live) return t;
  if (!c || !(c.vis <= t)) return t;
  return c.vis;
}

export function tickClock(env, dt, opts = {}) {
  const st = env.state, m = env.manifest;
  if (!st) return false;
  if (!env._clk) env._clk = { vis: st.t };
  const c = env._clk;
  let active = false;
  if (m?.live && !env.submitted && (opts.running ? opts.running(env) : true)) {
    const now = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
    if (CLOCK.paused) { c.wall = null; c.vis = st.t; return false; }
    if (c.epoch !== CLOCK.epoch) { c.epoch = CLOCK.epoch; c.wall = null; }
    const wdt = c.wall != null ? Math.min(0.25, Math.max(0, now - c.wall)) : 0;
    c.wall = now; dt = wdt * (m.liveRate ?? 1);
    const t0 = st.t, t1 = Math.min(opts.tMax ?? Infinity, st.t + dt);
    if (t1 > t0) { st.t = t1; opts.onLive?.(env, t0, t1); active = true; }
    c.vis = st.t;
    return active || (opts.running ? opts.running(env) : true);
  }
  if (c.vis > st.t) c.vis = st.t;
  if (c.vis < st.t) {
    if (c.target !== st.t) { c.target = st.t; c.speed = Math.max(1, (st.t - c.vis) / MAX_ANIM); }
    c.vis = Math.min(st.t, c.vis + dt * (c.speed || 1));
    active = true;
  }
  return active;
}
export const busy = (env) => !!env._clk && env._clk.vis < (env.state?.t ?? 0);
export function jump(env) { if (env._clk) env._clk.vis = env.state.t; }

export function buttonRects(defs, area, gap = 8) {
  const w = (area.w - (defs.length - 1) * gap) / defs.length;
  return defs.map((d, i) => ({ ...d, x: area.x + i * (w + gap), y: area.y, w, h: area.h }));
}
export function hitButton(rects, x, y) {
  return rects.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null;
}
export function drawButtons(g, rects, disabled = () => false) {
  for (const b of rects) {
    const off = disabled(b);
    rr(g, b.x, b.y, b.w, b.h, 9); g.fillStyle = off ? '#f4f5f7' : '#eef2f6'; g.fill();
    g.strokeStyle = off ? '#dde1e6' : '#c8d0d8'; g.lineWidth = 1; g.stroke();
    const col = off ? '#b5bcc4' : '#3c4955';
    g.save();
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round';
    g.font = `700 12px ${UI_FONT}`; g.textBaseline = 'middle';
    const tw = g.measureText(b.label || '').width, iw = b.icon ? 18 : 0, gapI = b.icon && b.label ? 7 : 0;
    const x0 = b.x + (b.w - (iw + gapI + tw)) / 2, cy = b.y + b.h / 2;
    if (b.icon) icon(g, b.icon, x0 + iw / 2, cy);
    g.textAlign = 'left'; if (b.label) g.fillText(b.label, x0 + iw + gapI, cy + 0.5);
    g.restore();
  }
}
export function icon(g, kind, cx, cy) {
  if (kind === 'wait') {
    g.beginPath(); g.arc(cx, cy, 7.5, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(cx, cy - 4.5); g.lineTo(cx, cy); g.lineTo(cx + 3.5, cy + 2.2); g.stroke();
  } else if (kind === 'stop') {
    rr(g, cx - 6, cy - 6, 12, 12, 2); g.fill();
  } else if (kind === 'play') {
    g.beginPath(); g.moveTo(cx - 5, cy - 7); g.lineTo(cx + 7, cy); g.lineTo(cx - 5, cy + 7); g.closePath(); g.fill();
  } else if (kind === 'up' || kind === 'down' || kind === 'left' || kind === 'right') {
    const a = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }[kind], c = Math.cos(a), s = Math.sin(a);
    const P = (u, v) => [cx + u * c - v * s, cy + u * s + v * c];
    g.beginPath(); g.moveTo(...P(-7, 0)); g.lineTo(...P(5, 0)); g.stroke();
    g.beginPath(); g.moveTo(...P(8, 0)); g.lineTo(...P(2, -5)); g.lineTo(...P(2, 5)); g.closePath(); g.fill();
  } else if (kind === 'prev' || kind === 'next') {
    const s = kind === 'next' ? 1 : -1;
    g.beginPath(); g.moveTo(cx - s * 5, cy - 6); g.lineTo(cx + s * 4, cy); g.lineTo(cx - s * 5, cy + 6); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(cx + s * 6, cy - 6); g.lineTo(cx + s * 6, cy + 6); g.stroke();
  }
}

export function drawScrub(g, r, frac, locked = false) {
  const ty = r.y + r.h / 2, x0 = r.x + 10, x1 = r.x + r.w - 10;
  g.save();
  rr(g, x0, ty - 3, x1 - x0, 6, 3); g.fillStyle = '#e1e6ec'; g.fill();
  const kx = x0 + (x1 - x0) * Math.max(0, Math.min(1, frac));
  rr(g, x0, ty - 3, kx - x0, 6, 3); g.fillStyle = locked ? '#b5bcc4' : '#7f9bb8'; g.fill();
  g.beginPath(); g.arc(kx, ty, 9, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
  g.lineWidth = 2; g.strokeStyle = locked ? '#b5bcc4' : '#3c4955'; g.stroke();
  g.restore();
}
export function scrubFrame(r, x, nFrames) {
  const x0 = r.x + 10, x1 = r.x + r.w - 10, u = Math.max(0, Math.min(1, (x - x0) / (x1 - x0)));
  return Math.round(u * (nFrames - 1));
}
export const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
