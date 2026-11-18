const SLOTS = 2;
const slots = [];
let cur = null;
export const opts = { off: false, trace: false };

function groupSig(g) {
  let s = g.bs.join(',');
  for (const p of g.opaque) s += '|' + (p.bb ? p.bb.join(',') : '') + (p.m ?? '');
  return s;
}

export function begin(sc, w, h, k) {
  if (opts.off) { cur = null; return null; }
  const key = [JSON.stringify(sc.cam), w, h, k, sc.Ld, JSON.stringify(sc.light), sc.env?.floorY ?? 0].map(String).join('/');
  let S = slots.find((s) => s.key === key);
  const all = [...sc.groups.map((g) => ['g' + g.id, g]), ...(sc.proxyGroups || []).map((g, i) => ['p' + i, g])];
  const sig = new Map(all.map(([id, g]) => [id, groupSig(g)])), bs = new Map(all.map(([id, g]) => [id, g.bs]));
  if (!S) {
    if (slots.length >= SLOTS) slots.shift();
    const n = w * h;
    S = { key, w, n, sid: new Int32Array(n).fill(-99999), xyz: new Float64Array(n * 3), base: new Float32Array(n * 3),
      out: new Float64Array(n * 3), fast: new Uint8Array(n), sig: new Map(), bs: new Map() };
    slots.push(S);
  }
  const moved = [];
  for (const [id, s] of sig) if (S.sig.get(id) !== s) { moved.push(bs.get(id)); if (S.bs.has(id)) moved.push(S.bs.get(id)); }
  for (const [id, b] of S.bs) if (!sig.has(id)) moved.push(b);
  S.moved = moved; S.sig = sig; S.bs = bs; S.L = sc.Ld; S.cone = Math.tan(sc.light?.soft || 0.04) * 1.5 + 0.02;
  cur = S;
  return S;
}
export function end() { cur = null; }

function touched(S, x, y, z) {
  const L = S.L;
  for (const b of S.moved) {
    const cx = b[0] - x, cy = b[1] - y, cz = b[2] - z, r = b[3], reach = r * 3.2 + 1e-3;
    if (cx * cx + cy * cy + cz * cz < reach * reach) return true;
    const t = cx * L[0] + cy * L[1] + cz * L[2];
    if (t < -r) continue;
    const ex = cx - t * L[0], ey = cy - t * L[1], ez = cz - t * L[2], lim = r + Math.max(0, t) * S.cone + 1e-3;
    if (ex * ex + ey * ey + ez * ez < lim * lim) return true;
  }
  return false;
}

export function shade(px, py, x, y, z, selfId, base, fast, out, fn) {
  const S = cur, i = py * S?.w + px;
  if (!S || !(i >= 0 && i < S.n)) { fn(out); return; }
  const j = i * 3;
  if (S.sid[i] === selfId && S.fast[i] === (fast ? 1 : 0) && S.xyz[j] === x && S.xyz[j + 1] === y && S.xyz[j + 2] === z &&
      S.base[j] === Math.fround(base[0]) && S.base[j + 1] === Math.fround(base[1]) && S.base[j + 2] === Math.fround(base[2]) && !touched(S, x, y, z)) {
    out[0] = S.out[j]; out[1] = S.out[j + 1]; out[2] = S.out[j + 2];
    return;
  }
  fn(out);
  S.sid[i] = selfId; S.fast[i] = fast ? 1 : 0; S.xyz[j] = x; S.xyz[j + 1] = y; S.xyz[j + 2] = z;
  S.base[j] = base[0]; S.base[j + 1] = base[1]; S.base[j + 2] = base[2];
  S.out[j] = out[0]; S.out[j + 1] = out[1]; S.out[j + 2] = out[2];
}

const CHUNK = 8;
export function chunkBy(list, sphOf, grow) {
  if (list.length <= CHUNK) return null;
  const out = [];
  for (let i = 0; i < list.length; i += CHUNK) {
    const part = list.slice(i, i + CHUNK), S = part.map(sphOf);
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const b of S) { x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); z0 = Math.min(z0, b[2]); x1 = Math.max(x1, b[0]); y1 = Math.max(y1, b[1]); z1 = Math.max(z1, b[2]); }
    const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    let r = 0; for (const b of S) r = Math.max(r, Math.hypot(b[0] - c[0], b[1] - c[1], b[2] - c[2]) + b[3] * grow);
    out.push({ bs: [c[0], c[1], c[2], r * (1 + 1e-9) + 1e-9], list: part });
  }
  return out;
}
