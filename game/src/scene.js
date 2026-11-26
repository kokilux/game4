// KA — 寝室の描画。3つのステージ（和室 / 洋室 / 夏の夜）。
//
// 画面は「横向きに寝ている人」の真横からの眺め。
//   ・枕の上に頭。顔は上を向き、鼻先が右上に出る。
//   ・掛け布団の稜線が肩 → 胸 → 腰 → 膝 → 爪先と起伏する。
//   ・顔のすぐ下で布団が顎を包むので、首が浮かない。
//
// 静的部分（部屋・窓・敷き布団・枕）はフレームに焼き、
// 掛け布団は呼吸で上下するので drawOver で毎フレーム描く。

import { createFrame, hex, mix } from "../../vendor/pixelfx/src/core/index.js";
import { C } from "./palette.js";
import { HEAD_ROWS, HEAD_ANCHOR, HEAD_EAR } from "./head-rows.js";

export const W = 320;
export const H = 180;

// ---------------------------------------------------------------- 色の扱い
// 色は "#rrggbb" のまま書けるようにする（数値でない文字列だけ変換）。
const hexCache = new Map();
const toColor = (v) => {
  if (typeof v !== "string") return v;
  let c = hexCache.get(v);
  if (c === undefined) {
    c = hex(v);
    hexCache.set(v, c);
  }
  return c;
};

const proxyCache = new WeakMap();
/** 色の文字列を自動で数値に直すペインタ。 */
export function hexPaint(p) {
  if (proxyCache.has(p)) return proxyCache.get(p);
  const q = new Proxy(p, {
    get(t, k) {
      const v = Reflect.get(t, k);
      if (typeof v !== "function") return v;
      return (...args) => v.apply(t, args.map(toColor));
    },
  });
  proxyCache.set(p, q);
  return q;
}

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------- 静的描画
function toolkit(f) {
  const buf = f.color;
  const put = (x0, y0, c0, a = 1) => {
    const x = x0 | 0;
    const y = y0 | 0;
    const c = toColor(c0);
    if (x < 0 || y < 0 || x >= W || y >= H || !c) return;
    const i = y * W + x;
    if (a >= 1) buf[i] = c;
    else buf[i] = mix(buf[i], c, a);
  };
  return {
    put,
    rect(x, y, w, h, c, a = 1) {
      for (let yy = Math.max(0, y | 0); yy < Math.min(H, (y + h) | 0); yy++)
        for (let xx = Math.max(0, x | 0); xx < Math.min(W, (x + w) | 0); xx++) put(xx, yy, c, a);
    },
    ellipse(cx, cy, rx, ry, c, a = 1) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x - cx) / rx;
          const dy = (y - cy) / ry;
          if (dx * dx + dy * dy <= 1) put(x, y, c, a);
        }
    },
    round(x, y, w, h, r, c, a = 1) {
      for (let yy = 0; yy < h; yy++)
        for (let xx = 0; xx < w; xx++) {
          const dx = Math.min(xx, w - 1 - xx);
          const dy = Math.min(yy, h - 1 - yy);
          if (dx < r && dy < r) {
            const ddx = r - dx;
            const ddy = r - dy;
            if (ddx * ddx + ddy * ddy > r * r + r * 0.6) continue;
          }
          put(x + xx, y + yy, c, a);
        }
    },
    line(x0, y0, x1, y1, c, a = 1) {
      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      const n = Math.max(dx, dy) || 1;
      for (let i = 0; i <= n; i++) put(lerp(x0, x1, i / n), lerp(y0, y1, i / n), c, a);
    },
    // 円柱（布団の稜線）に沿った塗り分け
    wash(x0, y0, x1, y1, tint, kFn) {
      const t = toColor(tint);
      for (let y = Math.max(0, y0); y < Math.min(H, y1); y++)
        for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
          const k = kFn(x, y);
          if (k > 0.004) buf[y * W + x] = mix(buf[y * W + x], t, Math.min(0.9, k));
        }
    },
  };
}

// ---------------------------------------------------------------- 寝具の形
export const BED = {
  pillow: { x: 20, y: 110, w: 82, h: 24, r: 7 },
  mattress: { x: 16, y: 130, w: 292, h: 40, r: 6 },
  duvet: { x0: 62, x1: 308, bottom: 164 },
  head: { cx: 58, cy: 110 }, // 顔の中心（スプライトのアンカー）
};

/**
 * 掛け布団の稜線（画面上の y）。肩で高く、腰で沈み、爪先でまた上がる。
 * 蚊の着地点もこの線の上になる。
 */
export function bedTop(x) {
  if (x <= BED.duvet.x0) return 121;
  if (x < 94) return lerp(121, 103, (x - BED.duvet.x0) / 32); // 肩（頭の下に潜り込む）
  if (x < 134) return lerp(103, 108, (x - 94) / 40); // 二の腕のくぼみ
  if (x < 182) return 108 - Math.sin(((x - 134) / 48) * Math.PI) * 1.2; // 腰
  if (x < 234) return lerp(108, 101, (x - 182) / 52); // 尻から腿
  if (x < 268) return lerp(101, 106, (x - 234) / 34); // 膝下
  if (x < 294) return lerp(106, 97, (x - 268) / 26); // 爪先が布団を押し上げる
  return 97;
}

export const surfaceY = (x) => bedTop(clamp(x, BED.duvet.x0 + 2, BED.duvet.x1 - 2)) + 2;

const upper = (a, b) => a + (b - a) * 0.5;
const frac = (v) => v - Math.floor(v);

// ---------------------------------------------------------------- 部屋
function drawRoom(tk, pal, opts = {}) {
  const wallH = 92;
  for (let y = 0; y < wallH; y++) tk.rect(0, y, W, 1, mix(pal.wallTop, pal.wallBot, y / wallH));

  // 腰板
  tk.rect(0, 78, W, 14, pal.wainscot);
  tk.rect(0, 78, W, 1, pal.wainscotHi);
  tk.rect(0, 90, W, 2, pal.wainscotLo);
  for (let x = 0; x < W; x += 46) tk.rect(x, 79, 1, 11, pal.wainscotLo);

  // 床
  const ft = 92;
  for (let y = ft; y < H; y++) {
    const k = clamp((y - ft) / (H - ft), 0, 1);
    tk.rect(0, y, W, 1, mix(pal.floorFar, pal.floorNear, k));
  }
  tk.rect(0, ft, W, 2, pal.floorShadow);

  if (opts.floor === "tatami") {
    for (let x = 6; x < W; x += 46) tk.rect(x, ft + 2, 1, H - ft, pal.floorSeam);
    for (let x = 6; x < W; x += 46) tk.rect(x + 1, ft + 2, 1, H - ft, pal.floorSeamHi);
    tk.rect(0, 132, W, 1, pal.floorSeam);
  } else {
    for (let y = ft + 6; y < H; y += 13) tk.rect(0, y, W, 1, pal.floorSeam);
    for (let x = 20; x < W; x += 64) tk.rect(x, ft + 2, 1, H - ft, pal.floorSeamHi);
  }

  // 隅の暗がり
  tk.wash(0, 0, W, H, pal.corner, (x, y) => {
    const d = Math.max(0, 1 - (x + y * 0.6) / 260);
    return d * d * 0.5;
  });
}

// 障子 / ブラインド / 開け窓。光源はどれも「窓」なので共通の枠で描く。
function drawShoji(tk, pal) {
  const x0 = 178, y0 = 8, x1 = 292, y1 = 76;
  // 外の光が壁ににじむ
  tk.wash(x0 - 26, y0 - 12, x1 + 26, y1 + 22, pal.glass, (x, y) => {
    const dx = Math.max(x0 - x, 0, x - x1);
    const dy = Math.max(y0 - y, 0, y - y1);
    const d = Math.sqrt(dx * dx + dy * dy);
    return clamp(1 - d / 34, 0, 1) * 0.24;
  });
  tk.round(x0 - 5, y0 - 5, x1 - x0 + 10, y1 - y0 + 10, 3, pal.frame);
  tk.rect(x0, y0, x1 - x0, y1 - y0, pal.paper);
  for (let y = y0; y < y1; y++)
    tk.rect(x0, y, x1 - x0, 1, mix(pal.paperHi, pal.paperLo, (y - y0) / (y1 - y0)));
  // 桟（3列 × 4段）
  for (let i = 1; i < 3; i++) tk.rect(x0 + Math.round(((x1 - x0) * i) / 3) - 1, y0, 2, y1 - y0, pal.frame);
  for (let i = 1; i < 4; i++) tk.rect(x0, y0 + Math.round(((y1 - y0) * i) / 4) - 1, x1 - x0, 2, pal.frame);
  tk.rect(x0, y0, x1 - x0, 1, pal.frameHi);
  tk.rect(x0, y1 - 1, x1 - x0, 1, pal.frame);
  // 紙の桟ぎわの影
  for (let y = y0 + 1; y < y1 - 1; y++) {
    tk.put(x0 + 1, y, pal.paperShade, 0.5);
    tk.put(x1 - 2, y, pal.paperShade, 0.5);
  }
}

function drawBlinds(tk, pal) {
  const x0 = 166, y0 = 10, x1 = 302, y1 = 74;
  tk.round(x0 - 5, y0 - 5, x1 - x0 + 10, y1 - y0 + 10, 2, pal.frame);
  tk.rect(x0, y0, x1 - x0, y1 - y0, pal.glassDark);
  // スリット越しの月明かり
  for (let y = y0; y < y1; y += 5) {
    tk.rect(x0, y, x1 - x0, 1, pal.glass);
    tk.rect(x0, y + 1, x1 - x0, 1, mix(pal.glass, pal.glassDark, 0.55));
  }
  // 羽根（手前）
  for (let y = y0 + 2; y < y1; y += 5) {
    tk.rect(x0, y, x1 - x0, 1, pal.slatHi);
    tk.rect(x0, y + 1, x1 - x0, 1, pal.slat);
    tk.rect(x0, y + 2, x1 - x0, 1, pal.slatLo);
  }
  tk.rect(x0, y1 - 3, x1 - x0, 3, pal.frame);
  tk.rect(x0, y0 - 5, x1 - x0, 2, pal.frameHi);
  // 左右の紐
  for (const x of [x0 + 6, x1 - 8]) tk.rect(x, y0, 1, y1 - y0, pal.slatLo);
}

function drawNightWindow(tk, pal) {
  const x0 = 148, y0 = 6, x1 = 300, y1 = 72;
  tk.round(x0 - 5, y0 - 5, x1 - x0 + 10, y1 - y0 + 10, 3, pal.frame);
  tk.rect(x0, y0, x1 - x0, y1 - y0, pal.skyLo);
  for (let y = y0; y < y1; y++) tk.rect(x0, y, x1 - x0, 1, mix(pal.skyHi, pal.skyLo, (y - y0) / (y1 - y0)));
  // 月
  const mx = 258, my = 24;
  tk.wash(x0, y0, x1, y1, pal.moon, (x, y) => {
    const d = Math.hypot(x - mx, (y - my) * 1.2);
    return clamp(1 - d / 46, 0, 1) ** 2 * 0.3;
  });
  tk.ellipse(mx, my, 8, 8, pal.moon);
  tk.ellipse(mx - 1, my - 1, 6, 6, pal.moonHi);
  // 星（ハッシュで散らす）
  for (let i = 0; i < 26; i++) {
    const sx = Math.round(x0 + 3 + frac(Math.sin(i * 12.9898) * 43758.5453) * (x1 - x0 - 6));
    const sy = Math.round(y0 + 3 + frac(Math.sin(i * 78.233) * 12345.6789) * 36);
    if (Math.hypot(sx - mx, sy - my) < 14) continue;
    tk.put(sx, sy, i % 6 === 0 ? pal.starHi : pal.star, i % 4 === 0 ? 0.7 : 1);
  }
  // 網戸
  for (let x = x0 + 2; x < x1; x += 4) tk.rect(x, y0, 1, y1 - y0, pal.mesh, 0.22);
  for (let y = y0 + 2; y < y1; y += 4) tk.rect(x0, y, x1 - x0, 1, pal.mesh, 0.22);
  // 窓枠
  for (let i = 1; i < 2; i++) tk.rect(x0 + (x1 - x0) * i - 1, y0, 2, y1 - y0, pal.frameHi);
  tk.rect(x0, y0, x1 - x0, 1, pal.frameHi);
  tk.rect(x0, y1 - 1, x1 - x0, 1, pal.frame);
  tk.rect(x0 - 3, y1 - 3, x1 - x0 + 6, 3, pal.frameHi);
}

// デジタル時計（洋室）
function drawClock(tk, pal) {
  const x = 118, y = 40, w = 44, h = 24;
  tk.round(x, y, w, h, 3, pal.clockBody);
  tk.rect(x + 2, y + 2, w - 4, h - 4, pal.clockFace);
  tk.rect(x, y, w, 1, pal.frameHi);
  // 2:41
  const gl = [
    ["111", "101", "101", "101", "111"],
    ["010", "010", "010", "010", "010"],
  ];
  const digits = [gl[0], gl[0], gl[0], gl[0]];
  const seg = [
    ["111", "101", "101", "101", "111"], // 0
    ["010", "010", "010", "010", "010"], // 1
    ["111", "001", "111", "100", "111"], // 2
    ["111", "001", "111", "001", "111"], // 3
    ["101", "101", "111", "001", "001"], // 4
    ["111", "100", "111", "001", "111"], // 5
    ["111", "100", "111", "101", "111"], // 6
    ["111", "001", "001", "001", "001"], // 7
    ["111", "101", "111", "101", "111"], // 8
    ["111", "101", "111", "001", "111"], // 9
  ];
  const time = [2, 4, 1];
  let cx = x + 5;
  time.forEach((d, i) => {
    const g = seg[d];
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++) if (g[r][c] === "1") tk.put(cx + c * 3, y + 5 + r * 3, pal.clockLed);
    cx += 12;
    if (i < 2) {
      tk.put(cx - 3, y + 7, pal.clockLed);
      tk.put(cx - 3, y + 13, pal.clockLed);
      cx += 3;
    }
  });
  void digits;
  tk.wash(x - 14, y - 14, x + w + 14, y + h + 14, pal.clockLed, (px, py) => {
    const d = Math.hypot(Math.max(x - px, 0, px - (x + w)), Math.max(y - py, 0, py - (y + h)));
    return clamp(1 - d / 16, 0, 1) * 0.22;
  });
}

// 扇風機（夏の夜）。布団の向こうに置く。
function drawFanStand(tk, pal) {
  const cx = 286;
  tk.rect(cx - 2, 88, 4, 48, pal.fanStand);
  tk.rect(cx - 9, 134, 18, 3, pal.fanStand);
  tk.ellipse(cx, 88, 15, 15, pal.fanCage);
  tk.ellipse(cx, 88, 13, 13, pal.fanInner);
}

const FAN = { cx: 286, cy: 88, r: 12 };
function drawFanBlades(pIn, t, pal) {
  const p = hexPaint(pIn);
  const { cx, cy, r } = FAN;
  const a0 = t * 5.2;
  // 回っている羽根は「ぶれ」で描く
  p.disc(cx, cy, r - 1, pal.fanBlade, 0.3);
  for (let i = 0; i < 3; i++) {
    const a = a0 + (i * Math.PI * 2) / 3;
    for (let k = 2; k <= r - 1; k++) {
      p.dot(cx + Math.cos(a) * k, cy + Math.sin(a) * k, pal.fanBlade, 0.9);
      p.dot(cx + Math.cos(a + 0.16) * k, cy + Math.sin(a + 0.16) * k, pal.fanBlade, 0.45);
    }
  }
  p.disc(cx, cy, 3, pal.fanHub);
  // ガードの放射線
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    p.line(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4, cx + Math.cos(a) * r, cy + Math.sin(a) * r, pal.fanCage, 0.55);
  }
  p.ring(cx, cy, r, 1, pal.fanCage, 0.9);
  p.ring(cx, cy, r - 4, 1, pal.fanCage, 0.3);
}

// 敷き布団・シーツ・枕
function drawBedding(tk, pal) {
  const m = BED.mattress;
  tk.round(m.x, m.y + 1, m.w, m.h, m.r, pal.sheetLo);
  tk.round(m.x, m.y, m.w, m.h - 2, m.r, pal.sheet);
  tk.rect(m.x + 8, m.y, m.w - 16, 1, pal.sheetHi);
  // 布団の下の影
  tk.wash(m.x, m.y, m.x + m.w, m.y + 18, pal.shadow, (x, y) => clamp((y - m.y) / 18, 0, 1) * 0.45);
  tk.rect(m.x, m.y + m.h - 2, m.w, 2, pal.sheetLo);

  // 枕
  const q = BED.pillow;
  tk.round(q.x, q.y + 2, q.w, q.h, q.r, pal.pillowLo);
  tk.round(q.x, q.y, q.w, q.h - 1, q.r, pal.pillow);
  tk.round(q.x + 3, q.y + 1, q.w - 8, 5, 3, pal.pillowHi);
  tk.round(q.x + 2, q.y + q.h - 5, q.w - 4, 4, 2, pal.pillowLo);
  tk.rect(q.x + 1, q.y + q.h - 1, q.w - 2, 1, pal.pillowDeep);
  // 枕の縫い目
  for (let x = q.x + 6; x < q.x + q.w - 6; x += 6) tk.rect(x, q.y + 8, 2, 1, pal.pillowLo, 0.8);
}

// ---------------------------------------------------------------- 寝姿
/**
 * 横向きに寝ている人。顔は上向き、鼻先は右上。
 * mood 1 で「刺された」顔（眉が寄り、口がへの字）。
 */
// ---- 頭：横向きに寝て、顔は壁側（＝カメラに背を向ける）。耳だけが髪から出る ----
/** 4〜5px の Z を1文字ぶん描く（上辺・下辺・斜め）。 */
function putZ(p, x, y, s, col) {
  for (let i = 0; i < s; i++) {
    p.put(x + i, y, col);
    p.put(x + i, y + s - 1, col);
  }
  for (let i = 1; i < s - 1; i++) {
    const dx = Math.round((1 - i / (s - 1)) * (s - 1));
    p.put(x + dx, y + i, col);
  }
}

/** 寝息（Zzz）。頭の右斜め上へ、3つが順に流れる。 */
function drawZzz(p, hx, hy, t) {
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.4 + i / 3) % 1;
    const s = i === 2 ? 5 : 4;
    const x = Math.round(hx + 14 + k * 14 + Math.sin(k * 5 + i) * 1.6);
    const y = Math.round(hy - 10 - k * 20);
    const fade = Math.min(k * 5, (1 - k) * 4);
    if (fade < 0.3) continue;
    putZ(p, x, y, s, fade > 0.75 ? C.text : C.textDim);
  }
}

const HEAD_W = HEAD_ROWS[0].length;
const HEAD_H = HEAD_ROWS.length;
const HEAD_PAL = (pal) => ({
  "#": pal.voidLine ?? pal.shadow,
  H: pal.hair,
  h: pal.hairHi,
  k: pal.hairLo,
  S: pal.skin,
  s: pal.skinLo,
  d: pal.skinDeep,
  b: pal.brow,
  E: pal.eye,
  N: pal.skinDeep,
  M: pal.mouth,
});

/** 頭の位置（スプライトの左上）。 */
function headOrigin(t, mood) {
  const breath = Math.sin(t * 1.1) > 0.6 ? 1 : 0;
  const shake = mood > 0 ? 1 : 0;
  return { x: BED.head.cx - HEAD_ANCHOR.x, y: BED.head.cy - HEAD_ANCHOR.y + breath + shake };
}

/** 枕と、枕の上に散った髪。布団より先に描く（＝布団の下）。 */
export function drawSleeperBase(pIn, t, pal) {
  const p = hexPaint(pIn);
  const { x: hx, y: hy } = BED.head;
  // 枕への接触影（べた塗り。ディザの半透明は使わない）
  p.ellipse(hx + 1, hy + 9, 21, 5, pal.pillowDeep);
  p.ellipse(hx + 2, hy + 9, 15, 3, pal.pillowLo);
  // 枕に散る毛先
  p.ellipse(hx - 11, hy + 12, 9, 3, pal.hair);
  p.ellipse(hx - 13, hy + 13, 6, 2, pal.hairLo);
  // 枕のふくらみ（頭の下で少しだけ手前に出る）
  p.ellipse(hx + 3, hy + 16, 15, 3, pal.pillow);
  p.ellipse(hx + 3, hy + 15, 12, 1.4, pal.pillowHi);
  p.ellipse(hx + 3, hy + 17, 14, 1.6, pal.pillowLo);
}

/** 顔（布団より後に描く＝布団の手前）。呼吸で1px上下する。
 * expr: "sleep" | "happy" | "ouch"（クリア／失敗の演出で切り替える） */
export function drawSleeperHead(pIn, t, mood = 0, palParam = C, expr = "sleep", shakeX = 0) {
  const p = hexPaint(pIn);
  const pal = palParam;
  const base = headOrigin(t, mood);
  const ox = base.x + Math.round(shakeX);
  const oy = base.y;
  p.sprite(HEAD_ROWS, HEAD_PAL(pal), ox, oy);

  const px = (x, y, c) => p.put(ox + x, oy + y, c);

  // 月明かり：顔の左上（額と頬）をわずかに拾う
  p.put(ox + 17, oy + 12, pal.skinHi);
  p.put(ox + 16, oy + 13, pal.skinHi);

  if (expr === "happy") {
    // 目を ^ ^ に、口を大きく笑わせる
    for (const x0 of [15, 23]) {
      for (let i = 0; i < 4; i++) { px(x0 + i, 17, pal.skin); px(x0 + i, 16, pal.skin); }
      px(x0, 17, pal.eye); px(x0 + 1, 16, pal.eye); px(x0 + 2, 16, pal.eye); px(x0 + 3, 17, pal.eye);
      for (let i = 0; i < 4; i++) px(x0 + i, 13, pal.brow);
    }
    for (let x = 16; x <= 23; x++) px(x, 23, pal.skin);
    px(16, 22, pal.mouth); px(23, 22, pal.mouth);
    for (let x = 17; x <= 22; x++) px(x, 23, pal.mouth);
    px(14, 20, pal.zit); px(27, 19, pal.zit); // 頬の赤み
  } else if (expr === "ouch") {
    // 眉を寄せ、目をぎゅっと閉じ、口を開ける
    for (let x = 15; x <= 26; x++) { px(x, 13, pal.skin); px(x, 14, pal.skin); }
    px(15, 15, pal.brow); px(16, 14, pal.brow); px(17, 14, pal.brow); px(18, 14, pal.brow);
    px(23, 14, pal.brow); px(24, 14, pal.brow); px(25, 14, pal.brow); px(26, 15, pal.brow);
    for (const x0 of [15, 23]) {
      for (let i = 0; i < 4; i++) { px(x0 + i, 17, pal.skin); px(x0 + i, 16, pal.skin); }
      px(x0, 16, pal.eye); px(x0 + 1, 17, pal.eye); px(x0 + 2, 17, pal.eye); px(x0 + 3, 16, pal.eye);
    }
    for (let x = 17; x <= 22; x++) { px(x, 22, pal.skin); px(x, 23, pal.skin); px(x, 24, pal.skin); }
    px(18, 22, pal.mouth); px(21, 22, pal.mouth);
    px(19, 23, pal.mouth); px(20, 23, pal.mouth);
    px(19, 24, pal.mouth); px(20, 24, pal.mouth);
    px(29, 18, pal.skinHi); px(29, 19, pal.skinHi); // 汗
  }

  // 刺された：頬が赤く腫れる（3点）
  if (mood > 0) {
    const zx = ox + 27, zy = oy + 20;
    p.put(zx, zy, pal.zit);
    p.put(zx + 1, zy, pal.zit);
    p.put(zx - 1, zy + 1, pal.zit);
    p.put(zx + 2, zy + 1, pal.zit);
    p.put(zx, zy + 2, pal.zit);
  }

  // 息（Zzz）— 起きた／刺されたあとは出さない
  if (expr === "sleep" && mood === 0) drawZzz(p, ox + HEAD_ANCHOR.x, oy + HEAD_ANCHOR.y, t);
}

// ---------------------------------------------------------------- 掛け布団
function duvetTop(x, t) {
  const breath = Math.sin(t * 1.7);
  let y = bedTop(x);
  // 胸のあたりが呼吸で上下する
  const chest = Math.max(0, 1 - Math.abs(x - 118) / 54);
  y -= chest * breath * 1.4;
  return y;
}

export function drawDuvet(pIn, t, pal) {
  // 以前は600頂点の poly() で塗っていたが、poly は「バウンディングボックス × 頂点数」の
  // 総当たりなので 1フレーム 12M 回の判定になり、ここだけで 50ms かかっていた。
  // 掛け布団は列ごとの高さで決まる形なので、列ごとの rect で塗る（同じ絵で 10倍以上速い）。
  const p = hexPaint(pIn);
  const d = BED.duvet;
  const blanket = toColor(pal.blanket);
  const cTop = mix(pal.blanketHi, pal.blanket, 0.25);
  const cMid = mix(pal.blanket, pal.blanketLo, 0.4);
  const cBot = mix(pal.blanket, pal.blanketLo, 0.78);
  const cDeep = mix(pal.blanketLo, pal.shadow, 0.5);

  for (let x = d.x0; x <= d.x1; x++) {
    const y0 = Math.round(duvetTop(x, t));
    if (y0 >= d.bottom - 6) continue;
    const h = d.bottom - y0;
    const b1 = y0 + 6;
    const b2 = b1 + Math.round(h * 0.4);
    const b3 = b1 + Math.round(h * 0.72);
    // 稜線：上を向いた面だけ明るく
    p.rect(x, y0, 1, 1, cTop);
    p.rect(x, y0 + 1, 1, 2, pal.blanketHi);
    if (x > 78 && x < 116) p.rect(x, y0 + 3, 1, 1, pal.sheetFold);
    // 本体（稜線の下から帯ごとに）
    p.rect(x, y0 + 3, 1, b1 - (y0 + 3), blanket);
    p.rect(x, b1, 1, b2 - b1, blanket);
    p.rect(x, b2, 1, b3 - b2, cMid);
    p.rect(x, b3, 1, d.bottom - 3 - b3, cBot);
    // 接地
    p.rect(x, d.bottom - 3, 1, 3, cDeep);
  }

  // キルティングの縦線
  for (let x = 104; x < d.x1; x += 34) {
    const y0 = Math.round(duvetTop(x, t)) + 8;
    p.line(x, y0, x + 1, d.bottom - 8, mix(pal.blanket, pal.blanketLo, 0.5));
  }
  // 裾の折り返し
  p.rect(d.x0, d.bottom - 1, d.x1 - d.x0, 1, mix(pal.blanketLo, pal.shadow, 0.7));
  // 布団の落ち影（ディザにすると網目に見えるのでベタ）
  p.rect(d.x0, d.bottom, d.x1 - d.x0, 2, mix(pal.blanketLo, pal.shadow, 0.88));
}

// ---------------------------------------------------------------- 環境
function drawMotes(pIn, t, color, n = 14, warm = false) {
  const p = hexPaint(pIn);
  for (let i = 0; i < n; i++) {
    const seed = i * 37.7;
    const sp = 0.28 + (i % 5) * 0.07;
    const x = ((seed * 3 + t * 5 * sp) % (W + 40)) - 20;
    const y = 96 - ((seed * 1.7 + t * 9 * sp) % 62);
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.6 + i));
    p.light(Math.round(x), Math.round(y), warm ? pal_warm : color, tw * 0.5);
    if (i % 4 === 0) p.dot(Math.round(x), Math.round(y), warm ? pal_warmHi : color, tw);
  }
}
const pal_warm = hex("#e8c46a");
const pal_warmHi = hex("#fff0b8");


// ---------------------------------------------------------------- 蚊の着地点
/**
 * 着地候補。kind:"skin" は刺される＝危険（顔まわり）、
 * "blanket" / "pillow" は安全。y は布団の稜線に沿わせる。
 */
function makeSpots(hx, hy) {
  // 顔のパーツ（スプライト座標 → 画面座標）。ここに降りると刺される。
  const ox = hx - HEAD_ANCHOR.x;
  const oy = hy - HEAD_ANCHOR.y;
  const face = (sx, sy) => ({ x: ox + sx, y: oy + sy, kind: "skin" });
  const spots = [
    face(26, 20),  // 頬
    face(17, 13),  // こめかみ
    face(21, 24),  // あご
    face(21, 20),  // 鼻のあたり
    face(HEAD_EAR.x + 1, HEAD_EAR.y), // 耳
    face(28, 15),  // 目じり
  ];
  // 布団の稜線（安全）
  for (let x = 92; x <= 296; x += 26) {
    const jx = ((x * 37) % 11) - 5;
    const px = clamp(x + jx, 92, 298);
    spots.push({ x: px, y: Math.round(bedTop(px)) - 1, kind: "blanket" });
  }
  // 枕（安全）
  spots.push({ x: 30, y: 112, kind: "pillow" });
  spots.push({ x: 44, y: 110, kind: "pillow" });
  return spots;
}

// 月明かりの届く範囲（＝蚊のシルエットが読える）
const inBeam = (x, y) => y < 104;

// ---------------------------------------------------------------- ステージ定義
/** パレットは数値に直してから使う（mix が数値を要求するため）。 */
function basePal(over) {
  const out = { ...C };
  for (const [k, v] of Object.entries(over)) out[k] = toColor(v);
  return out;
}

function buildWashitsu() {
  const frame = createFrame(W, H);
  const tk = toolkit(frame);
  const pal = basePal({
    wallTop: "#171220",
    wallBot: "#0f0b16",
    wainscot: "#241c2c",
    wainscotHi: "#33283c",
    wainscotLo: "#171120",
    floorFar: "#1d2118",
    floorNear: "#2b3123",
    floorSeam: "#161a12",
    floorSeamHi: "#333a28",
    floorShadow: "#120f14",
    corner: "#05040a",
    shadow: "#0a0710",
    frame: "#2c2334",
    frameHi: "#463a52",
    paper: "#8e88a4",
    paperHi: "#a29cba",
    paperLo: "#78728d",
    paperShade: "#6e6884",
    glass: "#b9b3c9",
    sheet: "#4e4860",
    sheetHi: "#5d5672",
    sheetLo: "#3a3448",
    sheetFold: "#8f88a2",
    sheetFoldLo: "#7b7490",
    pillow: "#cfc6d6",
    pillowHi: "#e4dce8",
    pillowLo: "#a9a0b4",
    pillowDeep: "#7d7590",
    lip: "#a8787c",
    blanket: "#3d3554",
    blanketHi: "#544a70",
    blanketLo: "#282141",
  });
  drawRoom(tk, pal, { floor: "tatami" });
  drawShoji(tk, pal);
  drawBedding(tk, pal);
  return {
    spots: makeSpots(BED.head.cx, BED.head.cy),
    inBeam,
    surfaceY,
    name: "TATAMI",
    jp: "和室",
    night: 40,
    bugs: 5,
    speed: 1.0,
    spotBias: 0.3,
    grace: 1.0,
    pal,
    frame,
    floor: "tatami",
    drawAmbient(p, t) {
      drawMotes(p, t, pal.paperHi, 12);
    },
    drawOver(p, t) {
      drawDuvet(p, t, pal);
    },
  };
}

function buildYoshitsu() {
  const frame = createFrame(W, H);
  const tk = toolkit(frame);
  const pal = basePal({
    wallTop: "#151726",
    wallBot: "#0e101b",
    wainscot: "#1f2233",
    wainscotHi: "#2c3048",
    wainscotLo: "#12141f",
    floorFar: "#191720",
    floorNear: "#241f2a",
    floorSeam: "#121019",
    floorSeamHi: "#2c2635",
    floorShadow: "#0d0b12",
    corner: "#05060c",
    shadow: "#08070e",
    frame: "#232a3c",
    frameHi: "#3a4560",
    glass: "#33477a",
    glassDark: "#1a2138",
    slat: "#2b3654",
    slatHi: "#3c4b73",
    slatLo: "#1a2137",
    clockBody: "#1b1a24",
    clockFace: "#0d0c12",
    clockLed: "#e8483c",
    sheet: "#4c5168",
    sheetHi: "#5b6078",
    sheetLo: "#383c4e",
    sheetFold: "#888fa4",
    sheetFoldLo: "#727a92",
    pillow: "#ccd2e0",
    pillowHi: "#e2e6f0",
    pillowLo: "#a3a9bb",
    pillowDeep: "#767c90",
    lip: "#9c7480",
    blanket: "#31405c",
    blanketHi: "#46587a",
    blanketLo: "#1f2a40",
  });
  drawRoom(tk, pal, { floor: "wood" });
  drawBlinds(tk, pal);
  drawClock(tk, pal);
  drawBedding(tk, pal);
  return {
    spots: makeSpots(BED.head.cx, BED.head.cy),
    inBeam,
    surfaceY,
    name: "WESTERN",
    jp: "洋室",
    night: 40,
    bugs: 6,
    speed: 1.12,
    spotBias: 0.38,
    grace: 0.86,
    pal,
    frame,
    floor: "wood",
    drawAmbient(p, t) {
      drawMotes(p, t, pal.slatHi, 10);
      // 時計のコロンが1秒ごとに点滅
      const q = hexPaint(p);
      const on = Math.floor(t * 2) % 2 === 0;
      if (on) {
        q.put(133, 47, pal.clockLed);
        q.put(133, 53, pal.clockLed);
      }
    },
    drawOver(p, t) {
      drawDuvet(p, t, pal);
    },
  };
}

function buildNatsu() {
  const frame = createFrame(W, H);
  const tk = toolkit(frame);
  const pal = basePal({
    wallTop: "#121629",
    wallBot: "#0b0e1c",
    wainscot: "#1a1f31",
    wainscotHi: "#262c42",
    wainscotLo: "#0f1320",
    floorFar: "#1a1e1a",
    floorNear: "#282d25",
    floorSeam: "#141813",
    floorSeamHi: "#33392b",
    floorShadow: "#0c0f0c",
    corner: "#05060d",
    shadow: "#08090f",
    frame: "#232a3e",
    frameHi: "#3d4763",
    skyHi: "#1d2a52",
    skyLo: "#0e1530",
    moon: "#dfe7ff",
    moonHi: "#f6f8ff",
    star: "#b9c6ee",
    starHi: "#ffffff",
    mesh: "#4a5570",
    fanStand: "#22202c",
    fanCage: "#6b6584",
    fanInner: "#20202e",
    fanBlade: "#575272",
    fanHub: "#8a82a4",
    sheet: "#494e63",
    sheetHi: "#585d73",
    sheetLo: "#35394a",
    sheetFold: "#868ea2",
    sheetFoldLo: "#6f7789",
    pillow: "#cdd2dd",
    pillowHi: "#e4e8ef",
    pillowLo: "#a3a8b5",
    pillowDeep: "#767b8a",
    lip: "#a8747e",
    blanket: "#46527a",
    blanketHi: "#5d6b96",
    blanketLo: "#2e3654",
  });
  drawRoom(tk, pal, { floor: "tatami" });
  drawNightWindow(tk, pal);
  drawFanStand(tk, pal);
  drawBedding(tk, pal);
  return {
    spots: makeSpots(BED.head.cx, BED.head.cy),
    inBeam,
    surfaceY,
    name: "SUMMER",
    jp: "夏の夜",
    night: 45,
    bugs: 7,
    speed: 1.22,
    spotBias: 0.46,
    grace: 0.74,
    pal,
    frame,
    floor: "tatami",
    drawAmbient(p, t) {
      const q = hexPaint(p);
      // 星のまたたき
      for (let i = 0; i < 22; i++) {
        const sx = 151 + ((i * 47) % 146);
        const sy = 9 + ((i * 23) % 34);
        const tw = Math.sin(t * 2.2 + i * 1.7);
        if (tw > 0.55) q.dot(sx, sy, pal.starHi, (tw - 0.55) * 0.9);
      }
      // 蛍
      for (let i = 0; i < 5; i++) {
        const x = 40 + ((i * 61 + t * 11) % 240);
        const y = 78 + Math.sin(t * 0.9 + i * 2.1) * 12 + Math.sin(t * 1.7 + i) * 4;
        const b = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.3 + i * 0.9));
        q.light(Math.round(x), Math.round(y), pal_warm, b * 0.55);
        q.dot(Math.round(x), Math.round(y), pal_warmHi, b);
      }
      drawMotes(p, t, pal.star, 8);
    },
    drawOver(p, t) {
      drawFanBlades(p, t, pal);
      drawDuvet(p, t, pal);
    },
  };
}

export const STAGES = [{ build: buildWashitsu }, { build: buildYoshitsu }, { build: buildNatsu }];
export const STAGE_NAMES = ["TATAMI", "WESTERN", "SUMMER"];

const cache = new Map();
/** ステージを1回だけ焼いて使い回す（毎回焼くと重い）。 */
export function stageWorld(i) {
  const k = clamp(i, 0, STAGES.length - 1);
  if (!cache.has(k)) {
    const w = STAGES[k].build();
    w.label = "NIGHT " + (k + 1);
    cache.set(k, w);
  }
  return cache.get(k);
}

void upper;
