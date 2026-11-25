// 蚊。飛ぶ → 迷う → 着地寸前で「止まる」（＝予備動作）→ 着地 → 刺す、の繰り返し。
// 叩けるのは hover と land の間だけ。飛んでいる最中に叩くと空振りになる。

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
      m.landTimer = m.spot.kind === "skin" ? 1.45 : 2.6;
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
  const wantSkin = m.r() < m.spotBias;
  const pool = wantSkin && skin.length ? skin : rest;
  return pool[Math.floor(m.r() * pool.length)];
}

/** 着地中に刺すまでの残り時間（HUD の警告に使う）。 */
export function biteEta(m) {
  return m.state === "land" && m.spot?.kind === "skin" ? Math.max(0, m.landTimer) : Infinity;
}

export function drawMosquito(p, m, t, world) {
  const { x, y } = m;
  const landed = m.state === "land";
  const visible = world.inBeam(x, y) || landed || m.state === "hover";
  const hittableNow = hittable(m);

  // 着地しているときだけ、足元に小さな影
  if (landed && y > 96) {
    p.ellipse(x + 1.5, y + 2.2, 4, 1.3, C.void);
    p.ellipse(x + 1.5, y + 2.0, 3, 0.8, C.blanketLo);
  }

  // 羽音の波紋（暗闇で位置を探す手がかり）
  const pulse = (t * 1.15) % 1;
  if (!landed) {
    p.ring(x, y, 5 + pulse * 13, 1, C.wing, 0.22 * (1 - pulse));
    p.ring(x, y, 3 + pulse * 7, 1, C.bugRim, 0.3 * (1 - pulse));
  }

  // 体：暗い壁でも輪郭が読めるように、ひと回り大きいリム色を敷く
  const body = visible ? C.bugHi : C.bug;
  const rim = visible ? C.wingHi : C.bugEye;
  p.ellipse(x, y, 5.4, 2.9, C.bugRim);
  p.ellipse(x + 4.2, y - 1.1, 2.6, 2.4, C.bugRim);
  p.ellipse(x, y, 4.4, 2.1, C.bug);
  p.ellipse(x - 0.4, y - 0.3, 3.6, 1.5, body);
  // 頭
  p.circle(x + 4.2, y - 1.1, 1.7, body);
  p.px(x + 4, y - 2, C.bugEye);
  // 口吻
  p.line(x + 5, y - 0.4, x + 9, y + 0.8, C.bug);
  // 腹部の縞
  p.px(x - 1, y + 0.4, C.bug);
  p.px(x - 2.5, y + 0.3, C.bug);

  if (landed) {
    // 着地：羽をたたみ、脚を出す
    p.line(x - 1, y + 1.4, x - 3, y + 3.6, C.bug);
    p.line(x + 1, y + 1.6, x + 0.5, y + 3.8, C.bug);
    p.line(x + 3, y + 1.2, x + 4.5, y + 3.2, C.bug);
    p.line(x - 2, y - 0.6, x - 4.5, y + 0.6, C.bug);
    p.line(x + 3.4, y - 1.8, x + 5.4, y - 3.2, C.bug);
    p.line(x + 2.6, y - 2.2, x + 3.6, y - 4.2, C.bug);
    // たたんだ羽
    p.ellipse(x - 1.4, y - 1.5, 3.2, 1.1, C.wing, 0.95);
    p.px(x + 2, y - 3, rim);
  } else {
    // 羽ばたき：2コマのブラー
    const up = Math.sin(m.wing) > 0;
    const wy = up ? -3.4 : -1.6, spread = up ? 1.5 : 3.4;
    p.ellipse(x - 0.5, y + wy, 4.6, spread, C.wing, up ? 0.95 : 0.6);
    p.ellipse(x - 0.5, y + wy - 1, 3.4, 0.6, C.wingHi, up ? 0.5 : 0.25);
    // 脚
    p.line(x - 0.5, y + 1.6, x - 2.4, y + 3.4, C.bug);
    p.line(x + 1.2, y + 1.4, x + 2.4, y + 3.2, C.bug);
  }

  // ねらえる瞬間の合図（小さな十字）
  if (hittableNow) {
    const a = 0.5 + Math.sin(t * 18) * 0.3;
    p.dot(x - 6, y - 5, C.wingHi, a);
    p.dot(x + 7, y - 5, C.wingHi, a);
    p.dot(x - 6, y + 5, C.wingHi, a);
    p.dot(x + 7, y + 5, C.wingHi, a);
  }
  // 光の帯の中ではリムライト
  if (visible) {
    p.px(x - 0.4, y - 2.2, C.wingHi);
    p.px(x + 2, y - 2, rim);
  }
}
