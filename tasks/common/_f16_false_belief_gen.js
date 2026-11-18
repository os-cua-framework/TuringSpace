import * as M from './_false_belief_keys_model.js';
import * as G from './_false_belief_keys_gen.js';

export const NAME = 'f16_false_belief';
const KEEP = { A: 17, A2: 16, F: 17, F2: 16, M1: 12, M2: 11, M3: 11 };
const NEW_TEMPLATES = [
  { id: 'F2', kinds: 'PSPH', slots: 'VVVHH', expect: 2 },
  { id: 'M1', kinds: 'SSSP', slots: 'VVVVv', expect: 3 },
  { id: 'M2', kinds: 'PSSP', slots: 'VVVVv', expect: 3 },
  { id: 'M3', kinds: 'SPSP', slots: 'VVVVv', expect: 3 },
];
export const TEMPLATES = [...G.TEMPLATES.filter((t) => KEEP[t.id]), ...NEW_TEMPLATES].map((t) => ({ ...t, w: KEEP[t.id] }));
export const U_LIFT = 0.62, U_DROP1 = 0.4, U_DROP2 = 0.75;
export const NV = 4;
export const EXTRA = [{ th: [14, 18], dd: [1.55, 1.65] }, { th: [-24, -20], dd: [2.15, 2.25] }];

export function seedDraws(r0) {
  let u = r0.raw() * TEMPLATES.reduce((s, t) => s + t.w, 0), tpl = TEMPLATES[0];
  for (const t of TEMPLATES) { if (u < t.w) { tpl = t; break; } u -= t.w; }
  const nv = NV;
  return { tpl, flip: r0.sign(), hold: M.r2(0.8 + 0.7 * r0.raw()), colors: r0.sample(M.COLORS_X, nv + 2), slotV: r0.shuffle(Array.from({ length: nv }, (_, i) => i)), slotH: r0.shuffle([nv, nv + 1]), nv, extra: EXTRA };
}

export function frameList(m) {
  const segs = m.bob.segs, acts = segs.filter((s) => s.k === 'act'), fr = [];
  const at = (a, u) => M.r3(a.t0 + u * (a.t1 - a.t0));
  fr.push({ kind: 'start', tau: 0.35 });
  const d0 = acts[0];
  fr.push({ kind: 'drop1', tau: at(d0, U_DROP1), act: 0, move: -1, box: d0.box });
  fr.push({ kind: 'drop', tau: at(d0, U_DROP2), act: 0, move: -1, box: d0.box });
  for (let i = 1; i < acts.length; i += 2) {
    const lift = acts[i], drop = acts[i + 1], j = lift.move;
    fr.push({ kind: 'lift', tau: at(lift, U_LIFT), act: i, move: j, box: lift.box });
    const w = segs.findIndex((s) => s === drop) - 1, ws = segs[w];
    if (ws && ws.k === 'walk') fr.push({ kind: 'carry', tau: M.r3((ws.t0 + ws.t1) / 2), act: i + 1, move: j, box: drop.box });
    fr.push({ kind: 'drop', tau: at(drop, U_DROP2), act: i + 1, move: j, box: drop.box });
  }
  fr.push({ kind: 'final', tau: m.T });
  return fr;
}

export function frameFacts(m, f) {
  const b = M.bobAt(m, f.tau), down = M.annaDown(m, f.tau);
  const seg = m.bob.segs.filter((s) => s.k === 'act')[f.act ?? 0];
  let seen = null;
  if (f.act !== undefined) {
    const P = M.actPoints(m, seg);
    const los = M.losClear(m, P.lid, 0) && M.losClear(m, P.bob, 0) && M.losClear(m, P.head, 0);
    seen = down < 0.05 && los;
  }
  return { down, keys: b.keys, lids: b.lids, seen };
}

export function frameBelief(m) {
  let ans = -1;
  for (const f of frameList(m)) if (f.kind === 'drop') { const q = frameFacts(m, f); if (q.seen) ans = f.box; }
  return ans;
}

export function check(m) {
  const c = G.check({ ...m, task: M.NAME, live: true }); if (c !== null) return 'world:' + c;
  const F = frameList(m);
  if (F.length > 16 || F.length < 6) return 'n';
  for (let k = 1; k < F.length; k++) if (!(F[k].tau > F[k - 1].tau)) return 'order';
  for (let j = 0; j < m.kinds.length; j++) if (F.filter((f) => f.move === j).length < 2) return 'move-frames';
  const kinds = m.kinds.split('');
  for (const f of F) {
    if (f.move === undefined) continue;
    const q = frameFacts(m, f), kind = f.move < 0 ? 'S' : kinds[f.move];
    if (f.kind === 'carry') { if (kind === 'P' && !(q.down > 0.95)) return 'P-frame-up'; if (kind !== 'P' && !(q.down < 0.05)) return 'up-frame-down'; continue; }
    if (kind === 'S' && !q.seen) return 'S-frame-unseen';
    if (kind === 'P' && !(q.down > 0.95 && !q.seen)) return 'P-frame';
    if (kind === 'H' && !(q.down < 0.05 && !q.seen)) return 'H-frame';
  }
  for (const f of F) {
    const q = frameFacts(m, f);
    if (f.kind === 'lift' || f.kind === 'carry' || f.kind === 'start') { if (q.keys.where !== 'hand') return 'keys-hand'; }
    if (f.kind === 'drop' || f.kind === 'drop1') {
      if (f.kind === 'drop' && !(q.keys.where === 'box' && q.keys.box === f.box)) return 'keys-box';
      if (f.kind === 'drop1' && !(q.keys.where === 'hand')) return 'keys-drop1';
      if (!(q.lids[f.box] > 0.5 * M.LID_OPEN)) return 'lid-closed';
    }
    if (f.kind === 'lift' && !(q.lids[f.box] > 0.5 * M.LID_OPEN)) return 'lid-closed';
    if (f.kind === 'final' && q.lids.some((v) => v > 0.05)) return 'final-lids';
  }
  if (frameBelief(m) !== m.answer) return 'frame-answer';
  if (m.answer === m.seq[0] || m.answer === m.seq[m.seq.length - 1]) return 'first-or-final';
  const au = frameAudit(m);
  if (au.singleFrame) return 'single-frame';
  return null;
}

export function keysBoxAt(m, f) { const q = frameFacts(m, f); return q.keys.where === 'box' ? q.keys.box : -1; }
export function frameAudit(m) {
  const F = frameList(m), rd = F.map((f) => (f.kind === 'drop' ? f.box : keysBoxAt(m, f)));
  const last = M.keysBoxAt(m, m.T);
  const first = rd[0], blind = rd.filter((b) => b === m.answer).length / F.length;
  const bad = first === m.answer || last === m.answer || m.seq[0] === m.answer || m.seq[m.seq.length - 1] === m.answer || blind > 0.4;
  return { singleFrame: bad, firstFrame: first, lastFrame: last, blindShare: Math.round(blind * 100) / 100, n: F.length };
}
