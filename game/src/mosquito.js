// 蚊。飛ぶ → 迷う → 着地寸前で「止まる」（＝予備動作）→ 着地 → 刺す、の繰り返し。
// 叩けるのは hover と land の間だけ。飛んでいる最中に叩くと空振りになる。

import { mix } from "../../vendor/pixelfx/src/core/index.js";
import { C } from "./palette.js";
import { lerp, clamp01, easeOutCubic, rng } from "./draw.js";

// 着地候補はステージ側（world.spots）が持つ。kind:"skin" は刺される＝危険。

const AIR = { x0: 16, x1: 304, y0: 22, y1: 92 };

export function createMosquito({ seed = 1, speed = 1, spotBias = 0.35 } = {}) {
  const r = rng(seed);
  const m = {
    x: 320, y: 40, vx: -40, vy: 0,
    state: "fly",
    t: 0,
    timer: 1.6 + r() * 1.6, // 着地を試みるまでの時間
    nextTurn: 0, // 次の進路変更まで
    wing: 0,
    spot: null,
    hoverFrom: null,
    landTimer: 0,
    homeX: 0, homeY: 0,
    speed,
    r,
    seed,
    jitter: r() * 6.28,
    bites: 0,
    spotBias,
    annoyed: false,
  };
  m.homeX = m.x; m.homeY = m.y;
  return m;
}

/** どの状態でも叩ける。ただし当たり半径は空中で小さい（=当てにくい）。 */
export const hittable = (m) => m.state !== "escape";
export const hitRadius = (m) => (m.state === "land" ? 18 : m.state === "hover" ? 15 : 10);
export const airborne = (m) => m.state === "fly" || m.state === "approach";

/** 空中で手が近づくと身をかわす：当てるには先読みが要る。 */
export const inDanger = (m, px, py) => {
  const dx = m.x - px, dy = m.y - py;
  return dx * dx + dy * dy < 30 * 30;
};

export function isLanded(m) {
  return m.state === "land";
}

/** 更新。戻り値はイベント（"bite" | "takeoff" | null）。 */
export function updateMosquito(m, dt, ctx) {
  const { player, t, world } = ctx;
  let event = null;
  m.t += dt;
  m.wing += dt * (m.state === "land" ? 6 : 46);

  // プレイヤーの手が近いと怯えて逃げる（飛んでいるときだけ）
  const dpx = m.x - player.x, dpy = m.y - player.y;
  const near = dpx * dpx + dpy * dpy < 30 * 30;

  if (m.state === "fly") {
    // ゆらゆら飛ぶ：目標点へ向かう舵 + 上下の揺れ
    if (m.t > m.nextTurn) {
      m.homeX = lerp(AIR.x0, AIR.x1, 0.1 + m.r() * 0.8);
      m.homeY = lerp(AIR.y0, AIR.y1, 0.1 + m.r() * 0.9);
      m.nextTurn = m.t + 1.2 + m.r() * 1.6;
    }
    const ang = Math.atan2(m.homeY - m.y, m.homeX - m.x);
    const want = 34 * m.speed;
    const steer = 240;
    m.vx += Math.cos(ang) * steer * dt;
    m.vy += Math.sin(ang) * steer * dt + Math.sin(m.t * 3.1 + m.jitter) * 30 * dt;
    if (near) {
      // 手から逃げる（空中で叩くのを難しくする）
      const d = Math.max(6, Math.hypot(dpx, dpy));
      m.vx += (dpx / d) * 420 * dt;
      m.vy += (dpy / d) * 420 * dt;
    }
    const sp = Math.hypot(m.vx, m.vy) || 1;
    const maxSp = want * (near ? 2.3 : 1);
    if (sp > maxSp) { m.vx = (m.vx / sp) * maxSp; m.vy = (m.vy / sp) * maxSp; }
    m.x += m.vx * dt; m.y += m.vy * dt;
    // 画面内に押し戻す
    if (m.x < AIR.x0) { m.x = AIR.x0; m.vx = Math.abs(m.vx); }
    if (m.x > AIR.x1) { m.x = AIR.x1; m.vx = -Math.abs(m.vx); }
    if (m.y < AIR.y0) { m.y = AIR.y0; m.vy = Math.abs(m.vy); }
    if (m.y > AIR.y1) { m.y = AIR.y1; m.vy = -Math.abs(m.vy); }

    if (m.timer - m.t < 0.45 && !m.picked) {
      // 着地の予告：狙いを決めて、羽音が高くなる
      m.picked = true;
      m.nextIntent = pickSpot(m, world);
    }
    if (m.t > m.timer) {
      m.spot = m.nextIntent ?? pickSpot(m, world);
      m.state = "approach";
      m.t = 0;
      m.picked = false;
      m.fromX = m.x; m.fromY = m.y;
      m.hoverX = m.spot.x + (m.r() - 0.5) * 3;
      m.hoverY = m.spot.y - 7;
    }
  } else if (m.state === "approach") {
    const p = clamp01(m.t / 0.55);
    const e = easeOutCubic(p);
    m.x = lerp(m.fromX, m.hoverX, e) + Math.sin(m.t * 22) * 0.6 * (1 - e);
    m.y = lerp(m.fromY, m.hoverY, e);
    m.vx = 0; m.vy = 0;
    if (p >= 1) { m.state = "hover"; m.t = 0; }
  } else if (m.state === "hover") {
    // 止まって震える：これが唯一の予告（アニメーションの「予備動作」）
    m.x = m.hoverX + Math.sin(m.t * 40) * 0.9;
    m.y = m.hoverY + Math.cos(m.t * 33) * 0.5;
    if (m.t > 0.32 / m.speed) {
      m.state = "land";
      m.t = 0;
      m.x = m.spot.x;
      m.y = m.spot.y;
      m.landTimer = (m.spot.kind === "skin" ? 1.0 : 1.5) / m.speed; // 奥の夜ほど短い
      m.vx = 0; m.vy = 0;
    }
  } else if (m.state === "land") {
    m.landTimer -= dt;
    // 着地中は羽をたたむ（描画側で判断）
    if (m.landTimer <= 0) {
      if (m.spot.kind === "skin") {
        m.bites++;
        event = "bite";
        startEscape(m);
      } else {
        event = "takeoff";
        m.annoyed = true; // 無視された蚊は、次は肌（顔・耳）を狙う
        startEscape(m);
      }
    }
  } else if (m.state === "escape") {
    const p = clamp01(m.t / 0.75);
    m.x += m.vx * dt; m.y += m.vy * dt;
    m.vx *= 1 - 2.4 * dt; m.vy *= 1 - 2.4 * dt;
    if (p >= 1) {
      m.state = "fly";
      m.t = 0;
      m.timer = m.t + (1.5 + m.r() * 1.5) / m.speed;
      m.nextTurn = m.t + 0.6;
      m.spot = null;
    }
    m.x = Math.max(AIR.x0, Math.min(AIR.x1, m.x));
    m.y = Math.max(AIR.y0, Math.min(AIR.y1, m.y));
  }
  return event;
}

export function flee(m) {
  startEscape(m);
}

function startEscape(m) {
  m.state = "escape";
  m.t = 0;
  const ax = m.x + (m.r() - 0.5) * 90;
  const ay = Math.max(AIR.y0, m.y - 26 - m.r() * 20);
  const d = Math.hypot(ax - m.x, ay - m.y) || 1;
  m.vx = ((ax - m.x) / d) * 150 * m.speed;
  m.vy = ((ay - m.y) / d) * 150 * m.speed;
}

function pickSpot(m, world) {
  // 顔など肌を狙う確率は難易度（spotBias）で上がる
  const spots = world.spots;
  const skin = spots.filter((s) => s.kind === "skin");
  const rest = spots.filter((s) => s.kind !== "skin");
  const wantSkin = m.annoyed || m.r() < m.spotBias;
  const pool = wantSkin && skin.length ? skin : rest;
  const spot = pool[Math.floor(m.r() * pool.length)];
  if (spot.kind === "skin") m.annoyed = false;
  return spot;
}

/** 着地中に刺すまでの残り時間（HUD の警告に使う）。 */
export function biteEta(m) {
  return m.state === "land" && m.spot?.kind === "skin" ? Math.max(0, m.landTimer) : Infinity;
}

export function drawMosquito(p, m, t, world) {
  const { x, y } = m;
  const landed = m.state === "land";
  const hover = m.state === "hover";
  const visible = world.inBeam(x, y) || landed || hover;
  const hittableNow = hittable(m);

  // 着地しているときは、必ず足元に影
  if (landed || hover) {
    p.ellipse(x + 2, y + 2.4, 5, 1.4, C.void, 0.75);
    p.ellipse(x + 2, y + 2.2, 3.4, 0.9, C.blanketLo);
  }

  // 羽音の波紋（暗闇で位置を探す手がかり）
  // 半透明のリングはディザで「点々」になり、埃に見える。四方向の短い線で描く。
  if (!landed) {
    const pulse = (t * 1.15) % 1;
    const r = 6 + pulse * 9;
    const col = visible ? mix(C.void, C.wing, 0.5) : mix(C.void, C.wing, 0.3);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      p.line(x + dx * r * 0.62, y + dy * r * 0.5, x + dx * r, y + dy * r * 0.8, col);
    }
  }

  // 本体の明度：月明かりの中では明るく、暗がりではシルエット
  const body = visible ? C.bugHi : C.bug;
  const bodyHi = visible ? C.wing : C.bugHi;

  // ---- 胴（腹部 → 胸 → 頭）。右が頭 ----
  p.ellipse(x - 3.8, y + 0.8, 3.6, 2.1, C.bugRim);   // 腹部の輪郭
  p.ellipse(x - 0.4, y + 0.3, 2.6, 2.4, C.bugRim);   // 胸の輪郭
  p.ellipse(x + 2.6, y - 0.3, 1.9, 2.0, C.bugRim);   // 頭の輪郭
  p.ellipse(x - 3.8, y + 0.6, 2.8, 1.5, body);       // 腹部
  p.ellipse(x - 0.4, y + 0.2, 1.9, 1.8, body);       // 胸
  p.ellipse(x + 2.6, y - 0.3, 1.3, 1.5, bodyHi);     // 頭（やや明るく）
  // 腹部の縞
  p.px(x - 5.6, y + 0.6, C.bug);
  p.px(x - 4.2, y + 0.4, C.bug);
  p.px(x - 2.6, y + 0.6, C.bug);
  // 目
  p.px(x + 3, y - 1, C.bugEye);

  // ---- 口吻（針）----
  p.line(x + 3.6, y - 0.6, x + 7.6, y + 1.2, C.bug);
  p.px(x + 7.6, y + 1.2, C.bugRim);
  // 触角
  p.line(x + 3.2, y - 2, x + 5.2, y - 3.4, C.bugRim, 0.8);
  p.line(x + 2.6, y - 2.2, x + 3.4, y - 4, C.bugRim, 0.6);

  // ---- 脚（6本）----
  const legs = landed
    ? [
        [1.4, 1.4, 2.4, 2.8, 3.2, 3.4],
        [0.0, 1.8, -0.6, 3.2, 0.2, 3.8],
        [-2.2, 1.6, -3.4, 3.0, -3.8, 3.6],
        [2.2, 0.6, 4.0, 1.6, 5.0, 2.6],
      ]
    : [
        [1.4, 1.4, 2.2, 2.6, 3.0, 3.6],
        [0.0, 1.8, -0.4, 3.0, 0.0, 4.2],
        [-2.2, 1.6, -3.2, 2.8, -3.6, 4.0],
        [2.2, 0.6, 3.8, 1.4, 4.8, 2.4],
      ];
  for (const [ax, ay, bx, by, cx2, cy2] of legs) {
    p.line(x + ax, y + ay, x + bx, y + by, C.bug);
    p.line(x + bx, y + by, x + cx2, y + cy2, C.bugRim);
  }

  const flap = Math.sin(m.wing * 2);

  // ---- 羽（2枚）: 胸から後ろ上へ ----
  if (landed) {
    // たたんだ羽：背中に沿わせる
    p.place(x - 0.4, y - 1.3, false, Math.PI + 0.16);
    p.ellipse(3.0, 0, 3.4, 1.5, C.wing, 0.45);
    p.ellipse(3.2, -0.4, 3.0, 0.5, C.wingHi, 0.5);
    p.place(0, 0);
  } else {
    const up = flap > 0;
    for (const side of [0, 1]) {
      const ang = Math.PI + (up ? 0.72 : 0.34) + side * 0.22;
      p.place(x - 0.4, y - 1.2 - side * 0.6, false, ang);
      p.ellipse(3.0, 0, 3.2, side ? 1.3 : 1.8, C.wing, side ? 0.3 : 0.42);
      p.ellipse(3.2, -0.6, 2.4, 0.5, C.wingHi, side ? 0.26 : 0.4);
      p.place(0, 0);
    }
    // 羽の残像（下側の弧）
    p.place(x - 0.4, y - 1.2, false, Math.PI + 0.06);
    p.ellipse(3.4, 0, 3.4, 0.7, C.wing, 0.14);
    p.place(0, 0);
  }

  // 狙える合図：体の四方向に短い目盛り（リングの点々は埃に見えた）
  if (hittableNow && (hover || landed)) {
    const a = 0.45 + Math.sin(t * 16) * 0.25;
    const col = a > 0.5 ? C.wingHi : C.wing;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      p.line(x + 1 + dx * 6, y + 0.4 + dy * 5, x + 1 + dx * 8.5, y + 0.4 + dy * 7, col);
    }
  }
  // 光の帯の中ではリムライト
  if (visible) {
    p.px(x - 0.6, y - 1.6, C.wingHi);
    p.px(x + 1.8, y - 1.8, C.wing);
  }
}
