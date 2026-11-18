let INDEX = null;

function assetUrl(url) {
  const raw = String(url);
  const key = raw.replace(/^(?:\.\/)+/, '');
  return globalThis.__TURINGSPACE_EMBEDDED_ASSETS__?.[key] || raw;
}

export async function loadAssetIndex(base = '.') {
  if (INDEX) return INDEX;
  const r = await fetch(assetUrl(`${base}/assets/manifest.json`));
  INDEX = await r.json();
  return INDEX;
}

export function assetIndex() { return INDEX; }

export function bgByTag(index, rnd, tags) {
  const pool = index.backgrounds.filter((b) => tags.includes(b.tag));
  return pool[Math.floor(rnd() * pool.length)];
}

export function emojiByCat(index, rnd, cats, n, exclude = []) {
  const pool = Object.keys(index.emoji)
    .filter((s) => cats.includes(index.emoji[s].category) && !exclude.includes(s));
  const a = pool.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

const imgCache = new Map();

export function loadImage(url) {
  if (imgCache.has(url)) return imgCache.get(url);
  const p = new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('img load fail: ' + url));
    im.src = assetUrl(url);
  });
  imgCache.set(url, p);
  return p;
}

const svgCache = new Map();

export async function loadSvgIcon(url, { size = 256, recolor = null, stripBg = false } = {}) {
  const key = `${url}|${size}|${recolor}|${stripBg}`;
  if (svgCache.has(key)) return svgCache.get(key);
  const p = (async () => {
    const txt = await (await fetch(assetUrl(url))).text();
    let svg = txt;
    if (stripBg) svg = svg.replace(/<path d="M0 0h512v512H0z"\s*\/>/, '');
    if (recolor) {
      svg = svg.replace(/fill="#fff"/g, `fill="${recolor}"`)
               .replace(/fill="#ffffff"/gi, `fill="${recolor}"`);
    }
    svg = svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const obj = URL.createObjectURL(blob);
    try {
      return await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('svg raster fail: ' + url));
        im.src = obj;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(obj), 5000);
    }
  })();
  svgCache.set(key, p);
  return p;
}

export function emojiUrl(index, slug, style) {
  const e = index.emoji[slug];
  const st = style === 'openmoji' && e.openmoji ? 'openmoji'
           : style === 'twemoji' && e.twemoji ? 'twemoji'
           : e.twemoji ? 'twemoji' : 'openmoji';
  return `assets/icons/${st}/${slug}.svg`;
}

export function loadEmoji(index, slug, style, size = 160) {
  return loadSvgIcon(emojiUrl(index, slug, style), { size });
}

export function loadGameIcon(index, slug, color = '#333', size = 200) {
  return loadSvgIcon(`assets/icons/gameicons/${index.gameicons[slug].file}`,
    { size, recolor: color, stripBg: true });
}

let fontsLoaded = null;

export function loadFonts(index) {
  if (fontsLoaded) return fontsLoaded;
  fontsLoaded = Promise.all(index.fonts.map(async (f) => {
    const face = new FontFace(f.family, `url(${assetUrl(`assets/fonts/${f.file}`)})`);
    await face.load();
    document.fonts.add(face);
  })).then(() => document.fonts.ready);
  return fontsLoaded;
}
