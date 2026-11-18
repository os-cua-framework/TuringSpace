import { STR } from './strings.js';

export const UI_FONT = '-apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';
export const ACCENT = '#1991fa';
const CONTROL = Object.freeze({ refresh: 40, verifyW: 92, verifyH: 40, sliderH: 40 });
export function panelControlFeatures(meta = {}) {
  const features = [{ id: 'panel-refresh', kind: 'target', effectiveWidthPx: CONTROL.refresh,
    effectiveHeightPx: CONTROL.refresh }];
  if (['verify', 'slider', 'input'].includes(meta.footer ?? 'verify')) features.push({ id: 'panel-verify', kind: 'target',
    effectiveWidthPx: CONTROL.verifyW, effectiveHeightPx: CONTROL.verifyH });
  if (meta.footer === 'slider') features.push({ id: 'panel-slider', kind: 'target',
    effectiveWidthPx: 56, effectiveHeightPx: CONTROL.sliderH });
  return features;
}
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export class Panel {
  constructor(host, { width = 360 } = {}) {
    this.W = width;
    this.baseWidth = width;
    this.card = document.createElement('div');
    this.card.style.cssText =
      `position:relative;width:${width}px;background:#fff;border:1px solid #e4e7eb;border-radius:10px;` +
      'box-shadow:0 6px 24px rgba(0,30,80,.10);padding:0;overflow:hidden;user-select:none;';
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.card.appendChild(this.canvas);
    host.appendChild(this.card);
    this.g = this.canvas.getContext('2d');
    this.dpr = Math.min(2, (typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1));
    this.banner = null;
    this.result = null;
    this.resultT = 0;
    this.shakeT = 0;
    this.sliderV = 0;
    this.sliderActive = false;
    this._drag = null;
    this._raf = null;
    this._lastT = 0;
    this.locked = false;
    this._bindPointer();
  }

  setTask(task, env, hooks) {
    this.task = task;
    this.env = env;
    this.hooks = hooks;
    const m = { ...task.meta, ...(env?.manifest?.panel || {}) };
    this.sliderHint = m.sliderHint;
    this.W = m.panelWidth ?? this.baseWidth;
    this.card.style.width = this.W + 'px';
    this.headerH = m.headerH ?? 56;
    this.boardH = m.boardH ?? 280;
    this.footer = m.footer ?? 'verify';
    this.footerH = this.footer === 'slider' ? 112 : this.footer === 'input' ? 66 : 62;
    this.H = this.headerH + this.boardH + this.footerH;
    this.canvas.width = this.W * this.dpr;
    this.canvas.height = this.H * this.dpr;
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.banner = null;
    this.result = null;
    this.resultT = 0;
    this.sliderV = 0;
    this.locked = false;
    if (this._inputEl) { this._inputEl.remove(); this._inputEl = null; }
    this.redraw();
    this._ensureLoop();
  }

  boardRect() { return { x: 10, y: this.headerH, w: this.W - 20, h: this.boardH - 10 }; }

  redraw() {
    const { g } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, this.W, this.H);

    const hr = { x: 14, y: 0, w: this.W - 58, h: this.headerH };
    if (this.task?.drawPrompt) this.task.drawPrompt(g, hr, this.env);
    if (!this.task?.frames) this._drawRefresh(g, this.W - 22, this.headerH / 2 - 1); else this._refreshHit = null;
    g.strokeStyle = '#f0f2f5';
    g.beginPath(); g.moveTo(0, this.headerH - 0.5); g.lineTo(this.W, this.headerH - 0.5); g.stroke();

    const br = this.boardRect();
    const shake = this.shakeT > 0 ? Math.sin(this.shakeT * 40) * 4 * this.shakeT : 0;
    g.save();
    g.translate(shake, 0);
    rr(g, br.x, br.y, br.w, br.h, 6);
    g.save(); g.clip();
    if (this.task?.drawBoard) this.task.drawBoard(g, br, this.env);
    g.restore();
    g.strokeStyle = '#e4e7eb';
    rr(g, br.x + 0.5, br.y + 0.5, br.w - 1, br.h - 1, 6);
    g.stroke();
    g.restore();

    const fy = this.headerH + this.boardH;
    if (this.footer === 'slider') { this._drawSlider(g, fy); this._drawVerify(g, fy + 50, this.footerH - 50); }
    else if (this.footer === 'verify') this._drawVerify(g, fy);
    else if (this.footer === 'input') this._drawInput(g, fy);
    else this._drawStatus(g, fy);

    if (this.banner && this.banner.kind === 'info') this._drawInfoBar(g, fy);
    if (this.result) this._drawResultOverlay(g);
  }

  _drawRefresh(g, cx, cy) {
    this._refreshHit = { x: cx - CONTROL.refresh / 2, y: cy - CONTROL.refresh / 2,
      w: CONTROL.refresh, h: CONTROL.refresh };
    g.save();
    g.strokeStyle = '#9aa7b4'; g.lineWidth = 1.8; g.lineCap = 'round';
    g.beginPath(); g.arc(cx, cy, 8, -0.4 * Math.PI, 1.1 * Math.PI); g.stroke();
    g.fillStyle = '#9aa7b4';
    g.beginPath();
    g.moveTo(cx + 8.5, cy - 8.5); g.lineTo(cx + 2.5, cy - 6.5); g.lineTo(cx + 8.8, cy - 2.2);
    g.closePath(); g.fill();
    g.restore();
  }

  _drawSlider(g, fy) {
    const pad = 14, th = CONTROL.sliderH, ty = fy + 10;
    const tw = this.W - pad * 2;
    this._track = { x: pad, y: ty, w: tw, h: th };
    rr(g, pad, ty, tw, th, th / 2);
    g.fillStyle = '#f7f9fa'; g.fill();
    g.strokeStyle = '#e4e7eb'; g.stroke();
    const knobW = 56, kx = pad + this.sliderV * (tw - knobW);
    if (this.sliderV > 0.005) {
      rr(g, pad, ty, kx - pad + knobW / 2, th, th / 2);
      g.fillStyle = '#d1e9fe'; g.fill();
      g.strokeStyle = '#1991fa22'; g.stroke();
    }
    g.font = `13px ${UI_FONT}`;
    g.fillStyle = '#88949d'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (this.sliderV < 0.04) g.fillText(this.sliderHint ?? STR.sliderHint, pad + knobW + (tw - knobW) / 2, ty + th / 2 + 0.5);
    this._knob = { x: kx, y: ty, w: knobW, h: th };
    rr(g, kx, ty, knobW, th, th / 2);
    g.fillStyle = this.sliderActive ? ACCENT : '#fff';
    g.shadowColor = 'rgba(20,60,120,.25)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
    g.fill();
    g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
    g.strokeStyle = this.sliderActive ? ACCENT : '#e4e7eb'; g.stroke();
    g.strokeStyle = this.sliderActive ? '#fff' : '#88949d';
    g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round';
    const ax = kx + knobW / 2, ay = ty + th / 2;
    g.beginPath();
    g.moveTo(ax - 8, ay); g.lineTo(ax + 6, ay);
    g.moveTo(ax + 1, ay - 5); g.lineTo(ax + 6, ay); g.lineTo(ax + 1, ay + 5);
    g.stroke();
    g.lineWidth = 1;
  }

  _drawVerifyButton(g, fy, rowH = this.footerH) {
    const bw = CONTROL.verifyW, bh = CONTROL.verifyH, bx = this.W - bw - 14, by = fy + (rowH - bh) / 2;
    this._verifyBtn = { x: bx, y: by, w: bw, h: bh };
    rr(g, bx, by, bw, bh, 5);
    const ready = !this.task?.canVerify || this.task.canVerify(this.env);
    g.fillStyle = (this.locked || !ready) ? '#9fc9f5' : ACCENT; g.fill();
    g.font = `600 14px ${UI_FONT}`; g.fillStyle = '#fff';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(STR.verify, bx + bw / 2, by + bh / 2 + 0.5);
    return bx;
  }

  _drawVerify(g, fy, rowH = this.footerH) {
    const bx = this._drawVerifyButton(g, fy, rowH);
    g.fillStyle = '#9aa7b4'; g.textAlign = 'left';
    drawFitStatus(g, this.task?.footerStatus?.(this.env) ?? '', 16, fy + rowH / 2 + 0.5, bx - 16 - 10 - (this.footerReserve || 0));
  }

  _drawInput(g, fy) {
    const bx = this._drawVerifyButton(g, fy);
    const h = CONTROL.verifyH, x = 14, y = fy + (this.footerH - h) / 2, w = bx - x - 12;
    this._inputBox = { x, y, w, h };
    rr(g, x, y, w, h, 6);
    g.fillStyle = '#fff'; g.fill();
    g.strokeStyle = this._inputFocus ? ACCENT : '#cfd6dd'; g.lineWidth = this._inputFocus ? 1.5 : 1; g.stroke(); g.lineWidth = 1;
    const el = this._ensureInputEl();
    Object.assign(el.style, { left: `${x + 1}px`, top: `${y + 1}px`, width: `${w - 2}px`, height: `${h - 2}px` });
    el.disabled = this.locked;
  }

  _ensureInputEl() {
    if (this._inputEl) return this._inputEl;
    const el = document.createElement('input');
    el.type = 'text'; el.autocomplete = 'off'; el.spellcheck = false;
    el.placeholder = this.task?.meta?.inputPlaceholder ?? 'Type your answer';
    el.setAttribute('aria-label', el.placeholder);
    el.style.cssText = `position:absolute;box-sizing:border-box;border:0;outline:none;background:transparent;padding:0 12px;font:15px ${UI_FONT};color:#1f2a36;`;
    el.addEventListener('input', () => { if (!this.locked) { this.hooks?.dispatch({ op: 'input', value: el.value }); this.redraw(); } });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !this.locked) { e.preventDefault(); this.hooks?.submit(); } });
    el.addEventListener('focus', () => { this._inputFocus = true; this.redraw(); });
    el.addEventListener('blur', () => { this._inputFocus = false; this.redraw(); });
    this.card.appendChild(el);
    this._inputEl = el;
    return el;
  }

  _drawStatus(g, fy) {
    g.fillStyle = '#9aa7b4'; g.textAlign = 'left';
    drawFitStatus(g, this.task?.footerStatus?.(this.env) ?? '', 16, fy + this.footerH / 2 + 0.5, this.W - 32);
  }

  _drawInfoBar(g, fy) {
    const { text } = this.banner;
    const h = this.footerH - 12, y = fy + 6, x = 14, w = this.W - 28;
    rr(g, x, y, w, h, h / 2);
    g.fillStyle = '#f4f8ff'; g.fill();
    g.strokeStyle = '#a9c9f5'; g.stroke();
    g.font = `600 14px ${UI_FONT}`; g.fillStyle = '#3a76c9';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, x + w / 2, y + h / 2 + 0.5);
  }

  _drawResultOverlay(g) {
    const ok = this.result.success;
    const t = easeOut(Math.min(1, this.resultT));
    g.save();
    g.globalAlpha = 0.42 * t;
    g.fillStyle = '#0c1420';
    g.fillRect(0, 0, this.W, this.H);
    g.restore();

    const tw = 208, th = 128, cx = this.W / 2, cy = this.H / 2;
    const pop = 0.82 + 0.18 * easeOut(Math.min(1, this.resultT * 1.5));
    g.save();
    g.translate(cx, cy);
    g.scale(pop, pop);
    g.globalAlpha = Math.min(1, this.resultT * 2.2);
    g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 24; g.shadowOffsetY = 8;
    rr(g, -tw / 2, -th / 2, tw, th, 16);
    g.fillStyle = '#ffffff'; g.fill();
    g.shadowColor = 'transparent';
    g.globalAlpha = 1;

    const by = -th / 2 + 40, R = 26;
    g.beginPath(); g.arc(0, by, R + 8, 0, Math.PI * 2);
    g.fillStyle = ok ? 'rgba(45,190,135,.16)' : 'rgba(238,91,91,.14)'; g.fill();
    g.beginPath(); g.arc(0, by, R, 0, Math.PI * 2);
    const grd = g.createLinearGradient(0, by - R, 0, by + R);
    if (ok) { grd.addColorStop(0, '#4fd598'); grd.addColorStop(1, '#20ab79'); }
    else { grd.addColorStop(0, '#ff8a8a'); grd.addColorStop(1, '#ec5a5a'); }
    g.fillStyle = grd; g.fill();

    const sp = Math.min(1, Math.max(0, (this.resultT - 0.2) / 0.5));
    g.save(); g.translate(0, by);
    g.strokeStyle = '#fff'; g.lineWidth = 4.5; g.lineCap = 'round'; g.lineJoin = 'round';
    if (ok) {
      const a = { x: -11, y: 1 }, b = { x: -3, y: 9 }, c = { x: 12, y: -9 };
      const s1 = Math.hypot(b.x - a.x, b.y - a.y), s2 = Math.hypot(c.x - b.x, c.y - b.y);
      const done = sp * (s1 + s2);
      g.beginPath(); g.moveTo(a.x, a.y);
      if (done <= s1) g.lineTo(a.x + (b.x - a.x) * (done / s1), a.y + (b.y - a.y) * (done / s1));
      else { g.lineTo(b.x, b.y); const f = (done - s1) / s2; g.lineTo(b.x + (c.x - b.x) * f, b.y + (c.y - b.y) * f); }
      g.stroke();
    } else {
      const s = 9, p1 = Math.min(1, sp * 2), p2 = Math.max(0, (sp - 0.5) * 2);
      g.beginPath(); g.moveTo(-s, -s); g.lineTo(-s + 2 * s * p1, -s + 2 * s * p1); g.stroke();
      if (p2 > 0) { g.beginPath(); g.moveTo(s, -s); g.lineTo(s - 2 * s * p2, -s + 2 * s * p2); g.stroke(); }
    }
    g.restore();

    g.globalAlpha = Math.min(1, Math.max(0, (this.resultT - 0.3) / 0.4));
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `600 17px ${UI_FONT}`;
    g.fillStyle = ok ? '#1c8a5f' : '#d24a4a';
    g.fillText(ok ? STR.result.ok : STR.result.fail, 0, th / 2 - 40);
    const sub = ok ? STR.result.okSub(this.result.timeMs / 1000) : STR.result.failSub;
    if (sub) {
      g.font = `12.5px ${UI_FONT}`; g.fillStyle = '#9aa3ac';
      g.fillText(sub, 0, th / 2 - 20);
    }
    g.globalAlpha = 1;
    g.restore();
  }

  showResult(res, { timeMs } = {}) {
    this.result = { success: res.success, timeMs: timeMs ?? 0 };
    this.resultT = 0;
    if (!res.success) this.shakeT = 0.8;
    this._ensureLoop();
  }

  info(text) { this.banner = { kind: 'info', text }; this.redraw(); }
  clearBanner() { this.banner = null; this.result = null; this.redraw(); }

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    const sx = r.width ? this.W / r.width : 1;
    const sy = r.height ? (this.canvas.height / this.dpr) / r.height : 1;
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  }

  _bindPointer() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (this.locked) return;
      const p = this._pos(e);
      this.hooks?.pointer?.(p.x, p.y, true, 'down');
      c.setPointerCapture(e.pointerId);
      if (this._refreshHit && this._hit(p, this._refreshHit)) { this.hooks?.refresh(); return; }
      if (this.footer === 'slider' && this._knob && this._hit(p, this._knob)) {
        this._drag = 'slider'; this.sliderActive = true;
        this._sliderGrab = p.x - this._knob.x;
        this.task?.onSlider?.(this.env, this.sliderV, 'down', this.hooks);
        this.redraw();
        return;
      }
      if (this.footer === 'input' && this._inputBox && this._hit(p, this._inputBox)) { this._inputEl?.focus(); return; }
      if (['verify', 'slider', 'input'].includes(this.footer) && this._verifyBtn && this._hit(p, this._verifyBtn)) {
        if (this.task?.canVerify && !this.task.canVerify(this.env)) return;
        this.hooks?.submit(); return;
      }
      if (p.y >= 0 && p.y < this.headerH && this.task?.headerPointer) {
        const actions = this.task.headerPointer({ type: 'down', x: p.x - 10, y: p.y }, this.env) || [];
        for (const a of actions) this.hooks.dispatch(a);
        this.redraw();
        return;
      }
      const br = this.boardRect();
      if (this._hit(p, br)) {
        this._drag = 'board';
        this._route('down', p, br);
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (this.locked) return;
      const p = this._pos(e);
      this.hooks?.pointer?.(p.x, p.y, !!this._drag, 'move');
      if (!this._drag) return;
      if (this._drag === 'slider') {
        const t = this._track, knobW = this._knob.w;
        this.sliderV = Math.min(1, Math.max(0, (p.x - this._sliderGrab - t.x) / (t.w - knobW)));
        this.task?.onSlider?.(this.env, this.sliderV, 'move', this.hooks);
        this.redraw();
      } else {
        this._route('move', p, this.boardRect());
      }
    });
    const up = (e) => {
      const p = this._pos(e);
      this.hooks?.pointer?.(p.x, p.y, false, 'up');
      if (!this._drag) return;
      if (this._drag === 'slider') {
        this.sliderActive = false;
        this.task?.onSlider?.(this.env, this.sliderV, 'up', this.hooks);
        this.redraw();
      } else {
        this._route('up', p, this.boardRect());
      }
      this._drag = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
  }

  _hit(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }

  _route(type, p, br) {
    const local = { type, x: p.x - br.x, y: p.y - br.y };
    const actions = this.task?.pointer?.(local, this.env) || [];
    for (const a of actions) this.hooks.dispatch(a);
    if (actions.length || type !== 'move') this.redraw();
    else if (this.task?.wantsMoveRedraw) this.redraw();
  }

  _ensureLoop() {
    if (this._raf) return;
    const step = (t) => {
      const dt = Math.min(0.05, (t - (this._lastT || t)) / 1000);
      this._lastT = t;
      let active = false;
      if (this.shakeT > 0) { this.shakeT = Math.max(0, this.shakeT - dt * 2.2); active = true; }
      if (this.result && this.resultT < 1) { this.resultT = Math.min(1, this.resultT + dt * 1.7); active = true; }
      if (this.task?.tick) active = this.task.tick(this.env, dt, this.hooks) || active;
      if (active) { this.redraw(); this._raf = requestAnimationFrame(step); }
      else { this._raf = null; this._lastT = 0; }
    };
    this._raf = requestAnimationFrame(step);
  }

  poke() { this._ensureLoop(); }
}

export function clampText(g, text, maxW) {
  let s = String(text);
  if (g.measureText(s).width <= maxW) return s;
  while (s.length > 1 && g.measureText(`${s}…`).width > maxW) s = s.slice(0, -1).trimEnd();
  return `${s}…`;
}

export function drawFitStatus(g, text, x, cy, maxW, weight = 400) {
  const t = String(text ?? '');
  if (!t) return;
  const { size, lines } = fitLines(g, t, weight, 12, 10.5, maxW, 2);
  const lh = size + 2.5;
  g.font = `${weight} ${size}px ${UI_FONT}`;
  g.textBaseline = 'middle';
  let y = cy - ((lines.length - 1) * lh) / 2;
  for (const line of lines) { g.fillText(line, x, y); y += lh; }
}

function fitLines(g, text, weight, big, small, maxW, maxLines) {
  for (const size of [big, small]) {
    g.font = `${weight} ${size}px ${UI_FONT}`;
    if (g.measureText(text).width <= maxW) return { size, lines: [text] };
  }
  const size = small;
  g.font = `${weight} ${size}px ${UI_FONT}`;
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const t = cur ? `${cur} ${words[i]}` : words[i];
    if (g.measureText(t).width <= maxW || !cur) cur = t;
    else {
      lines.push(cur); cur = words[i];
      if (lines.length === maxLines - 1) { cur = words.slice(i).join(' '); break; }
    }
  }
  if (cur) lines.push(cur);
  let last = lines[lines.length - 1];
  if (g.measureText(last).width > maxW) {
    while (last.length > 1 && g.measureText(`${last}…`).width > maxW) last = last.slice(0, -1).trimEnd();
    lines[lines.length - 1] = `${last}…`;
  }
  return { size, lines };
}

export function drawPromptText(g, rect, main, sub) {
  g.textAlign = 'left'; g.textBaseline = 'top';
  const m = fitLines(g, main, 600, 14, 12, rect.w, 2);
  let s = sub ? fitLines(g, sub, 400, 12, 10.5, rect.w, 2) : { size: 0, lines: [] };
  const mLH = m.size + 3.5, sLH = s.size ? s.size + 2.5 : 0;
  let total = m.lines.length * mLH + s.lines.length * sLH + (s.lines.length ? 3 : 0);
  if (total > rect.h - 4 && s.lines.length > 1) {
    s = { size: s.size, lines: [s.lines[0].replace(/…?$/, '…')] };
    total = m.lines.length * mLH + sLH + 3;
  }
  let y = rect.y + Math.max(2, (rect.h - total) / 2);
  g.fillStyle = '#333b44'; g.font = `600 ${m.size}px ${UI_FONT}`;
  for (const line of m.lines) { g.fillText(line, rect.x, y); y += mLH; }
  if (s.lines.length) {
    y += 3;
    g.fillStyle = '#8b97a3'; g.font = `${s.size}px ${UI_FONT}`;
    for (const line of s.lines) { g.fillText(line, rect.x, y); y += sLH; }
  }
  g.textBaseline = 'middle';
}
