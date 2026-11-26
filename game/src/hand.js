// 手。狙いはポインタ、手のひらは少し遅れて付いてくる。
// 叩くと「振りかぶって（予備動作）→弧を描いて→当たって→つぶれて（スカッシュ）→戻る」。
// 12原則のうち 2 予備動作 / 5 フォロースルー / 6 スローイン・スローアウト / 7 弧 / 1 つぶれ・伸び をここで担当。

import { mix } from "../../vendor/pixelfx/src/core/index.js";
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

// 手首が右下から来るぶんの傾き
const TILT = -0.12;

// 上から見た平手。指を広げた形と、叩きつけて潰れた形の2枚で「つぶれ・伸び」を作る。
// 文字は #=輪郭 / S=肌 / H=明るみ / L=陰 / W=手首
const HAND_OPEN = [
  "........................",
  "...........##...........",
  "..........#SS#..##......",
  "......##.#HHHH##SS#.....",
  ".....#SS##HHHH#HHHH#....",
  "....#HHHH#SSSS#HHHH#....",
  "....#HHHH#SSSS#SSSS#.#..",
  "....#SSSS#SSSS#SSSS##S#.",
  "....#SSSS#SSSS#SSSS#HHH#",
  "....#SSSS#SSSS#SSSS#HHH#",
  "....#SSSS#SSSS#SSSS#SSS#",
  "....#SSSSSSSSSSSSSS#SSS#",
  "...##HHHHSHHHHSHHHHLHHH#",
  ".##SSLLLLSLLLLSLLLLLL##.",
  "#SSSSSSLSSSSSSSSSSSSL#..",
  "SSSSSSSLSSSSSSSSSSSSSL#.",
  "SSSSSSSLSSSSSSSSSSSSSL#.",
  "SSSSSSSLSSSSSSSSSSSSSL#.",
  "#SSSSSSLSSSSSSSSSSSSSL#.",
  ".#SSSSSSSSSSSSSSSSSSSL#.",
  "..###SSSSSSSSSSSSSSSL#..",
  "....#SSSSSSSSSSSSSSSL#..",
  ".....#LLLLLLLLLLLLLL#...",
  "......##LLLLLLLLLL##....",
  "........##WWWWWW##......",
  "........#LLLLLLLL#......",
  "........#WWWWWWWW#......",
  ".........#WWWWWW#.......",
  "..........#WWWW#........",
  "...........####.........",
];

const HAND_FLAT = [
  ".....#SS##HHHH#HHHH#....",
  "....#HHHH#SSSS#HHHH#....",
  "....#HHHH#SSSS#SSSS#.#..",
  "....#SSSS#SSSS#SSSS##S#.",
  "....#SSSS#SSSS#SSSS#HHH#",
  "....#SSSS#SSSS#SSSS#HHH#",
  "....#SSSS#SSSS#SSSS#SSS#",
  "....#SSSSSSSSSSSSSS#SSS#",
  "...##HHHHSHHHHSHHHHLHHH#",
  ".##SSLLLLSLLLLSLLLLLL##.",
  "#SSSSSSLSSSSSSSSSSSSL#..",
  "SSSSSSSLSSSSSSSSSSSSSL#.",
  "SSSSSSSLSSSSSSSSSSSSSL#.",
  "SSSSSSSLSSSSSSSSSSSSSL#.",
  "#SSSSSSLSSSSSSSSSSSSSL#.",
  ".#SSSSSSSSSSSSSSSSSSSL#.",
  "..###SSSSSSSSSSSSSSSL#..",
  "....#SSSSSSSSSSSSSSSL#..",
  ".....#LLLLLLLLLLLLLL#...",
  "......##LLLLLLLLLL##....",
  "........##WWWWWW##......",
  "........#LLLLLLLL#......",
  "........#WWWWWWWW#......",
  ".........#WWWWWW#.......",
  "..........#WWWW#........",
  "...........####.........",
];

const HAND_PALM = { x: 12, y: 17 }; // 手のひらの中心（スプライト内）
const FLAT_PALM = { x: 12, y: 13 }; // 叩いた形は指4pxぶん縮む

/**
 * 上から見た平手。叩くと「潰れた手」に差し替わる（＝スカッシュ）。
 */
export function drawHand(p, h, t) {
  const { sx, sy, glow } = slapPose(h);
  const cx = h.x, cy = h.y;
  const slapping = h.slapT >= 0;
  const flat =
    slapping && h.slapT > ANTIC + STRIKE * 0.82 && h.slapT < ANTIC + STRIKE + HOLD * 1.05;

  // 布団の上にいるときだけ、手のすぐ下に影を落とす
  if (cy > 96) {
    // 半透明のディザ影は「水たまり」に見えるので、ベタの中間色で置く
    p.ellipse(cx + 8, cy + 17, 10 * sx, 2.2, mix(C.void, C.blanketLo, 0.55));
    p.ellipse(cx + 8, cy + 17, 7.5 * sx, 1.4, C.blanketLo);
  }

  const pal = { "#": C.handLine, S: C.hand, H: C.handHi, L: C.handLo, W: C.handWrist };
  const rows = flat ? HAND_FLAT : HAND_OPEN;
  const c0 = flat ? FLAT_PALM : HAND_PALM;
  p.place(cx, cy, false, TILT);
  p.sprite(rows, pal, -c0.x, -c0.y);
  if (glow > 0.9) p.disc(0, -2, 4.5, C.white, 0.7);
  p.place(0, 0);

  // 風切り（弧）— 画面座標
  if (slapping && h.slapT < ANTIC + STRIKE + 0.06) {
    const a = Math.max(0, 0.85 - h.slapT * 7);
    if (a > 0.02) {
      p.arc(cx, cy - 12, 23, 2, Math.PI * 0.15, Math.PI * 0.85, C.pillowHi, a);
      p.arc(cx, cy - 18, 29, 1, Math.PI * 0.2, Math.PI * 0.8, C.textDim, a * 0.6);
    }
  }

  // 狙いの点。手のひらの中心に1pxだけ点く（青い十字は指の上で汚れて見えたので廃止）
  if (!slapping) {
    p.px(Math.round(h.tx), Math.round(h.ty), C.handHi);
  }
}
