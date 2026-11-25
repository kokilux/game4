// 寝室の情景。静的部分は1回だけ焼いておき、毎フレームは呼吸とホコリだけ動かす。

import { createFrame, mix } from "../../vendor/pixelfx/src/core/index.js";
import { C, W, H } from "./palette.js";
import { text, lerp, rng } from "./draw.js";

const WALL_BOTTOM = 92;
export const WINDOW = { x: 168, y: 12, w: 84, h: 52 };
const BEAM_TOP = { l: 168, r: 252 };
const BEAM_BOTTOM = { l: 104, r: 232 };

/** 月明かりの帯に入っているか（入っていれば蚊がはっきり見える＝ステージングの要）。 */
export function inBeam(x, y) {
  if (y < 64) return false;
  const t = Math.min(1, (y - 64) / (180 - 64));
  return x > lerp(BEAM_TOP.l, BEAM_BOTTOM.l, t) && x < lerp(BEAM_TOP.r, BEAM_BOTTOM.r, t);
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** 掛け布団の表面の高さ（影を落とす位置）。 */
export let surfaceY = (x) => 110;

/** 静的な背景を1枚のフレームに焼く。 */
export function buildStatic() {
  const f = createFrame(W, H);
  const buf = f.color;

  const put = (x, y, c, a = 1) => {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    if (a < 1 && a <= (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16) return;
    buf[y * W + x] = c;
  };
  const rect = (x, y, w, h, c, a = 1) => { for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) put(x + xx, y + yy, c, a); };
  const ell = (cx, cy, rx, ry, c, a = 1) => {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++)
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) put(cx + x, cy + y, c, a);
  };
  const round = (x, y, w, h, c) => {
    rect(x + 1, y, w - 2, h, c);
    rect(x, y + 1, w, h - 2, c);
  };

  // ---- 壁
  for (let y = 0; y < WALL_BOTTOM; y++) {
    const c = y < 22 ? C.wallTop : y < 66 ? C.wall : C.wallHi;
    rect(0, y, W, 1, c);
  }
  for (let x = 6; x < W; x += 18) rect(x, 0, 1, WALL_BOTTOM, C.stripe);
  rect(0, 66, W, 1, C.stripe, 0.6);
  rect(0, 84, W, 6, C.wallHi);
  rect(0, 84, W, 1, C.baseboardHi);
  rect(0, 85, W, 1, C.baseboard);
  rect(0, 86, W, 6, C.baseboard);
  rect(0, 92, W, 1, C.futonLo);

  // ---- 床
  rect(0, WALL_BOTTOM, W, H - WALL_BOTTOM, C.floor);
  for (let y = WALL_BOTTOM + 4; y < H; y += 6) rect(0, y, W, 1, C.floorLine);
  for (let i = 0; i < 10; i++) rect(24 + i * 31, WALL_BOTTOM, 1, H - WALL_BOTTOM, C.floorLine, 0.5);

  // ---- 窓
  const { x: wx, y: wy, w: ww, h: wh } = WINDOW;
  rect(wx - 3, wy - 3, ww + 6, wh + 6, C.frame);
  rect(wx - 3, wy - 3, ww + 6, 1, C.frameHi);
  rect(wx - 3, wy - 3, 1, wh + 6, C.frameHi, 0.5);
  rect(wx, wy, ww, wh, C.skyTop);
  for (let y = 0; y < wh; y++) rect(wx, wy + y, ww, 1, y < wh * 0.45 ? C.skyTop : C.sky);

  // 月
  const mx = 236, my = 27, mr = 7;
  ell(mx, my, mr, mr, C.moon);
  put(mx - 3, my + 1, C.moonShade); put(mx + 2, my - 3, C.moonShade); put(mx + 1, my + 3, C.moonShade);
  ell(mx, my, mr + 2, mr + 2, C.moonShade, 0.25);

  // 星
  const r = rng(7);
  for (let i = 0; i < 18; i++) {
    const sx = wx + 2 + Math.floor(r() * (ww - 4)), sy = wy + 2 + Math.floor(r() * (wh - 6));
    if ((sx - mx) ** 2 + (sy - my) ** 2 > 90) put(sx, sy, r() > 0.55 ? C.star : C.textDim);
  }
  // 桟
  rect(wx + (ww >> 1) - 1, wy, 2, wh, C.frame);
  rect(wx, wy + (wh >> 1) - 1, ww, 2, C.frame);

  // ---- 敷き布団（下に影を落として床から分離）
  rect(12, 168, 296, 6, C.void);
  round(10, 104, 300, 64, C.futon);
  rect(12, 104, 296, 2, C.futonHi);
  rect(10, 106, 4, 60, C.futonLo);
  rect(306, 106, 4, 60, C.futonLo);
  for (let y = 148; y < 166; y += 5) for (let x = 16; x < 304; x++) if ((x + y) % 7 < 3) put(x, y, C.futonHi, 0.6);

  // ---- 枕
  round(14, 96, 78, 30, C.pillow);
  rect(18, 96, 70, 2, C.pillowHi);
  rect(14, 98, 2, 26, C.pillowLo);
  rect(90, 98, 2, 26, C.pillowLo);
  for (let x = 20; x < 88; x++) if (x % 3) put(x, 99, C.pillowHi, 0.5);
  ell(52, 116, 22, 5, C.pillowLo);

  // ---- 掛け布団：体の起伏をシルエットで見せる
  surfaceY = (x) => {
    if (x < 74) return 124;
    if (x < 96) return 124 - Math.round((x - 74) * 0.9); // 肩へ立ち上がる
    if (x < 132) return 104 - Math.round((x - 96) * 0.12); // 胸
    if (x < 214) return 102 + Math.round(Math.sin((x - 132) * 0.05) * 2); // 腹
    if (x < 270) return 108 + Math.round((x - 214) * 0.18); // 脚
    return 118 + Math.round((x - 270) * 0.1);
  };
  for (let x = 70; x < 302; x++) {
    const top = surfaceY(x);
    for (let y = top; y < 162; y++) put(x, y, C.blanket);
    put(x, top, C.blanketHi);
    put(x, top + 1, C.blanketHi);
    put(x, top + 2, C.blanket, 1);
    put(x, top + 3, C.blanketLo, 0.8);
  }
  // キルティングと折り目
  for (let x = 72; x < 300; x++) {
    const t = surfaceY(x);
    if (x % 3) put(x, t + 8 + Math.round(Math.sin(x * 0.1) * 2), C.blanketHi, 0.9);
    if (x % 4) put(x, t + 22 + Math.round(Math.sin(x * 0.06 + 2) * 2), C.blanketLo);
    if (x % 5) put(x, t + 34 + Math.round(Math.sin(x * 0.08 + 1) * 2), C.blanketHi, 0.5);
  }
  // 光の当たる縁（リムライト）
  for (let x = 150; x < 250; x++) put(x, surfaceY(x) + 0, C.pillowHi);
  for (let x = 150; x < 250; x++) put(x, surfaceY(x) + 1, C.blanketHi);
  // 縁
  for (let x = 70; x < 302; x++) put(x, 161, C.blanketLo);
  for (let y = 118; y < 162; y++) { put(70, y, C.blanketLo); put(301, y, C.blanketLo); }
  // 肩のまるみ
  ell(104, 106, 16, 8, C.blanketHi, 0.5);
  ell(150, 108, 26, 9, C.blanketHi, 0.35);

  // ---- 月明かりの帯（既存色に青を混ぜる＝なめらかな光条、縁だけディザ）
  const beamTint = C.beamInner;
  for (let y = 64; y < H; y++) {
    const t = (y - 64) / (H - 64);
    const left = Math.round(lerp(BEAM_TOP.l, BEAM_BOTTOM.l, t));
    const right = Math.round(lerp(BEAM_TOP.r, BEAM_BOTTOM.r, t));
    const half = Math.max(1, (right - left) / 2);
    for (let x = left; x < right; x++) {
      const edge = Math.min(x - left, right - x) / half;
      let k = edge < 0.2 ? 0.12 : edge < 0.45 ? 0.22 : edge < 0.75 ? 0.32 : 0.42;
      if (edge < 0.1) { if ((x + y) & 1) continue; k *= 0.6; }
      const i = y * W + x;
      buf[i] = mix(buf[i], beamTint, k);
    }
  }
  return f;
}

/** 寝ている人（仰向け・正面から見た顔）。呼吸で口と胸が動く。mood: 0=熟睡, 1=痛み */
export function drawSleeper(p, t, mood = 0) {
  const breath = Math.sin(t * 1.5) * 0.5 + 0.5;
  const bob = breath > 0.6 ? -1 : 0;
  const hx = 52, hy = 107 + bob;

  // 枕のくぼみ
  p.ellipse(hx, hy + 7, 19, 6, C.pillowLo);

  // 後ろ髪（顔の後ろに広がる）
  p.ellipse(hx, hy - 2, 14, 12, C.hair);
  // 首・肩
  p.rect(hx - 5, hy + 9, 10, 6, C.skinLo);
  p.ellipse(hx - 1, hy + 14, 13, 5, C.blanketHi);

  // 顔
  p.ellipse(hx, hy, 12, 11, C.skin);
  p.ellipse(hx + 1, hy - 1, 11, 10, C.skin);
  // 右上（月明かり）のハイライト
  p.ellipse(hx + 4, hy - 3, 7, 6, C.skinHi);
  // あご
  p.ellipse(hx, hy + 8, 8, 3, C.skinLo);
  // 耳
  p.ellipse(hx - 12, hy + 1, 2, 3, C.skinLo);
  p.ellipse(hx + 12, hy + 1, 2, 3, C.skinLo);

  // 髪（生え際を関数で決めて、前髪をギザギザに）
  for (let dx = -13; dx <= 13; dx++) {
    const edge = 101 + Math.round(Math.abs(dx) * 0.16) + (Math.abs(dx) % 3 === 0 ? 1 : 0);
    for (let y = hy - 16; y <= edge; y++) p.px(hx + dx, y, C.hair);
  }
  // 前髪の毛束
  for (const [dx, len] of [[-8, 3], [-4, 2], [2, 3], [6, 2], [10, 3]]) {
    for (let i = 0; i < len; i++) p.px(hx + dx, 102 + i, C.hair);
  }
  // 髪のツヤ
  p.rect(hx - 6, 94, 9, 1, C.hairHi);
  p.rect(hx - 8, 96, 3, 1, C.hairHi);
  // もみあげ
  p.rect(hx - 12, hy - 1, 2, 5, C.hair);
  p.rect(hx + 11, hy - 1, 2, 5, C.hair);
  // 寝癖
  p.px(hx - 3, hy - 15, C.hair); p.px(hx - 2, hy - 16, C.hair);
  p.px(hx - 1, hy - 17, C.hairHi); p.px(hx, hy - 16, C.hair);

  // 閉じた目
  p.rect(hx - 7, hy - 2, 4, 1, C.eye);
  p.px(hx - 8, hy - 1, C.eye); p.px(hx - 3, hy - 1, C.eye);
  p.rect(hx + 3, hy - 2, 4, 1, C.eye);
  p.px(hx + 2, hy - 1, C.eye); p.px(hx + 7, hy - 1, C.eye);
  // 眉（前髪の下からのぞく程度）
  if (mood > 0) { p.px(hx - 7, hy - 4, C.hair); p.px(hx + 6, hy - 4, C.hair); }
  // 鼻
  p.px(hx, hy + 1, C.skinLo); p.px(hx + 1, hy + 2, C.skinLo);
  // 口
  const open = breath > 0.75 ? 2 : 1;
  if (mood > 0) { p.rect(hx - 2, hy + 6, 5, 1, C.mouth); p.px(hx - 2, hy + 5, C.mouth); p.px(hx + 2, hy + 5, C.mouth); }
  else p.rect(hx - 1, hy + 6, 3, open, C.mouth);
  // 頬
  p.px(hx - 8, hy + 3, C.skinLo); p.px(hx + 8, hy + 3, C.skinLo);


  // Zzz
  for (let i = 0; i < 3; i++) {
    const ph = (t * 0.32 + i * 0.33) % 1;
    const zx = 68 + i * 8 + ph * 7;
    const zy = 84 - ph * 16 - i * 3;
    text(p, "Z", zx, zy, C.textDim, { scale: i === 2 ? 2 : 1, alpha: 1 - ph * 0.9 });
  }
}

/** 空気中のホコリ。光の帯のなかでだけ白く光る。 */
const MOTES = Array.from({ length: 30 }, (_, i) => {
  const r = rng(40 + i);
  return { x: r() * W, y: 20 + r() * 130, sp: 2 + r() * 5, ph: r() * 6.28, big: r() > 0.75 };
});

export function drawAmbient(p, t) {
  for (const m of MOTES) {
    const y = m.y + Math.sin(t * 0.4 + m.ph) * 4 - t * m.sp * 0.12;
    const yy = ((y % 150) + 150) % 150;
    const x = m.x + Math.sin(t * 0.25 + m.ph) * 5;
    if (inBeam(x, yy)) {
      p.dot(x, yy, C.moonShade, 0.85);
      if (m.big) p.dot(x + 1, yy, C.moonShade, 0.4);
    } else {
      p.dot(x, yy, C.wallHi, 0.8);
    }
  }
}
