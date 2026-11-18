import { splitIds } from '../core/style.js';
import * as S3 from './_style3d.js';

export const CITY_THEMES = [
  { id: 'beige_modern', walls: ['#e9e2d6', '#dcd6cc', '#e6dccb', '#d5dbe0', '#e3d9d2', '#d9e0d6'], tex: ['wall'], win: 'grid', glass: '#7f93a6', roof: null,
    street: { tex: /asphalt/, tone: '#a7abb1' }, side: '#d9d4cb', park: { tex: /grass|forest_ground|leaves/, tone: '#9dba82' }, plaza: { tex: /pavement|concrete|tiles/, tone: '#d2c9b9' } },
  { id: 'brick_town', walls: ['#c09e92', '#b09488', '#c8a89c', '#a8968c', '#bca498'], tex: ['wall'], texId: /brick/, win: 'tall', glass: '#eceae4', roof: '#6c6a68',
    street: { tex: /cobblestone|stone_tiles|rock_tile/, tone: '#9a958e' }, side: '#c9c1b5', park: { tex: /grass|mud|leaves/, tone: '#8fae78' }, plaza: { tex: /cobblestone|slab|monastery|rock_tile/, tone: '#bdb3a4' } },
  { id: 'glass_towers', walls: ['#647a8e', '#55697c', '#6f8597', '#7b8b98', '#5d6e7f'], tex: ['metal', 'wall'], texId: /plate|shutter|concrete/, win: 'curtain', glass: '#d3dde5', roof: '#8d9399',
    street: { tex: /asphalt/, tone: '#8e9398' }, side: '#ced1d3', park: { tex: /grass/, tone: '#93b47e' }, plaza: { tex: /concrete|pavement|tiles/, tone: '#cfcac2' } },
  { id: 'snow_city', walls: ['#d8d4cc', '#c9c4bc', '#bdb8b0', '#e0dcd6', '#cfd3d6'], tex: ['wall', 'stone'], win: 'grid', glass: '#5f6f80', roof: '#f3f6f8',
    street: { tex: /asphalt|concrete/, tone: '#959ba3' }, side: '#e9edf1', park: { tex: /snow/, tone: '#f1f4f7' }, plaza: { tex: /snow|concrete|plaster/, tone: '#e3e7eb' } },
  { id: 'desert_adobe', walls: ['#d8c6a8', '#ccb898', '#e0d2b8', '#c6b496', '#d4c4aa'], tex: ['wall', 'stone'], texId: /sandstone|plaster|clay|beige|concrete/, win: 'small', glass: '#4f4a46', roof: null,
    street: { tex: /sand|gravel|dry|mud/, tone: '#bfb39c' }, side: '#ddd2bf', park: { tex: /sand|gravel|dry_ground|rocky_trail/, tone: '#c4b590' }, plaza: { tex: /clay|sandstone|pavement/, tone: '#dccfb9' } },
  { id: 'green_roofs', walls: ['#e6e4de', '#d8dcd2', '#e1e3db', '#ccd3cf', '#dcdad0'], tex: ['wall'], texId: /plaster|concrete|beige/, win: 'strip', glass: '#6f8a9a', roof: '#86a674',
    street: { tex: /asphalt|concrete/, tone: '#9ea2a5' }, side: '#d6d8ce', park: { tex: /grass|forest|leaves/, tone: '#8fb877' }, plaza: { tex: /grass|leaves/, tone: '#a6c48c' } },
  { id: 'harbor_works', walls: ['#8d9399', '#a6aaa8', '#7c848a', '#9ca69f', '#b2aea4'], tex: ['metal', 'roof'], texId: /corrugated|shutter|plate|box_profile/, win: 'band', glass: '#4c5c6b', roof: '#6b6f73',
    street: { tex: /asphalt|garage|hangar|concrete/, tone: '#8c9094' }, side: '#b6b2a9', park: { tex: /gravel|rocks_ground|pebbles/, tone: '#a7a294' }, plaza: { tex: /planks|wood_floor|deck/, tone: '#a8977e' } },
  { id: 'stone_old', walls: ['#c8bfae', '#b8ae9c', '#d2c8b6', '#a89e8c', '#bfb7a7'], tex: ['stone', 'wall'], texId: /stone|block|castle|medieval/, win: 'tall', glass: '#4d5864', roof: '#5f5b57',
    street: { tex: /cobblestone|slab|rock_tile|stone_tiles/, tone: '#9b968d' }, side: '#c8c1b5', park: { tex: /grass|mossy|leaves/, tone: '#92ad7c' }, plaza: { tex: /monastery|slab|flagstone|cobblestone|rock_tile/, tone: '#c2b9aa' } },
];
const THEME_SPLIT = splitIds('car_city_theme', CITY_THEMES.map((t) => t.id), 2);
export const cityThemesFor = (split) => CITY_THEMES.filter((t) => THEME_SPLIT(t.id) === split);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ORANGE = [[14, 40]];
export const unOrange = (c, max = 0.2) => S3.keepNamedHues(c, ORANGE, max, 0.3);
const lin = (hex) => unOrange(S3.linOf(hex));

function lumPattern(tex, cv, world) {
  const k = Math.min(1, cv / Math.max(1e-6, tex.cv)), inv = 1 / Math.max(1e-6, S3.lum(tex.mean)), tpm = tex.n / world, S = new Float64Array(3);
  return (u, v, fp) => { S3.sampleTex(tex, u * tpm, v * tpm, Math.log2(Math.max(1e-9, fp * tpm)), S); return clamp(1 + k * (S3.lum(S) * inv - 1), 0.6, 1.4); };
}

export async function cityLook(style) {
  const rnd = style.rand;
  const themes = cityThemesFor(style.split), H = style.pool('hdri');
  const [ti, hi] = style.primaryCombo('car-theme-hdri', [themes.length, H.length]);
  const th = themes[ti], hd = H[hi];
  style.note(`city:${th.id}`); style.note(`hdri:${hd.id}`);
  const pick = (uses, re) => style.pick('tex', (t) => uses.includes(t.use) && (!re || re.test(t.id))) || style.pick('tex', (t) => uses.includes(t.use));
  const wallA = pick(th.tex, th.texId), streetA = pick(['floor', 'stone', 'terrain', 'flat2d', 'wood'], th.street.tex);
  const parkA = pick(['terrain', 'stone', 'floor'], th.park.tex), plazaA = pick(['floor', 'stone', 'wood', 'terrain', 'wall'], th.plaza.tex);
  const sideA = pick(['floor'], /pavement|concrete|plaster/), roofA = pick(['roof'], null);
  const [wallT, streetT, parkT, plazaT, sideT, roofT] = await Promise.all([wallA, streetA, parkA, plazaA, sideA, roofA].map((a) => S3.loadTexture(a.file)));
  const j = () => 0.94 + 0.12 * rnd();
  const walls = th.walls.map((h) => { const c = lin(h); return c.map((v) => v * j()); });
  const look = {
    theme: th, hd, lightJ: rnd(), walls,
    wallPat: lumPattern(wallT, 0.2, 1.4), roofPat: lumPattern(roofT, 0.12, 0.5),
    glass: lin(th.glass), roof: th.roof ? lin(th.roof) : null,
    street: { c: lin(th.street.tone).map((v) => v * j()), pat: lumPattern(streetT, 0.14, 1.2) },
    side: { c: lin(th.side), pat: lumPattern(sideT, 0.1, 0.8) },
    park: { c: lin(th.park.tone).map((v) => v * j()), pat: lumPattern(parkT, 0.16, 0.9) },
    plaza: { c: lin(th.plaza.tone).map((v) => v * j()), pat: lumPattern(plazaT, 0.12, 0.8), grid: 0.08 + 0.1 * rnd() },
  };
  for (const a of [wallA, streetA, parkA, plazaA, sideA, roofA]) style.note(`tex:${a.id}`);
  return look;
}

export function buildingMatStyled(C, look, mix) {
  const G = look.glass, R = look.roof, win = look.theme.win, pat = look.wallPat, rp = look.roofPat;
  return { c: C, ks: win === 'curtain' ? 0.3 : 0.12, sh: win === 'curtain' ? 40 : 20, tex: (x, y, z, nx, ny, nz, sh, out) => {
    if (ny > 0.5) {
      const t = rp(x, z, 0.02), r = R || C.map((v) => v * 0.94);
      out[0] = r[0] * 1.08 * t; out[1] = r[1] * 1.08 * t; out[2] = r[2] * 1.08 * t; return;
    }
    const u = Math.abs(nx) > 0.5 ? z : x, t = pat(u, y, 0.02);
    out[0] = C[0] * t; out[1] = C[1] * t; out[2] = C[2] * t;
    const h = sh.cy + sh.hy;
    if (y < 0.1 || y > h - 0.07) return;
    const md = (a, p) => ((a % p) + p) % p;
    let w = 0;
    if (win === 'grid') { const fu = md(u, 0.16), fv = md(y - 0.1, 0.18); w = fu > 0.05 && fu < 0.12 && fv > 0.06 && fv < 0.13 ? 0.5 : 0; }
    else if (win === 'tall') { const fu = md(u, 0.13), fv = md(y - 0.1, 0.24); w = fu > 0.045 && fu < 0.09 && fv > 0.05 && fv < 0.17 ? 0.55 : 0; }
    else if (win === 'small') { const fu = md(u, 0.2), fv = md(y - 0.1, 0.22); w = fu > 0.08 && fu < 0.12 && fv > 0.08 && fv < 0.13 ? 0.6 : 0; }
    else if (win === 'strip') { const fv = md(y - 0.1, 0.18); w = fv > 0.07 && fv < 0.125 ? 0.5 : 0; }
    else if (win === 'band') { const fv = md(y - 0.1, 0.3); w = fv > 0.12 && fv < 0.16 ? 0.45 : 0; }
    else if (win === 'curtain') { const fu = md(u, 0.08), fv = md(y - 0.1, 0.12); w = fu < 0.012 || fv < 0.014 ? 0.6 : 0; }
    if (w) mix(out, out, G, w);
  } };
}

export function groundStyled(look, kindOf, S, routeAt, mix) {
  const L = look, ORG = S3.linOf('#ff7417'), WHITE = S3.linOf('#ffffff'), CURB = L.side.c.map((v) => v * 0.86);
  return (X, Z, fp, out) => {
    const x = X, y = Z, bi = Math.floor(x), bj = Math.floor(y), fx = x - bi, fy = y - bj;
    const inBlock = fx > S / 2 && fx < 1 - S / 2 && fy > S / 2 && fy < 1 - S / 2;
    if (inBlock) {
      const e = Math.min(fx - S / 2, 1 - S / 2 - fx, fy - S / 2, 1 - S / 2 - fy);
      const kind = kindOf(bi, bj);
      if (kind === 1 && e > 0.05) { const t = L.park.pat(x, y, fp); out[0] = L.park.c[0] * t; out[1] = L.park.c[1] * t; out[2] = L.park.c[2] * t; }
      else if (kind === 2 && e > 0.05) {
        const t = L.plaza.pat(x, y, fp); out[0] = L.plaza.c[0] * t; out[1] = L.plaza.c[1] * t; out[2] = L.plaza.c[2] * t;
        const g = Math.max(S3.lineMask(x, L.plaza.grid, 0.004, fp), S3.lineMask(y, L.plaza.grid, 0.004, fp)); mix(out, out, CURB, 0.45 * g);
      } else { const t = L.side.pat(x, y, fp); mix(out, CURB, L.side.c.map((v) => v * t), Math.min(1, e / 0.012)); }
    } else { const t = L.street.pat(x, y, fp); out[0] = L.street.c[0] * t; out[1] = L.street.c[1] * t; out[2] = L.street.c[2] * t; }
    const { cas, core } = routeAt(x, y, fp);
    if (cas > 0) mix(out, out, WHITE, cas);
    if (core > 0) mix(out, out, ORG, core);
  };
}
