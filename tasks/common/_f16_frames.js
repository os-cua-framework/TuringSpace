import { HINTS } from './_f16_hints.js';
export const DT = 1;
export const frameIdx = (m, t) => { const n = m.f16.taus.length; return ((Math.round(t / DT) % n) + n) % n; };
export const frameTau = (m, t) => m.f16.taus[frameIdx(m, t)];
export const framesOf = (m) => ({ n: m.f16.taus.length, period: m.f16.taus.length * DT });
export const oracleWaits = (n) => Array.from({ length: n - 1 }, () => ({ op: 'wait', sec: DT }));
export const r2 = (v) => Math.round(v * 100) / 100;
export const r3 = (v) => Math.round(v * 1000) / 1000;
export function mix32(a, b) { let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }
export function applyWait(st, a) {
  const sec = a.sec ?? DT;
  if (!(Number.isFinite(sec) && sec >= 0)) return { ok: false, reason: 'bad-sec' };
  st.t += sec; st.steps++;
  return { ok: true };
}
export function* attempts(task, key, max) {
  const h = HINTS[task]?.[key];
  if (Number.isInteger(h) && h >= 0 && h < max) yield h;
  for (let a = 0; a < max; a++) if (a !== h) yield a;
}
