// KA — 夜の蚊取り。1晩45秒、蚊を7匹仕留める。叩けるのは着地の瞬間だけ。

import { createFrame, painterFor, mix } from "../../vendor/pixelfx/src/core/index.js";
import { C, W, H, NIGHT } from "./palette.js";
import { buildStatic, drawSleeper, drawAmbient, surfaceY } from "./scene.js";
import { createMosquito, updateMosquito, drawMosquito, hittable, biteEta, SPOTS } from "./mosquito.js";
import { createHand, aim, startSlap, updateHand, drawHand, impactPoint, slapPose, canSlap, IMPACT_AT } from "./hand.js";
import { createFxLayer } from "./fx.js";
import { text, labelWidth, rng, clamp01, easeOutCubic, lerp } from "./draw.js";

const MAX_BUGS = 7;
const HP_START = 3;
const SLAP_RADIUS = 17;
const FLASH = 0.05; // 当たった瞬間の白フラッシュ（実時間 約3フレーム）

export function createGame({ seed = 3 } = {}) {
  const g = {
    t: 0,
    night: 0, // 経過（ポーズ中は止まる）
    phase: "ready", // ready | play | dawn | over
    hp: HP_START,
    kills: 0,
    misses: 0,
    bites: 0,
    combo: 0,
    bestCombo: 0,
    score: 0,
    spawnIn: 0.8,
    bugs: [],
    bugId: 0,
    splats: [],
    marks: [],
    hitStop: 0,
    flash: 0,
    shake: 0,
    popups: [],
    events: [],
    fx: createFxLayer(),
    hand: createHand(230, 150),
    bg: buildStatic(),
    r: rng(seed),
    seed,
    dawnT: 0,
    endReason: null,
    banner: null,
    revealT: 0,
    showPrinciples: true, // P キーで切替（実装した12原則の表示）
    principle: { name: "", t: 0 },
  };

  /** いま効いているアニメーション原則を表示用に記録する。 */
  function notePrinciple(name, dur = 0.45) {
    g.principle = { name, t: dur };
  }

  // ---- 入力
  function pointer(x, y) {
    aim(g.hand, Math.max(8, Math.min(W - 8, x)), Math.max(10, Math.min(H - 6, y)));
  }
  function slap() {
    if (g.phase !== "play") return false;
    if (g.hitStop > 0) return false;
    if (!canSlap(g.hand)) return false;
    startSlap(g.hand);
    g.events.push({ type: "swing" });
    return true;
  }

  // ---- 進行
  function spawnBug() {
    const n = g.kills + g.bites;
    const speed = 1 + n * 0.11;
    const bug = createMosquito({
      seed: (g.seed * 7919 + 11 + g.bugId * 131) % 100000,
      speed,
      spotBias: Math.min(0.62, 0.34 + n * 0.04),
    });
    g.bugId++;
    g.bugs.push(bug);
    g.events.push({ type: "buzz-in" });
  }

  function popup(str, x, y, color = C.text, big = false) {
    g.popups.push({ str, x, y, t: 0, life: 0.9, color, big });
  }

  function addSplat(x, y, kind) {
    const r = g.r;
    const lumps = [];
    const n = kind === "skin" ? 5 : 7;
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = 2 + r() * (kind === "wall" ? 9 : 6);
      lumps.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.8, s: 1 + Math.floor(r() * 2) });
    }
    g.splats.push({ x, y, lumps, t: 0, kind, big: kind === "skin" });
  }

  function addMark(spot) {
    g.marks.push({ x: spot.x, y: spot.y, t: 0 });
  }

  function resolveImpact() {
    const h = g.hand;
    h.impactDone = true;
    const ip = impactPoint(h);
    let target = null, best = SLAP_RADIUS;
    for (const b of g.bugs) {
      if (!hittable(b)) continue;
      const d = Math.hypot(b.x - ip.x, b.y - ip.y);
      if (d < best) { best = d; target = b; }
    }
    if (target) killBug(target, ip);
    else missSlap(ip);
  }

  function killBug(bug, ip) {
    notePrinciple("SQUASH & STRETCH", 0.5);
    const landed = bug.state === "land";
    const grace = bug.spot?.kind === "skin" ? 1.2 : 2.0;
    const fast = landed && bug.landTimer > grace;
    const onSkin = bug.spot?.kind === "skin";
    g.kills++;
    g.combo++;
    g.bestCombo = Math.max(g.bestCombo, g.combo);
    const gain = 100 + (fast ? 50 : 0) + Math.min(5, g.combo - 1) * 10;
    g.score += gain;

    g.hitStop = 0.09;
    g.flash = FLASH;
    g.shake = 0.22;
    g.fx.slap(bug.x, bug.y, fast);
    addSplat(bug.x, bug.y, bug.spot?.kind ?? "wall");
    popup(fast ? "PACHI!!" : "PACHI!", bug.x, bug.y - 14, C.warm, true);
    g.revealT = 0.25;
    if (fast) popup("+" + gain, bug.x, bug.y - 24, C.textDim);
    else popup("+" + gain, bug.x, bug.y - 24, C.textDim);

    g.bugs = g.bugs.filter((b) => b !== bug);
    g.events.push({ type: "kill", fast, onSkin });
    if (g.kills >= MAX_BUGS) endGame("clear");
    else g.spawnIn = 1.15;
  }

  function missSlap(ip) {
    notePrinciple("ARCS / FOLLOW THROUGH", 0.45);
    g.misses++;
    g.combo = 0;
    g.shake = 0.08;
    g.events.push({ type: "whiff" });
    // 空振りの砂ぼこり
    for (let i = 0; i < 3; i++) g.fx.thud(ip.x + (g.r() - 0.5) * 10, ip.y + (g.r() - 0.5) * 6);
    if (ip.y < 96) popup("MISS", ip.x, ip.y - 12, C.textDim);
  }

  function endGame(reason) {
    if (g.phase !== "play") return;
    g.phase = reason === "dawn" ? "dawn" : "over";
    g.endReason = reason;
    g.dawnT = 0;
    const hpBonus = g.hp * 150;
    const clearBonus = reason === "clear" ? 500 : 0;
    g.score += hpBonus + clearBonus;
    g.finalScore = g.score;
    g.banner = reason === "clear" ? "CLEAN NIGHT" : reason === "eaten" ? "NO SLEEP" : "DAWN";
    g.events.push({ type: "end", reason });
  }

  function start() {
    if (g.phase !== "ready") return;
    g.phase = "play";
    g.night = 0;
    g.t = 0;
    g.spawnIn = 0.8;
    g.events.push({ type: "start" });
  }

  function restart() {
    g.phase = "ready";
    g.t = 0; g.night = 0;
    g.hp = HP_START; g.kills = 0; g.misses = 0; g.bites = 0; g.combo = 0; g.bestCombo = 0;
    g.score = 0; g.spawnIn = 0.8; g.bugs = []; g.splats = []; g.marks = [];
    g.popups = []; g.hitStop = 0; g.flash = 0; g.shake = 0; g.endReason = null; g.banner = null;
    g.fx.clear();
    g.hand = createHand(230, 150);
  }

  function update(dt) {
    dt = Math.min(dt, 1 / 30);
    g.t += dt;
    if (g.flash > 0) g.flash = Math.max(0, g.flash - dt);
    if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 2.2);
    if (g.revealT > 0) g.revealT -= dt;
    if (g.principle.t > 0) g.principle.t -= dt;

    for (const s of g.splats) s.t += dt;
    for (const m of g.marks) m.t += dt;
    for (let i = g.popups.length - 1; i >= 0; i--) {
      const p = g.popups[i];
      p.t += dt;
      if (p.t > p.life) g.popups.splice(i, 1);
    }
    // 古いシミは薄れて消える（画面が汚れすぎないように）
    g.splats = g.splats.filter((s) => s.t < 12);

    if (g.phase === "ready") {
      updateHand(g.hand, dt);
      g.fx.update(dt);
      return;
    }
    if (g.phase === "dawn") {
      g.dawnT += dt;
      updateHand(g.hand, dt);
      g.fx.update(dt);
      if (g.dawnT > 2.2) g.phase = "over";
      return;
    }
    if (g.phase === "over") {
      updateHand(g.hand, dt);
      return;
    }

    // ヒットストップ中は世界が止まる（叩いた手応えの正体）
    if (g.hitStop > 0) {
      g.hitStop -= dt;
      g.events.push({ type: "freeze" });
      return;
    }

    g.night += dt;
    updateHand(g.hand, dt);
    if (g.hand.slapT >= 0 && !g.hand.impactDone && g.hand.slapT >= IMPACT_AT) resolveImpact();

    g.spawnIn -= dt;
    if (g.spawnIn <= 0 && g.bugs.length === 0 && g.kills < MAX_BUGS) spawnBug();

    for (const bug of [...g.bugs]) {
      const before = bug.state;
      const ev = updateMosquito(bug, dt, { player: g.hand, t: g.t });
      if (ev === "bite") {
        g.hp--;
        g.bites++;
        g.combo = 0;
        g.shake = 0.4;
        g.flash = FLASH * 0.6;
        addMark(bug.spot);
        addSplat(bug.spot.x, bug.spot.y, "skin");
        popup("BITE!", bug.spot.x, bug.spot.y - 12, C.zit, true);
        g.events.push({ type: "bite" });
        if (g.hp <= 0) endGame("eaten");
        else g.spawnIn = 1.6;
      } else if (ev === "takeoff" && g.phase === "play") {
        g.events.push({ type: "takeoff" });
      }
      // 羽音の距離が変わったとき（音の更新用）
      if (bug === g.bugs[0]) g.buzz = { x: bug.x, y: bug.y, state: bug.state, d: Math.hypot(bug.x - 52, bug.y - 108) };
      if (before === "hover" && bug.state === "land") {
        g.events.push({ type: "land" });
        notePrinciple("TIMING（着地の一瞬）", 0.6);
      }
      if (before !== "hover" && bug.state === "hover") notePrinciple("ANTICIPATION（予備動作）", 0.55);
    }

    g.fx.update(dt);
    if (g.night >= NIGHT) endGame("dawn");
  }

  // ---- 描画
  function draw(frame) {
    frame.color.set(g.bg.color);
    frame.light.fill(0);
    const p = painterFor(frame);
    const shakeX = g.shake > 0 ? Math.round((g.r() - 0.5) * 6 * g.shake) : 0;
    const shakeY = g.shake > 0 ? Math.round((g.r() - 0.5) * 6 * g.shake) : 0;
    p.place(shakeX, shakeY);

    drawAmbient(p, g.t);
    // 壁と布団のシミ
    for (const s of g.splats) drawSplat(p, s, g.t);
    // 刺された跡
    for (const m of g.marks) {
      const grow = Math.min(1, m.t * 4);
      p.px(m.x, m.y, C.zit);
      p.px(m.x + 1, m.y, C.zit);
      if (grow > 0.5) p.px(m.x, m.y + 1, C.splat);
    }
    drawSleeper(p, g.t, g.bites > 0 ? 1 : 0);
    for (const b of g.bugs) drawMosquito(p, b, g.t);
    g.fx.draw(frame, "back");
    g.fx.draw(frame, "front");
    drawHand(p, g.hand, g.t);
    p.place(0, 0);

    // 全体の白フラッシュ（当たった2フレーム）
    if (g.flash > 0) {
      const a = clamp01(g.flash / FLASH);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) p.put(x, y, C.white, a >= 0.99 ? 1 : a);
    }

    // ポップアップ
    for (const pop of g.popups) {
      const k = pop.t / pop.life;
      text(p, pop.str, pop.x, pop.y - k * 8, pop.color, {
        font: pop.big ? "big" : "mini",
        scale: pop.big ? 1 : 1,
        align: "center",
        alpha: 1 - k * k,
      });
    }

    drawHud(p, g);
    if (g.showPrinciples) drawPrinciple(p, g);

    // 明け方：画面全体をゆっくり暖色へ（ディザではなく色そのものを寄せる）
    if (g.phase === "dawn" || g.phase === "over") {
      const k = g.phase === "over" ? 1 : Math.min(1, g.dawnT / 2.2);
      const buf = frame.color;
      for (let y = 0; y < H; y++) {
        const kk = 0.20 * k * (1 - y / (H * 2.2));
        if (kk <= 0.002) continue;
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          // 窓の方向から光が来る感じに、右上を少し強く
          buf[i] = mix(buf[i], C.warm, kk * (0.7 + (x / W) * 0.6));
        }
      }
      if (g.phase === "over") drawResult(p, g);
    }
  }

  function drawHud(p, g) {
    // 残り時間（細いバー）
    const left = 1 - clamp01(g.night / NIGHT);
    for (let x = 0; x < W; x++) p.put(x, 0, C.void);
    for (let x = 0; x < Math.round(W * left); x++) p.put(x, 0, left < 0.25 ? C.zit : C.pillowHi);

    // 睡眠（ハート）
    for (let i = 0; i < HP_START; i++) {
      const x = 6 + i * 10, y = 6;
      const alive = i < g.hp;
      const c = alive ? C.zit : C.wallHi;
      p.px(x + 1, y, c); p.px(x + 2, y + 1, c); p.px(x + 3, y, c);
      p.px(x, y + 1, c); p.px(x + 4, y + 1, c);
      p.rect(x, y + 2, 5, 1, c);
      p.rect(x + 1, y + 3, 3, 1, c);
      p.px(x + 2, y + 4, c);
    }
    // 蚊の残り
    const left2 = MAX_BUGS - g.kills;
    text(p, "KILL " + g.kills + "/" + MAX_BUGS, W - 6, 5, C.textDim, { align: "right" });
    if (left2 > 0 && g.phase === "play") {
      const a = 0.4 + Math.sin(g.t * 3) * 0.2;
      for (let i = 0; i < left2; i++) p.dot(W - 10 - i * 5, 14, C.bugHi, a);
    }
    // コンボ
    if (g.combo > 1) text(p, "x" + g.combo, 6, 16, C.warm, { font: "mini" });
    // 肌に着地した蚊：刺される前から赤く腫れて、脈打つ
    for (const b of g.bugs) {
      if (b.state === "land" && b.spot?.kind === "skin") {
        const total = 1.45;
        const grow = clamp01(1 - b.landTimer / total);
        const a = 0.45 + Math.sin(g.t * 10) * 0.35;
        p.px(b.x + 1, b.y + 2, C.zit);
        p.px(b.x + 2, b.y + 2, C.zit);
        if (grow > 0.35) { p.px(b.x + 1, b.y + 3, C.splat); p.px(b.x + 2, b.y + 3, C.splat); }
        if (grow > 0.6) p.ring(b.x + 1.5, b.y + 2, 3.5, 1, C.zit, a);
      }
      const eta = biteEta(b);
      if (eta < 0.7) {
        const a = 0.5 + Math.sin(g.t * 30) * 0.5;
        p.ring(b.x, b.y, 6 + (1 - eta / 0.7) * 6, 1, C.zit, a);
        text(p, "!", b.x, b.y - 12, C.zit, { align: "center", scale: 2 });
      }
    }
  }

  function drawPrinciple(p, g) {
    const pr = g.principle;
    const label = pr.t > 0 ? pr.name : "12 PRINCIPLES  [P]";
    const w = labelWidth(label) + 10;
    const x = Math.round((W - w) / 2), y = H - 12;
    p.rect(x, y, w, 9, C.void);
    p.rect(x, y, w, 1, pr.t > 0 ? C.warm : C.frame);
    text(p, label, W / 2, y + 2, pr.t > 0 ? C.warm : C.textDim, { align: "center" });
  }

  function drawResult(p, g) {
    const x0 = 46, y0 = 38, w = W - 92, h = 104;
    p.rect(x0, y0, w, h, C.void);
    p.rect(x0 + 1, y0 + 1, w - 2, h - 2, C.wallTop);
    // 枠
    p.rect(x0, y0, w, 1, C.pillowHi); p.rect(x0, y0 + h - 1, w, 1, C.pillowHi);
    p.rect(x0, y0, 1, h, C.pillowHi); p.rect(x0 + w - 1, y0, 1, h, C.pillowHi);
    p.rect(x0 + 2, y0 + 2, w - 4, 1, C.frameHi);

    text(p, g.banner ?? "", W / 2, y0 + 12, C.warm, { font: "big", align: "center" });
    p.rect(x0 + 18, y0 + 24, w - 36, 1, C.frame);
    text(p, "SCORE " + (g.finalScore ?? 0), W / 2, y0 + 34, C.text, { align: "center" });
    text(p, "CATCH " + g.kills + "   MISS " + g.misses, W / 2, y0 + 50, C.textDim, { align: "center" });
    text(p, "BITE " + g.bites + "   BEST x" + Math.max(1, g.bestCombo), W / 2, y0 + 60, C.textDim, { align: "center" });
    const a = 0.5 + Math.sin(g.t * 4) * 0.5;
    text(p, "TAP TO RETRY", W / 2, y0 + 82, C.text, { align: "center", alpha: 0.45 + a * 0.55 });
  }

  return {
    state: g,
    update,
    draw,
    pointer,
    slap,
    start,
    restart,
    debug() {
      const m = g.bugs[0];
      return {
        phase: g.phase,
        state: m?.state ?? "none",
        landed: m?.state === "land",
        landTimer: m?.landTimer ?? 0,
        mosquito: m ? { x: m.x, y: m.y } : { x: 0, y: 0 },
        hand: { x: g.hand.x, y: g.hand.y },
        kills: g.kills,
        hp: g.hp,
        score: g.score,
      };
    },
    snapshot() {
      const f = createFrame(W, H);
      draw(f);
      return f;
    },
  };
}

function drawSplat(p, s, t) {
  const fade = s.t > 9 ? Math.max(0, 1 - (s.t - 9) / 3) : 1;
  if (fade <= 0) return;
  // 芯（べたっとした塊）
  p.ellipse(s.x, s.y, 2.6, 2.0, C.splat, fade);
  p.ellipse(s.x - 0.6, s.y - 0.6, 1.4, 1.0, C.splatHi, fade);
  // 飛び散り
  for (const l of s.lumps) {
    for (let dy = 0; dy < l.s; dy++)
      for (let dx = 0; dx < l.s; dx++) p.dot(s.x + l.x + dx, s.y + l.y + dy, C.splat, fade);
  }
  // したたり（壁/肌のとき）
  if (s.kind !== "blanket") {
    const len = Math.min(6, 2 + s.t * 1.2);
    for (let i = 1; i < len; i++) p.px(s.x + 2, s.y + i * 2, C.splat);
  }
}
