import { splitIds } from '../core/style.js';
import { loadImage } from '../core/assets.js';

export const PERIOD = 36;

export const THEMES = [
  { id: 'street', kinds: [['automobile', 'car'], ['police_car', 'car'], ['taxi', 'car'], ['bus', 'bus'], ['fire_engine', 'truck'],
    ['delivery_truck', 'truck'], ['ambulance', 'truck'], ['bicycle', 'bike'], ['motorcycle', 'bike'], ['kick_scooter', 'scooter'],
    ['shopping_cart', 'cart'], ['umbrella', 'umbrella'], ['potted_plant', 'plant'], ['deciduous_tree', 'tree']],
    backdrops: ['skyline', 'fence', 'hedge', 'lamps'], hdri: ['urban', 'outdoor-midday', 'overcast', 'morning-afternoon'],
    ground: /asphalt|concrete_pavement|pavement|cobblestone|garage_floor|dirty_concrete/, path: '#d9d3c4', lane: '#f1ecdc' },
  { id: 'farm', kinds: [['tractor', 'tractor'], ['ewe', 'sheep'], ['goat', 'goat'], ['rooster', 'rooster'], ['turkey', 'turkey'],
    ['duck', 'duck'], ['sunflower', 'sunflower'], ['ear_of_corn', 'corn'], ['basket', 'basket'], ['ladder', 'ladder']],
    backdrops: ['hills', 'fence', 'hedge', 'clouds'], hdri: ['outdoor-midday', 'morning-afternoon', 'overcast'],
    ground: /mud|soil|forrest_ground|forest_ground|dry_ground|grass/, path: '#c9b48e', lane: null },
  { id: 'savanna', kinds: [['camel', 'camel'], ['elephant', 'elephant'], ['giraffe', 'giraffe'], ['kangaroo', 'kangaroo'],
    ['palm_tree', 'palm'], ['cactus', 'cactus'], ['crocodile', 'crocodile'], ['snake', 'snake']],
    backdrops: ['dunes', 'hills', 'clouds', 'flat'], hdri: ['sunset', 'outdoor-midday', 'morning-afternoon'],
    ground: /sand|dry|laterite|gravelly|red_/, path: '#e2c79a', lane: null },
  { id: 'park', kinds: [['tulip', 'flower'], ['rose', 'flower'], ['mushroom', 'mushroom'], ['snail', 'snail'], ['hedgehog', 'hedgehog'],
    ['swan', 'swan'], ['peacock', 'peacock'], ['chair', 'chair'], ['teddy_bear', 'teddy'], ['dove', 'dove']],
    backdrops: ['hedge', 'firs', 'hills', 'lamps'], hdri: ['outdoor-midday', 'morning-afternoon', 'overcast'],
    ground: /grass|gravel|pebbles|forest_leaves|path|cobblestone/, path: '#cfc6b0', lane: null },
  { id: 'harbour', kinds: [['sailboat', 'sail'], ['speedboat', 'motorboat'], ['canoe', 'canoe'], ['ship', 'ship'], ['crab', 'crab'],
    ['turtle', 'turtle'], ['flamingo', 'flamingo'], ['anchor', 'anchor']],
    backdrops: ['sea', 'sea-clouds'], hdri: ['outdoor-midday', 'sunset', 'morning-afternoon'],
    ground: /sand|pebbles|coast|seaside/, path: '#e6d6b2', lane: null },
  { id: 'snowfield', kinds: [['snowman_without_snow', 'snowman'], ['evergreen_tree', 'fir'], ['penguin', 'penguin'], ['owl', 'owl'],
    ['wrapped_gift', 'gift'], ['telescope', 'telescope'], ['locomotive', 'train']],
    backdrops: ['firs', 'hills', 'flat'], hdri: ['overcast', 'outdoor-midday', 'morning-afternoon'],
    ground: /snow/, path: '#eef2f6', lane: null, groundColor: '#e9eef3' },
  { id: 'room', kinds: [['couch_and_lamp', 'sofa'], ['bed', 'bed'], ['door', 'door'], ['drum', 'drum'], ['guitar', 'guitar'],
    ['television', 'tv'], ['package', 'box']],
    backdrops: ['wainscot', 'frames'], hdri: ['indoor', 'studio'], uses: ['floor', 'wood'],
    ground: /wood|parquet|plank|floor|tiles/, path: '#c8b49a', lane: null, groundColor: '#a07c58' },
  { id: 'playground', kinds: [['soccer_ball', 'ball'], ['basketball', 'ball'], ['volleyball', 'ball'], ['bowling', 'pins'], ['kite', 'kite'],
    ['balloon', 'balloon'], ['game_die', 'die'], ['puzzle_piece', 'puzzle']],
    backdrops: ['fence', 'hedge', 'clouds'], hdri: ['outdoor-midday', 'morning-afternoon', 'overcast'],
    ground: /grass|rubber|gravel|sand|asphalt/, path: '#d9c7a8', lane: null },
];
const themeSplit = splitIds('pano_theme', THEMES.map((t) => t.id), 3);
for (const t of THEMES) t.split = themeSplit(t.id);
export const themesOf = (split) => THEMES.filter((t) => t.split === split);
const trainPairs = THEMES.filter((t) => t.split === 'train').flatMap((t) => t.backdrops.map((b) => `${t.id}/${b}`));
const pairSplit = splitIds('pano_backdrop', trainPairs, 2);
const backdropSplit = (theme, b) => (theme.split === 'test' ? 'test' : pairSplit(`${theme.id}/${b}`));
export const themeById = (id) => THEMES.find((t) => t.id === id);

export function pickKinds(rng, theme, k) {
  const out = [], groups = new Set();
  for (const [slug, grp] of rng.shuffle(theme.kinds)) {
    if (groups.has(grp)) continue;
    groups.add(grp); out.push(slug);
    if (out.length === k) break;
  }
  return out;
}

const lin2s = (v) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)));
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const rgb = (c) => `rgb(${lin2s(c[0])},${lin2s(c[1])},${lin2s(c[2])})`;

async function periodTile(file) {
  const img = await loadImage('assets/' + file);
  const c = document.createElement('canvas'); c.width = PERIOD; c.height = PERIOD;
  c.getContext('2d').drawImage(img, 0, 0, PERIOD, PERIOD);
  return c;
}

export async function panoLook(st, theme) {
  const hd = st.primary('hdri', (h) => theme.hdri.includes(h.use));
  const grounds = st.pool('tex', (t) => theme.ground.test(t.id) && (theme.uses || ['terrain', 'floor', 'stone']).includes(t.use));
  const ground = grounds.length ? grounds[Math.floor(st.rand() * grounds.length)] : null;
  const bds = theme.backdrops.filter((b) => backdropSplit(theme, b) === st.split);
  const backdrop = bds[Math.floor(st.rand() * bds.length)];
  st.note('pano_backdrop:' + theme.id + '/' + backdrop); if (ground) st.note('tex:' + ground.id);
  const k = hd ? 0.62 / Math.max(1e-4, lum(hd.horizon)) : 1;
  const sky = hd ? [rgb(hd.zenith.map((v) => v * k * 0.85)), rgb(hd.horizon.map((v) => v * k))] : ['#bfe3f6', '#eef8fc'];
  const r = () => st.rand();
  return {
    theme, backdrop, sky, ground, groundTile: ground ? await periodTile(ground.file) : null,
    groundTone: ground ? lum(ground.mean_lin) : 0.3,
    h1: 18 + r() * 16, h2: 12 + r() * 14, hue: r(), lit: r(), sunset: hd && hd.use === 'sunset',
  };
}

function drawBackdrop(g, look, x0, x1, groundY, topY) {
  const P = PERIOD, b = look.backdrop;
  const startX = Math.floor((x0 - 8) / P) * P + 8;
  g.save();
  if (b === 'skyline') {
    const hh = Math.round(look.hue * 360), cols = [`hsl(${hh},10%,${58 + look.lit * 8}%)`, `hsl(${hh},12%,${78 + look.lit * 6}%)`];
    for (let x = startX; x < x1; x += P) {
      g.fillStyle = cols[0]; g.fillRect(x + 1, groundY - look.h1 - 14, 15, look.h1 + 14);
      g.fillStyle = cols[1]; g.fillRect(x + 18, groundY - look.h2 - 10, 16, look.h2 + 10);
      g.fillStyle = 'rgba(255,255,255,.55)';
      for (let yy = groundY - look.h1 - 10; yy < groundY - 6; yy += 6) { g.fillRect(x + 4, yy, 3, 3); g.fillRect(x + 10, yy, 3, 3); }
    }
  } else if (b === 'hills' || b === 'dunes') {
    const col = look.theme.id === 'snowfield' ? `hsl(210,22%,${84 + look.lit * 6}%)` : b === 'dunes' ? `hsl(${36 + look.hue * 8},58%,${68 + look.lit * 8}%)` : `hsl(${85 + look.hue * 40},28%,${72 + look.lit * 8}%)`;
    g.fillStyle = col; g.beginPath(); g.moveTo(x0, groundY);
    for (let x = x0; x <= x1; x += 2) g.lineTo(x, groundY - 14 - 8 * (0.5 + 0.5 * Math.cos((2 * Math.PI * (x - 8)) / P)));
    g.lineTo(x1, groundY); g.closePath(); g.fill();
  } else if (b === 'hedge') {
    g.fillStyle = `hsl(${100 + look.hue * 25},${26 + look.lit * 10}%,${36 + look.lit * 8}%)`;
    g.fillRect(x0, groundY - 12, x1 - x0, 12);
    for (let x = startX; x < x1 + P; x += P / 2) { g.beginPath(); g.arc(x + P / 4, groundY - 12, P / 4 + 1, Math.PI, 0); g.fill(); }
  } else if (b === 'firs') {
    g.fillStyle = look.theme.id === 'snowfield' ? '#3f5f55' : '#4c7a5a';
    for (let x = startX; x < x1 + P; x += P / 3) { g.beginPath(); g.moveTo(x, groundY); g.lineTo(x + P / 6, groundY - 26); g.lineTo(x + P / 3, groundY); g.closePath(); g.fill(); }
  } else if (b === 'fence') {
    g.fillStyle = '#9b7b5a';
    for (let x = startX; x < x1 + P; x += P / 2) g.fillRect(x + 7, groundY - 22, 4, 22);
    g.fillRect(x0, groundY - 18, x1 - x0, 3); g.fillRect(x0, groundY - 9, x1 - x0, 3);
  } else if (b === 'wainscot') {
    g.fillStyle = `hsl(${25 + look.hue * 20},${20 + look.lit * 15}%,${46 + look.lit * 10}%)`; g.fillRect(x0, groundY - 30, x1 - x0, 30);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x0, groundY - 31, x1 - x0, 2);
    for (let x = startX; x < x1 + P; x += P / 2) g.fillRect(x + 4, groundY - 26, 1.5, 22);
  } else if (b === 'frames') {
    for (let x = startX; x < x1 + P; x += P) {
      g.fillStyle = '#6b5136'; g.fillRect(x + 8, topY + 14, 20, 16);
      g.fillStyle = `hsl(${Math.round(look.hue * 360)},30%,${70 + look.lit * 10}%)`; g.fillRect(x + 10, topY + 16, 16, 12);
    }
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x0, groundY - 4, x1 - x0, 4);
  } else if (b === 'lamps') {
    g.fillStyle = '#5d6670';
    for (let x = startX; x < x1 + P; x += P) { g.fillRect(x + 17, groundY - 34, 2, 34); g.fillRect(x + 17, groundY - 34, 8, 2); g.beginPath(); g.arc(x + 25, groundY - 31, 2.5, 0, Math.PI * 2); g.fill(); }
  } else if (b === 'clouds' || b === 'sea-clouds') {
    g.fillStyle = 'rgba(255,255,255,.75)';
    for (let x = startX; x < x1 + P; x += P) { g.beginPath(); g.ellipse(x + 12, topY + 14, 9, 4.5, 0, 0, Math.PI * 2); g.ellipse(x + 19, topY + 12, 7, 5, 0, 0, Math.PI * 2); g.fill(); }
    if (b === 'sea-clouds') drawBackdrop(g, { ...look, backdrop: 'sea' }, x0, x1, groundY, topY);
    else { g.fillStyle = 'rgba(120,140,110,.35)'; g.fillRect(x0, groundY - 6, x1 - x0, 6); }
  } else if (b === 'flat') {
    g.fillStyle = look.theme.id === 'snowfield' ? 'rgba(200,212,224,.8)' : 'rgba(170,150,110,.45)'; g.fillRect(x0, groundY - 5, x1 - x0, 5);
  } else if (b === 'sea') {
    const sea = topY + 58;
    const grad = g.createLinearGradient(0, sea, 0, groundY);
    grad.addColorStop(0, look.sunset ? '#7f8fb0' : '#4f8fc4'); grad.addColorStop(1, look.sunset ? '#a9a6b8' : '#86bfe2');
    g.fillStyle = grad; g.fillRect(x0, sea, x1 - x0, groundY - sea);
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1;
    for (let yy = sea + 8; yy < groundY - 2; yy += 9) {
      g.beginPath();
      for (let x = startX; x <= x1 + P; x += P / 2) { g.moveTo(x + 3, yy); g.quadraticCurveTo(x + 9, yy - 2.5, x + 15, yy); }
      g.stroke();
    }
  }
  g.restore();
}

export function drawPlace(g, m, icons, look, S) {
  const { STRIP, GROUND, ICON } = S, x0 = STRIP.x - 200, x1 = STRIP.x + STRIP.w + 200;
  const sky = g.createLinearGradient(0, STRIP.y, 0, GROUND);
  sky.addColorStop(0, look.sky[0]); sky.addColorStop(1, look.sky[1]);
  g.fillStyle = sky; g.fillRect(x0, STRIP.y - 60, x1 - x0, GROUND - STRIP.y + 60);
  drawBackdrop(g, look, x0, x1, GROUND, STRIP.y);
  const bottom = STRIP.y + STRIP.h + 40;
  g.fillStyle = look.theme.path; g.fillRect(x0, GROUND, x1 - x0, 9);
  if (look.groundTile) {
    const pat = g.createPattern(look.groundTile, 'repeat');
    if (pat.setTransform && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix().translateSelf(8, GROUND + 9));
    g.fillStyle = pat; g.fillRect(x0, GROUND + 9, x1 - x0, bottom - GROUND - 9);
    if (look.groundTone > 0.35) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x0, GROUND + 9, x1 - x0, bottom - GROUND - 9); }
  } else { g.fillStyle = look.theme.groundColor || '#8f959c'; g.fillRect(x0, GROUND + 9, x1 - x0, bottom - GROUND - 9); }
  g.fillStyle = 'rgba(0,0,0,.10)'; g.fillRect(x0, GROUND + 8, x1 - x0, 1.5);
  if (look.theme.lane) {
    g.strokeStyle = look.theme.lane; g.lineWidth = 2; g.setLineDash([10, 8]); g.lineDashOffset = -(x0 - 8) % (PERIOD / 2);
    g.beginPath(); g.moveTo(x0, GROUND + 19); g.lineTo(x1, GROUND + 19); g.stroke(); g.setLineDash([]); g.lineDashOffset = 0;
  }
  for (const l of m.landmarks) {
    const img = icons?.[l.slug], s = ICON;
    g.save(); g.fillStyle = 'rgba(0,0,0,.16)'; g.beginPath(); g.ellipse(l.x, GROUND + 1, s * 0.36, 2.2, 0, 0, Math.PI * 2); g.fill(); g.restore();
    if (img) g.drawImage(img, l.x - s / 2, l.y - s / 2, s, s);
    else { g.fillStyle = '#8b9aa5'; g.fillRect(l.x - s / 2, l.y - s / 2, s, s); }
  }
}
