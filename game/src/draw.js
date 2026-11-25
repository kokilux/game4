// 描画の道具箱。ピクセルは全部整数座標、文字はpixelfxの3x5/5x7フォント。

import { textWidth } from "../../vendor/pixelfx/src/core/index.js";
import { rasterText } from "../../vendor/pixelfx/src/core/font.js";

/** ピクセル文字。align: left | center | right。scale でドット倍率。 */
export function text(p, str, x, y, color, { font = "mini", scale = 1, align = "left", alpha = 1 } = {}) {
  const w = textWidth(str, font) * scale;
  let ox = Math.round(x);
  if (align === "center") ox = Math.round(x - w / 2);
  else if (align === "right") ox = Math.round(x - w);
  const oy = Math.round(y);
  rasterText(str, font, (gx, gy) => {
    for (let dy = 0; dy < scale; dy++)
      for (let dx = 0; dx < scale; dx++) p.dot(ox + gx * scale + dx, oy + gy * scale + dy, color, alpha);
  });
  return w;
}

export function labelWidth(str, font = "mini", scale = 1) {
  return textWidth(str, font) * scale;
}

/** a から b を t (0..1) で補間。 */
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeOutQuart = (t) => 1 - Math.pow(1 - clamp01(t), 4);
export const easeInQuad = (t) => clamp01(t) * clamp01(t);
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** 決定的な乱数（Math.random は使わない）。 */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 角丸の矩形（ピクセルなので角を1つ落とすだけ）。 */
export function roundRect(p, x, y, w, h, c, a = 1) {
  p.rect(x + 1, y, w - 2, h, c, a);
  p.rect(x, y + 1, w, h - 2, c, a);
}

/** 1px の枠線。 */
export function outline(p, x, y, w, h, c, a = 1) {
  p.rect(x, y, w, 1, c, a);
  p.rect(x, y + h - 1, w, 1, c, a);
  p.rect(x, y, 1, h, c, a);
  p.rect(x + w - 1, y, 1, h, c, a);
}

/** 網点（ディザ）で塗る。ピクセルアートのグラデーションはこれで作る。 */
export function ditherRect(p, x, y, w, h, c, a) {
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) if (((xx + yy) & 1) === 0) p.put(x + xx, y + yy, c, a);
}
