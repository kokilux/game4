// 手。狙いはポインタ、手のひらは少し遅れて付いてくる。
// 叩くと「振りかぶって（予備動作）→弧を描いて→当たって→つぶれて（スカッシュ）→戻る」。
// 12原則のうち 2 予備動作 / 5 フォロースルー / 6 スローイン・スローアウト / 7 弧 / 1 つぶれ・伸び をここで担当。

import { C } from "./palette.js";
import { lerp, clamp01, easeOutCubic, easeInQuad } from "./draw.js";
import { surfaceY } from "./scene.js";

const ANTIC = 0.08; // 振りかぶり
const STRIKE = 0.055; // 打撃
const HOLD = 0.085; // 当たった瞬間の静止（ヒットストップ）
const RECOVER = 0.2; // 戻り
const TOTAL = ANTIC + STRIKE + HOLD + RECOVER;
export const SLAP_COOLDOWN = ANTIC + STRIKE + HOLD + 0.14;
export const IMPACT_AT = ANTIC + STRIKE;

// 手のひらの重心は狙いより少し右下（狙いを隠さない）
const REST_DX = 3;
const REST_DY = 12;

export function createHand(x = 210, y = 146) {
  return {
    x, y,
    tx: x, ty: y, // 狙い（ポインタ）
    aimX: x, aimY: y, // 叩く瞬間の狙い（叩き始めに固定）
    fromX: x, fromY: y,
    slapT: -1,
    cooldown: 0,
    impactDone: false,
  };
}

export function aim(h, x, y) {
  h.tx = x; h.ty = y;
}

export function canSlap(h) {
  return h.cooldown <= 0 && h.slapT < 0;
}

export function startSlap(h) {
  if (!canSlap(h)) return false;
  h.slapT = 0;
  h.fromX = h.x; h.fromY = h.y;
  h.aimX = h.tx; h.aimY = h.ty;
  h.impactDone = false;
  h.cooldown = SLAP_COOLDOWN;
  return true;
}

/** 狙いの点（当たり判定の中心）。 */
export function impactPoint(h) {
  return { x: h.aimX, y: h.aimY };
}

/** 叩き中の手の進み具合。-0.3（振りかぶり）→ 1（当たった） */
function strikeProgress(t) {
  if (t < 0) return 0;
  if (t < ANTIC) return -0.3 * easeOutCubic(t / ANTIC);
  if (t < ANTIC + STRIKE) return lerp(-0.3, 1, easeInQuad((t - ANTIC) / STRIKE));
  return 1;
}

export function updateHand(h, dt) {
  if (h.cooldown > 0) h.cooldown -= dt;
  if (h.slapT >= 0) {
    h.slapT += dt;
    const p = strikeProgress(h.slapT);
    const dx = h.aimX - h.fromX, dy = h.aimY - h.fromY;
    // 弧：進み具合に対して垂直方向にふくらませる
    const bow = Math.sin(clamp01((p + 0.3) / 1.3) * Math.PI) * 5;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    h.x = h.fromX + dx * p + nx * bow;
    h.y = h.fromY + dy * p + ny * bow;
    if (h.slapT > TOTAL) h.slapT = -1;
  } else {
    const k = 1 - Math.pow(0.0006, dt);
    h.x += (h.tx + REST_DX - h.x) * k;
    h.y += (h.ty + REST_DY - h.y) * k;
  }
}

/** 叩きの伸縮。{ sx, sy, glow } */
export function slapPose(h) {
  const t = h.slapT;
  if (t < 0) return { sx: 1, sy: 1, glow: 0 };
  if (t < ANTIC) {
    const p = easeOutCubic(t / ANTIC);
    return { sx: 1 - 0.12 * p, sy: 1 + 0.18 * p, glow: 0 };
  }
  if (t < ANTIC + STRIKE) {
    const p = easeInQuad((t - ANTIC) / STRIKE);
    return { sx: lerp(0.88, 1.2, p), sy: lerp(1.18, 0.84, p), glow: p > 0.75 ? 1 : 0 };
  }
  if (t < ANTIC + STRIKE + HOLD) return { sx: 1.36, sy: 0.62, glow: 1 };
  const p = easeOutCubic((t - ANTIC - STRIKE - HOLD) / RECOVER);
  const wobble = Math.sin(p * Math.PI) * 0.05;
  return { sx: lerp(1.36, 1, p) + wobble, sy: lerp(0.62, 1, p) - wobble, glow: Math.max(0, 0.6 - p) };
}

const TILT = -0.14; // 手首が右下から来るぶんの傾き

export function drawHand(p, h, t) {
  const { sx, sy, glow } = slapPose(h);
  const cx = h.x, cy = h.y;
  const slapping = h.slapT >= 0;

  // 布団の上にいるときだけ、手のすぐ下に影を落とす
  if (cy > 100) {
    p.ellipse(cx + 7, cy + 15, 9 * sx, 2.6, C.void, 0.55);
    p.ellipse(cx + 7, cy + 15, 7 * sx, 1.8, C.blanketLo);
  }

  const cs = Math.cos(TILT), sn = Math.sin(TILT);
  const at = (dx, dy) => [cx + dx * sx * cs - dy * sy * sn, cy + dx * sx * sn + dy * sy * cs];
  const ell = (dx, dy, rx, ry, c) => {
    const [X, Y] = at(dx, dy);
    p.ellipse(X, Y, rx * sx, ry * sy, c);
  };

  // 手首（腕）
  ell(2, 12, 6, 7, C.void);
  ell(2, 12, 5, 6, C.handLo);

  // [x, 指先のy, 長さ]
  const F = [
    [-8.6, -8.5, 8.5], // 小指
    [-2.9, -13.5, 13.5], // 薬指
    [2.9, -15.0, 15.0], // 中指
    [8.6, -11.5, 11.5], // 人差し指
  ];
  const THUMB = [-10.4, 2.2, 3.4, 5.4];

  // 1. 輪郭（指ごとに黒で囲む＝指の隙間が抜ける）
  for (const f of F) ell(f[0], f[1] + f[2] / 2, 2.9, f[2] / 2 + 1.2, C.void);
  ell(THUMB[0] - 0.6, THUMB[1], THUMB[2] + 1.1, THUMB[3] + 1.1, C.void);
  ell(0, 2.5, 12.5, 9.4, C.void);

  // 2. 塗り
  for (const f of F) ell(f[0], f[1] + f[2] / 2, 1.95, f[2] / 2, C.hand);
  ell(THUMB[0], THUMB[1], THUMB[2], THUMB[3], C.hand);
  ell(0, 2.5, 11.4, 8.4, C.hand);

  // 3. 光（右上）と影（下）
  for (const f of F) ell(f[0] - 0.3, f[1] + f[2] / 2 - 0.8, 1.2, f[2] / 2 - 1.2, C.handHi);
  ell(THUMB[0] - 0.4, THUMB[1] - 1.2, 2.0, 3.0, C.handHi);
  ell(1.0, -0.4, 8.4, 5.6, C.handHi);
  ell(-1.4, 6.4, 9.6, 2.8, C.handLo);
  ell(-10.6, 4.6, 2.2, 3.0, C.handLo);
  for (const f of F) ell(f[0], -3.8, 1.9, 1.1, C.handLo);
  const [wx1, wy1] = at(-5.5, 2.2), [wx2, wy2] = at(-1, 3.4);
  p.line(wx1, wy1, wx2, wy2, C.handLo);
  const [nx1, ny1] = at(1.5, 4.6), [nx2, ny2] = at(6, 3.2);
  p.line(nx1, ny1, nx2, ny2, C.handLo);

  // 打撃の芯が白く飛ぶ
  if (glow > 0.9) p.ellipse(cx, cy + 1, 5.5 * sx, 3.4 * sy, C.white);

  // 風切り（弧）
  if (slapping && h.slapT < ANTIC + STRIKE + 0.05) {
    const a = 0.9 - h.slapT * 8;
    if (a > 0) {
      p.arc(cx, cy - 14, 22, 2, Math.PI * 0.12, Math.PI * 0.88, C.pillowHi, a);
      p.arc(cx, cy - 20, 28, 1, Math.PI * 0.18, Math.PI * 0.82, C.textDim, a * 0.7);
    }
  }

  // 狙いの十字（ポインタの位置）
  if (!slapping) {
    const ax = Math.round(h.tx), ay = Math.round(h.ty);
    const a = 0.55 + Math.sin(t * 4) * 0.15;
    p.px(ax, ay - 4, C.textDim); p.px(ax, ay + 4, C.textDim);
    p.px(ax - 4, ay, C.textDim); p.px(ax + 4, ay, C.textDim);
    p.dot(ax, ay, C.text, a);
  }
}
