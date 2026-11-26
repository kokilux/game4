// 蚊。飛ぶ → 迷う → 着地寸前で「止まる」（＝予備動作）→ 着地 → 刺す、の繰り返し。
// 叩けるのは hover と land の間だけ。飛んでいる最中に叩くと空振りになる。

import { mix } from "../../vendor/pixelfx/src/core/index.js";
import { C } from "./palette.js";
import { lerp, clamp01, easeOutCubic, rng } from "./draw.js";

// 着地候補はステージ側（world.spots）が持つ。kind:"skin" は刺される＝危険。

// 巡航する帯（壁のあたり）。出入りは画面のどこからでもよいので、移動の上限は画面全体。
const BAND = { x0: 16, x1: 304, y0: 22, y1: 92 };
const SCREEN = { x0: 6, x1: 314, y0: 8, y1: 172 };

export function createMosquito({ seed = 1, speed = 1, spotBias = 0.35, entry = null } = {}) {
  const r = rng(seed);
  const e = entry ?? { x: 322, y: 40, vx: -40, vy: 0 };
  const m = {
    x: e.x ?? 320, y: e.y ?? 40, vx: e.vx ?? -40, vy: e.vy ?? 0,
    zone: SCREEN,
    popIn: !!e.popIn,      // 画面の中に現れた（予告の輪を出す）
    spawnT: 0,
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
  if (m.spawnT < 1) m.spawnT += dt;
  m.wing += dt * (m.state === "land" ? 6 : 46);

  // プレイヤーの手が近いと怯えて逃げる（飛んでいるときだけ）
  const dpx = m.x - player.x, dpy = m.y - player.y;
  const near = dpx * dpx + dpy * dpy < 30 * 30;

  const Z = m.zone ?? SCREEN;
  if (m.state === "fly") {
    // ゆらゆら飛ぶ：目標点へ向かう舵 + 上下の揺れ
    if (m.t > m.nextTurn) {
      m.homeX = lerp(BAND.x0, BAND.x1, 0.1 + m.r() * 0.8);
      m.homeY = lerp(BAND.y0, BAND.y1, 0.1 + m.r() * 0.9);
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
    if (m.x < Z.x0) { m.x = Z.x0; m.vx = Math.abs(m.vx); }
    if (m.x > Z.x1) { m.x = Z.x1; m.vx = -Math.abs(m.vx); }
    if (m.y < Z.y0) { m.y = Z.y0; m.vy = Math.abs(m.vy); }
    if (m.y > Z.y1) { m.y = Z.y1; m.vy = -Math.abs(m.vy); }

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
      // 遠くから来たときは、そのぶん長く飛ぶ（ワープに見せない）
      const dist = Math.hypot(m.hoverX - m.fromX, m.hoverY - m.fromY);
      m.approachDur = Math.max(0.55, Math.min(1.15, dist / 260));
    }
  } else if (m.state === "approach") {
    const p = clamp01(m.t / (m.approachDur ?? 0.55));
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
      // 着地してから刺されるまでの猶予。夜を追うごとに短くなる（ステージ側の grace）
      m.landTimer = ((m.spot.kind === "skin" ? 1.0 : 1.5) * (world.grace ?? 1)) / m.speed;
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
    m.x = Math.max(Z.x0, Math.min(Z.x1, m.x));
    m.y = Math.max(Z.y0, Math.min(Z.y1, m.y));
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
  const ay = Math.max(BAND.y0, m.y - 26 - m.r() * 20);
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
  if (!landed && !visible) {
    const pulse = (t * 1.15) % 1;
    const r = 5 + pulse * 5;
    const col = mix(C.void, C.wing, 0.34);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      p.line(x + dx * r * 0.7, y + dy * r * 0.6, x + dx * r, y + dy * r * 0.8, col);
    }
  }

  // 本体の明度：月明かりの中では明るく、暗がりではシルエット
  const body = visible ? C.bugHi : C.bug;
  const bodyHi = visible ? C.wing : C.bugHi;

  // ---- 胴（腹部 → 胸 → 頭）。右が頭 ----
  // 輪郭を bugRim でしっかり取り、内側を body で塗る（暗がりでも形が読える）。
  // 腹部は先細り：後ろへ行くほど細く、先端は1pxの針。
  const rear = 6.2;
  for (let i = 0; i < 5; i++) {
    const k = i / 4;                        // 0=尾 1=胸
    const rx = 1.1 + k * 1.5;
    const ry = 0.7 + k * 1.1;
    const cx2 = x - rear + k * (rear - 1.4);
    const cy2 = y + 0.9 - k * 0.6;
    p.ellipse(cx2, cy2, rx, ry, C.bugRim);
    p.ellipse(cx2, cy2 - 0.3, rx * 0.66, ry * 0.6, body);
  }
  // 胸
  p.ellipse(x - 0.2, y + 0.2, 2.4, 2.3, C.bugRim);
  p.ellipse(x - 0.2, y - 0.1, 1.7, 1.6, body);
  // 頭
  p.ellipse(x + 2.5, y - 0.4, 1.8, 1.8, C.bugRim);
  p.ellipse(x + 2.5, y - 0.6, 1.2, 1.2, bodyHi);
  // 腹の節（3本の細い帯）
  for (let i = 0; i < 3; i++) {
    p.px(x - 4.4 + i * 1.7, y + 1.1 - i * 0.2, C.bug);
  }
  // 目（頭の上側）
  p.px(x + 3.1, y - 1.1, C.bugEye);

  // ---- 口吻（針）----
  p.line(x + 3.4, y - 0.3, x + 7.2, y + 1.4, C.bug);
  p.px(x + 7.2, y + 1.4, C.bugRim);
  // 触角（2本、上へ）
  p.line(x + 3.0, y - 2.0, x + 4.8, y - 3.8, C.bugRim, 0.85);
  p.line(x + 2.4, y - 2.2, x + 2.8, y - 4.2, C.bugRim, 0.7);

  // ---- 脚（3本・2関節）。膝を体の上に跳ね上げると蚊らしくなる（6本だと1pxでは蜘蛛に見える） ----
  const legs = landed
    ? [
        [1.4, 1.6, 2.6, 2.6, 3.4, 3.2],   // 前脚（接地）
        [0.0, 1.9, -0.6, 2.8, -0.2, 3.8],  // 中脚
        [-2.4, 1.7, -3.6, 2.6, -4.0, 3.4], // 後脚
      ]
    : [
        [1.4, 1.4, 2.6, 0.2, 3.4, 2.2],    // 前脚：膝を上げてから下ろす
        [0.0, 1.8, -1.4, 0.6, -1.8, 3.4],  // 中脚
        [-2.4, 1.6, -4.0, 0.4, -4.6, 3.0], // 後脚
      ];
  for (const [ax, ay, bx, by, cx2, cy2] of legs) {
    p.line(x + ax, y + ay, x + bx, y + by, C.bugRim);
    p.line(x + bx, y + by, x + cx2, y + cy2, C.bug);
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
      const ang = Math.PI + (up ? 0.78 : 0.3) + side * 0.2;
      p.place(x - 0.2, y - 1.2 - side * 0.7, false, ang);
      p.ellipse(2.6, 0, 2.7, side ? 1.1 : 1.5, C.wing, side ? 0.34 : 0.46);
      p.ellipse(2.7, -0.5, 1.9, 0.4, C.wingHi, side ? 0.3 : 0.45);
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
