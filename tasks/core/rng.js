export function mulberry32(seed) {
  let a = seed >>> 0;
  const state0 = a;
  const f = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.state0 = state0;
  return f;
}

export function R(rng) {
  return {
    raw: rng,
    uniform: (a, b) => a + (b - a) * rng(),
    int: (a, b) => a + Math.floor(rng() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(rng() * arr.length)],
    sign: () => (rng() < 0.5 ? -1 : 1),
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    sample(arr, n) {
      return this.shuffle(arr).slice(0, n);
    },
    gauss(mu = 0, sigma = 1) {
      let u = 0, v = 0;
      while (u === 0) u = rng();
      while (v === 0) v = rng();
      return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
}

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function taskSeed(name, level, seed) {
  return (seed ^ hashStr(`${name}|L${level}`)) >>> 0;
}

export function extSeed(name, level, seed, split) {
  return (taskSeed(name, level, seed) ^ hashStr(`ext|${split}`)) >>> 0;
}
