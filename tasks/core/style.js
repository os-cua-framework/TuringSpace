export function parseStyle(param, seed) {
  if (!param) return null;
  const m = /^(train|test)(?::(\d+))?$/.exec(String(param));
  if (!m) return null;
  return { split: m[1], n: m[2] ? Number(m[2]) : Number(seed) };
}

export function hash32(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
function affinePerm(N, seed) {
  if (N <= 1) return () => 0;
  let a = 1 + (seed % (N - 1 || 1));
  while (gcd(a, N) !== 1) a = (a % (N - 1)) + 1;
  const b = (seed >>> 8) % N;
  return (i) => ((a * (i % N)) % N + b) % N;
}

export function splitIds(pool, ids, minTest = 1) {
  const n = ids.length;
  const h = ids.map((id) => [id, hash32(`${pool}|${id}`)]);
  const byHash = h.slice().sort((x, y) => x[1] - y[1]);
  const lo = n >= 4 ? Math.max(minTest, 2) : n >= 2 ? 1 : 0;
  const hi = n >= 4 ? n - 2 : Math.max(0, n - 1);
  const need = Math.min(lo, hi);
  const test = new Set(h.filter(([, v]) => v % 10 === 0).map(([id]) => id));
  for (const [id] of byHash) { if (test.size >= need) break; test.add(id); }
  for (const [id] of byHash.slice().reverse()) { if (test.size <= hi) break; test.delete(id); }
  return (id) => (test.has(id) ? 'test' : 'train');
}

export function nthOf(key, n, N) {
  return affinePerm(N, hash32(key))(((Number(n) - 1) % N + N) % N);
}

export function makeStyle(taskName, spec, poolIndex) {
  const key = `${taskName}|${spec.split}|${spec.n}`;
  const rnd = prng(hash32(key + '|style'));
  const used = [];
  const inSplit = (items) => items.filter((a) => a.split === spec.split);
  const style = {
    key, split: spec.split, n: spec.n, used, rand: rnd,
    pool(name, filter = () => true) { return inSplit(poolIndex.pools[name] || []).filter(filter); },
    primary(name, filter) {
      const items = this.pool(name, filter);
      if (!items.length) return null;
      const it = items[affinePerm(items.length, hash32(`${taskName}|${spec.split}|${name}|perm`))(spec.n - 1)];
      used.push(`${name}:${it.id}`);
      return it;
    },
    primaryCombo(tag, sizes) {
      const N = sizes.reduce((p, s) => p * s, 1);
      let k = affinePerm(N, hash32(`${taskName}|${spec.split}|${tag}|perm`))(spec.n - 1);
      return sizes.map((s) => { const v = k % s; k = Math.floor(k / s); return v; });
    },
    pick(name, filter) {
      const items = this.pool(name, filter);
      if (!items.length) return null;
      const it = items[Math.floor(rnd() * items.length)];
      used.push(`${name}:${it.id}`);
      return it;
    },
    note(tag) { used.push(tag); },
  };
  return style;
}
