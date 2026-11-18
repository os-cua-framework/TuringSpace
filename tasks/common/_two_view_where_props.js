import { shape } from './_seat_view_rt.js';
import { frame } from './_seat_view_props.js';

export const LOW_SHELF = { hw: 0.6, hd: 0.18, h: 1.0 };

export function lowShelf(B, id, o) {
  const { hw, hd, h } = LOW_SHELF, yaw = o.yaw ?? 0, F = frame(o.x, o.z, yaw);
  const body = B.mat('wood', o.col ?? '#3f8f97'), back = B.mat('wood', '#cdb08a');
  for (const su of [-1, 1]) { const p = F.P(su * (hw - 0.02), h / 2, 0); B.add(shape.box(id, body, p[0], p[1], p[2], 0.02, h / 2, hd, yaw)); }
  const tp = F.P(0, h - 0.02, 0); B.add(shape.box(id, body, tp[0], tp[1], tp[2], hw, 0.02, hd, yaw, 0.004));
  const bt = F.P(0, 0.05, 0); B.add(shape.box(id, body, bt[0], bt[1], bt[2], hw - 0.02, 0.05, hd, yaw));
  const md = F.P(0, h / 2, 0); B.add(shape.box(id, body, md[0], md[1], md[2], hw - 0.02, 0.016, hd - 0.01, yaw));
  const bk = F.P(0, h / 2, -hd + 0.008); B.add(shape.box(id, back, bk[0], bk[1], bk[2], hw - 0.021, h / 2 - 0.02, 0.012, yaw));
  const cols = ['#c8553d', '#3f7cc0', '#e0b23e', '#4f9a62', '#8a5ab0', '#d4dde6'];
  const rows = [[0.1, h / 2 - 0.016], [h / 2 + 0.016, h - 0.04]];
  rows.forEach(([y0, y1], k) => {
    let u = -hw + 0.06;
    for (let j = 0; u < hw - 0.1; j++) {
      const bw = 0.045 + 0.02 * ((j * 7 + k * 3) % 3), bh = (y1 - y0) * (0.7 + 0.08 * ((j * 5 + k) % 4));
      const q = F.P(u + bw / 2, y0 + bh / 2, 0.02);
      B.add(shape.box(id, B.mat('paint', cols[(j + 2 * k) % cols.length]), q[0], q[1], q[2], bw / 2 - 0.003, bh / 2, hd - 0.05, yaw));
      u += bw;
    }
  });
}
