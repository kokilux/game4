// KA — 夜の蚊取り。3晩（和室・洋室・夏の夜）を勝ち抜く。
// 蚊は着地寸前で止まる（予備動作）。ただし空中でも叩ける——当たりは小さい。

import { createFrame, painterFor, mix } from "../../vendor/pixelfx/src/core/index.js";
import { C, W, H } from "./palette.js";
import { STAGES, STAGE_NAMES, stageWorld, drawSleeper } from "./scene.js";
import { createMosquito, updateMosquito, drawMosquito, hittable, hitRadius, biteEta, airborne } from "./mosquito.js";
import { createHand, aim, startSlap, updateHand, drawHand, impactPoint, canSlap, IMPACT_AT } from "./hand.js";
import { createFxLayer } from "./fx.js";
import { text, labelWidth, rng, clamp01, lerp } from "./draw.js";

const FLASH = 0.05;
const HP_MAX = 3;

export function createGame({ seed = 3 } = {}) {
  const g = {
    seed,
    t: 0,
    stageIndex: 0,
    stageRound: 0,
    world: null,
    phase: "ready", // ready | play | interlude | over
    hp: HP_MAX,
    kills: 0,           // このステージの捕獲
    totalKills: 0,
    misses: 0,
    bites: 0,
    combo: 0,
    bestCombo: 0,
    score: 0,
    stageScore: 0,
    spawnIn: 0.8,
    bugs: [],
    bugId: 0,
    splats: [],
    sparks: [],
    marks: [],
    hitStop: 0,
    flash: 0,
    hitAt: null,
    shake: 0,
    popups: [],
    events: [],
    fx: createFxLayer(),
    hand: createHand(230, 150),
    r: rng(seed),
    banner: null,
    bannerT: 0,
    interludeT: 0,
    endReason: null,
    finalScore: 0,
    showPrinciples: true,
    principle: { name: "", t: 0 },
    hintT: 7,
    hintDone: false,
    buzz: null,
    night: 0,
  };

  function loadStage(i) {
    g.stageIndex = Math.min(i, STAGES.length - 1);
    g.world = stageWorld(g.stageIndex);
    g.bugs = [];
    g.splats = [];
    g.marks = [];
    g.popups = [];
    g.kills = 0;
    g.spawnIn = 0.8;
    g.night = 0;
    g.combo = 0;
    g.hitStop = 0;
    g.flash = 0;
    g.shake = 0;
    g.hintDone = false;
    g.hintT = 7;
    g.fx.clear();
    g.hand = createHand(230, 150);
  }
  loadStage(0);

  // ---------------------------------------------------------------- 進行
  function start() {
    if (g.phase !== "ready") return;
    g.phase = "play";
    g.night = 0;
    g.t = 0;
    g.spawnIn = 0.7;
    g.events.push({ type: "start" });
  }

  function restart() {
    g.phase = "ready";
    g.t = 0;
    g.hp = HP_MAX;
    g.totalKills = 0;
    g.score = 0;
    g.stageScore = 0;
    g.misses = 0;
    g.bites = 0;
    g.bestCombo = 0;
    g.endReason = null;
    g.banner = null;
    g.stageRound++;
    loadStage(0);
  }

  function endStage(reason) {
    if (g.phase !== "play") return;
    g.endReason = reason;
    const w = g.world;
    if (reason === "eaten") {
      g.phase = "over";
      g.flash = 0;
      g.banner = "NO SLEEP";
      g.finalScore = g.score;
      g.events.push({ type: "end", reason });
      return;
    }
    // クリア or 夜明け
    const clear = reason === "clear";
    const timeBonus = Math.max(0, Math.round((w.night - g.night) * 10));
    const bonus = clear ? 500 + timeBonus : 100;
    g.score += bonus;
    g.stageScore += bonus;
    g.banner = clear ? "NIGHT CLEAR" : "DAWN";
    g.bannerT = clear ? `+${bonus}` : `+${bonus}`;
    g.events.push({ type: "end", reason: clear ? "clear" : "dawn" });

    if (g.stageIndex >= STAGES.length - 1) {
      g.phase = "over";
      g.banner = clear ? "ALL CLEAR" : "DAWN";
      g.finalScore = g.score;
      return;
    }
    if (clear) g.hp = Math.min(HP_MAX, g.hp + 1); // クリアで体力が1回復
    g.phase = "interlude";
    g.interludeT = 0;
  }

  function nextStage() {
    loadStage(g.stageIndex + 1);
    g.phase = "play";
    g.events.push({ type: "stage", index: g.stageIndex });
  }

  // ---------------------------------------------------------------- 入力
  function pointer(x, y) {
    aim(g.hand, Math.max(8, Math.min(W - 8, x)), Math.max(10, Math.min(H - 6, y)));
  }

  function slap() {
    if (g.phase !== "play" || g.hitStop > 0 || !canSlap(g.hand)) return false;
    startSlap(g.hand);
    g.events.push({ type: "swing" });
    return true;
  }

  // ---------------------------------------------------------------- 判定
  function resolveImpact() {
    const h = g.hand;
    h.impactDone = true;
    const ip = impactPoint(h);
    let target = null, best = Infinity;
    for (const b of g.bugs) {
      if (!hittable(b)) continue;
      const r = hitRadius(b);
      const d = Math.hypot(b.x - ip.x, b.y - ip.y);
      if (d < r && d < best) { best = d; target = b; }
    }
    if (target) killBug(target, ip);
    else missSlap(ip);
  }

  function killBug(bug, ip) {
    const air = airborne(bug);
    const landed = bug.state === "land";
    const fast = bug.state === "hover"; // 予備動作を読んで叩けた
    const onSkin = bug.spot?.kind === "skin";

    g.kills++;
    g.totalKills++;
    g.combo++;
    g.bestCombo = Math.max(g.bestCombo, g.combo);
    const base = air ? 130 : 100;
    const gain = base + (fast ? 50 : 0) + Math.min(5, g.combo - 1) * 10;
    g.score += gain;
    g.stageScore += gain;

    g.hitStop = air ? 0.075 : 0.09;
    g.flash = FLASH;
    g.hitAt = { x: bug.x, y: bug.y };
    g.shake = air ? 0.26 : 0.22;
    addSpark(bug.x, bug.y, air ? 1.25 : fast ? 1.1 : 1);
    addSplat(bug.x, bug.y, air ? "air" : onSkin ? "skin" : "wall");
    popup(air ? "SWAT!" : fast ? "PACHI!!" : "PACHI!", bug.x, bug.y - 14, air ? C.wingHi : C.warm, true);
    popup("+" + gain, bug.x, bug.y - 24, C.textDim);
    notePrinciple(air ? "ARCS / TIMING（空中）" : "SQUASH & STRETCH", 0.5);
    g.hintDone = true;

    g.bugs = g.bugs.filter((b) => b !== bug);
    g.events.push({ type: "kill", fast, air, onSkin });
    if (g.kills >= g.world.bugs) endStage("clear");
    else g.spawnIn = air ? 0.9 : 1.1;
  }

  function missSlap(ip) {
    g.misses++;
    g.combo = 0;
    // 空振りすると、近くにいる蚊は驚いて飛び立つ（連打が効かない理由）
    for (const b of g.bugs) {
      if (b.state === "land" || b.state === "hover") {
        if (Math.hypot(b.x - ip.x, b.y - ip.y) < 26) {
          flee(b);
          popup("ESCAPE", b.x, b.y - 10, C.textDim);
        }
      }
    }
    g.shake = 0.08;
    g.events.push({ type: "whiff" });
    g.fx.thud(ip.x, ip.y);
    popup("MISS", ip.x, ip.y - 12, C.textDim);
    g.hintT = Math.max(g.hintT, 1.2);
    notePrinciple("ARCS / FOLLOW THROUGH", 0.45);
  }

  /** 当たった瞬間の飛沫（白と生成りだけ。原色の星は使わない）。 */
  function addSpark(x, y, scale = 1) {
    g.sparks.push({ x, y, t: 0, life: 0.24, scale });
  }

  function drawSparks(p, dt) {
    for (let i = g.sparks.length - 1; i >= 0; i--) {
      const s = g.sparks[i];
      s.t += dt;
      const k = clamp01(s.t / s.life);
      if (k >= 1) { g.sparks.splice(i, 1); continue; }
      const r = (2 + k * 9) * s.scale;
      const a = 1 - k;
      // 中心の白
      p.disc(s.x, s.y, Math.max(0.6, 2.6 * s.scale * (1 - k * 0.7)), C.white, a);
      // 8方向の飛沫
      for (let j = 0; j < 8; j++) {
        const ang = (j / 8) * Math.PI * 2 + 0.4;
        const d = r * (j % 2 ? 1 : 0.72);
        const px = Math.round(s.x + Math.cos(ang) * d);
        const py = Math.round(s.y + Math.sin(ang) * d * 0.8);
        p.dot(px, py, j % 3 === 0 ? C.warm : C.white, a);
        if (k < 0.5) p.dot(Math.round(s.x + Math.cos(ang) * d * 0.6), Math.round(s.y + Math.sin(ang) * d * 0.48), C.pillowHi, a * 0.9);
      }
      // 外へ広がる輪
      p.ring(s.x, s.y, r * 1.15, 1, C.wingHi, a * 0.5);
    }
  }

  function popup(str, x, y, color = C.text, big = false) {
    g.popups.push({ str, x, y, t: 0, life: 0.9, color, big });
  }

  function addSplat(x, y, kind) {
    const r = g.r;
    const lumps = [];
    const n = kind === "skin" ? 5 : kind === "air" ? 4 : 7;
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = 2 + r() * (kind === "wall" ? 9 : 6);
      lumps.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.8, s: 1 + Math.floor(r() * 2) });
    }
    // 空中で仕留めたものは、布団まで落ちてからシミになる
    const fallTo = kind === "air" ? g.world.surfaceY(x) - 2 : y;
    g.splats.push({ x, y, lumps, t: 0, kind, from: y, fallTo, landed: kind !== "air" });
  }

  function addMark(spot) {
    g.marks.push({ x: spot.x, y: spot.y, t: 0 });
  }

  function notePrinciple(name, dur = 0.45) {
    g.principle = { name, t: dur };
  }

  function spawnBug() {
    const w = g.world;
    const n = g.kills + g.bites;
    const bug = createMosquito({
      seed: (g.seed * 7919 + 11 + g.bugId * 131 + g.stageIndex * 977) % 100000,
      speed: w.speed * (1 + n * 0.07),
      spotBias: Math.min(0.62, w.spotBias + n * 0.03),
    });
    g.bugId++;
    g.bugs.push(bug);
    g.events.push({ type: "buzz-in" });
  }

  // ---------------------------------------------------------------- 更新
  function update(dt) {
    dt = Math.min(dt, 1 / 30);
    g.t += dt;
    if (g.flash > 0) g.flash = Math.max(0, g.flash - dt);
    if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 2.2);
    if (g.principle.t > 0) g.principle.t -= dt;
    if (g.phase === "play" && g.hintT > 0 && !g.hintDone) g.hintT -= dt;

    for (const s of g.splats) s.t += dt;
    for (const m of g.marks) m.t += dt;
    for (let i = g.popups.length - 1; i >= 0; i--) {
      g.popups[i].t += dt;
      if (g.popups[i].t > g.popups[i].life) g.popups.splice(i, 1);
    }
    g.splats = g.splats.filter((s) => s.t < 14);

    if (g.phase === "ready") { updateHand(g.hand, dt); g.fx.update(dt); return; }

    if (g.phase === "interlude") {
      g.interludeT += dt;
      updateHand(g.hand, dt);
      g.fx.update(dt);
      if (g.interludeT > 2.0) nextStage();
      return;
    }
    if (g.phase === "over") { updateHand(g.hand, dt); return; }

    if (g.hitStop > 0) { g.hitStop -= dt; return; }

    g.night += dt;
    updateHand(g.hand, dt);
    if (g.hand.slapT >= 0 && !g.hand.impactDone && g.hand.slapT >= IMPACT_AT) resolveImpact();

    g.spawnIn -= dt;
    // 2晩目からは2匹同時。数で押してくる。
    const maxLive = g.stageIndex >= 1 ? 2 : 1;
    if (g.spawnIn <= 0 && g.bugs.length < maxLive && g.kills + g.bugs.length < g.world.bugs) spawnBug();

    for (const bug of [...g.bugs]) {
      const before = bug.state;
      const ev = updateMosquito(bug, dt, { player: g.hand, t: g.t, world: g.world });
      if (ev === "bite") {
        g.hp--;
        g.bites++;
        g.combo = 0;
        g.shake = 0.4;
        g.flash = FLASH * 0.6;
        g.hitAt = { x: bug.spot.x, y: bug.spot.y };
        addMark(bug.spot);
        addSplat(bug.spot.x, bug.spot.y, "skin");
        popup("BITE!", bug.spot.x, bug.spot.y - 12, C.zit, true);
        g.events.push({ type: "bite" });
        if (g.hp <= 0) endStage("eaten");
        else g.spawnIn = 1.6;
      } else if (ev === "takeoff" && g.phase === "play") {
        g.events.push({ type: "takeoff" });
      }
      if (before !== "hover" && bug.state === "hover") {
        notePrinciple("ANTICIPATION（予備動作）", 0.55);
        g.events.push({ type: "hover" });
      }
      if (before === "hover" && bug.state === "land") {
        notePrinciple("TIMING（着地の一瞬）", 0.6);
        g.events.push({ type: "land" });
      }
      g.buzz = { x: bug.x, y: bug.y, state: bug.state, d: Math.hypot(bug.x - 56, bug.y - 102) };
    }

    g.fx.update(dt);
    if (g.phase === "play" && g.kills >= g.world.bugs) endStage("clear");
    else if (g.phase === "play" && g.night >= g.world.night) endStage("dawn");
  }

  // ---------------------------------------------------------------- 描画
  function draw(frame) {
    const w = g.world;
    frame.color.set(w.frame.color);
    frame.light.fill(0);
    const p = painterFor(frame);
    const shakeX = g.shake > 0 ? Math.round((g.r() - 0.5) * 7 * g.shake) : 0;
    const shakeY = g.shake > 0 ? Math.round((g.r() - 0.5) * 7 * g.shake) : 0;
    p.place(shakeX, shakeY);

    w.drawAmbient(p, g.t);
    for (const s of g.splats) drawSplat(p, s, g.t, w);
    for (const m of g.marks) {
      p.px(m.x, m.y, C.zit);
      p.px(m.x + 1, m.y, C.zit);
      if (m.t > 0.25) { p.px(m.x, m.y + 1, C.splat); p.px(m.x + 1, m.y + 1, C.splat); }
    }
    drawSleeper(p, g.t, g.bites > 0 ? 1 : 0, w.pal);
    for (const b of g.bugs) drawMosquito(p, b, g.t, w);
    g.fx.draw(frame, "back");
    g.fx.draw(frame, "front");
    // pixelfx のエフェクトは描画原点を place() したまま返すことがある。
    // ここで戻さないと、続く布団や手が画面外に描かれて「布団が消える」。
    p.reset();
    w.drawOver(p, g.t);
    drawHand(p, g.hand, g.t);
    p.place(0, 0);

    // 画面全体を白く飛ばさない。当たった「その一点」だけが光る。
    if (g.flash > 0 && g.phase !== "over") {
      const k = clamp01(g.flash / FLASH);
      const hx = g.hitAt?.x ?? g.hand.x;
      const hy = g.hitAt?.y ?? g.hand.y;
      for (let i = 1; i <= 3; i++) p.ring(hx, hy, 3 + i * 2 + (1 - k) * 7, 1, C.white, k * (0.9 - i * 0.22));
      p.disc(hx, hy, 2.2, C.white, k * 0.5);
    }

    drawSparks(p, g.hitStop > 0 ? 0 : 1 / 60); // ヒットストップ中も飛沫は進める
    for (const pop of g.popups) {
      const k = pop.t / pop.life;
      text(p, pop.str, pop.x, pop.y - k * 8, pop.color, {
        font: pop.big ? "big" : "mini",
        align: "center",
        alpha: 1 - k * k,
      });
    }

    drawHud(p, g);
    if (g.showPrinciples) drawPrinciple(p, g);

    if (g.phase === "play" && !g.hintDone && g.hintT > 0) {
      const a = Math.min(1, g.hintT / 1.5);
      const hovering = g.bugs.some((b) => b.state === "hover" || b.state === "land");
      const msg = hovering ? "SLAP NOW!" : "WAIT... IT LANDS SOON";
      text(p, msg, W / 2, H - 26, hovering ? C.warm : C.textDim, { align: "center", alpha: a });
    }

    if (g.phase === "interlude") drawBanner(p, g, 0.12, frame);
    if (g.phase === "over") {
      blendRect(frame, 0, 0, W, H, C.void, 0.62);
      drawResult(p, g);
    }
  }

  /** 既に描かれた画素を色 c へ k だけ寄せる（半透明ディザを避ける）。 */
  function blendRect(frame, x0, y0, x1, y1, c, k) {
    if (k <= 0.002) return;
    const buf = frame.color;
    const kk = Math.min(1, k);
    for (let y = Math.max(0, y0 | 0); y < Math.min(H, y1 | 0); y++)
      for (let x = Math.max(0, x0 | 0); x < Math.min(W, x1 | 0); x++) {
        const i = y * W + x;
        buf[i] = mix(buf[i], c, kk);
      }
  }

  function drawHud(p, g) {
    const w = g.world;
    const left = 1 - clamp01(g.night / w.night);
    p.rect(0, 0, W, 1, C.void);
    p.rect(0, 0, Math.round(W * left), 1, left < 0.25 ? C.zit : C.pillowHi);

    for (let i = 0; i < HP_MAX; i++) {
      const x = 6 + i * 10, y = 6, alive = i < g.hp, c = alive ? C.zit : C.wallHi;
      p.px(x + 1, y, c); p.px(x + 2, y + 1, c); p.px(x + 3, y, c);
      p.px(x, y + 1, c); p.px(x + 4, y + 1, c);
      p.rect(x, y + 2, 5, 1, c);
      p.rect(x + 1, y + 3, 3, 1, c);
      p.px(x + 2, y + 4, c);
    }

    text(p, w.label + "  " + w.name, W - 6, 5, C.textDim, { align: "right" });
    text(p, "SWAT " + g.kills + "/" + w.bugs, W - 6, 13, C.text, { align: "right" });
    if (g.combo > 1) text(p, "x" + g.combo, 6, 16, C.warm);

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

  function drawBanner(p, g, k, frame) {
    const a = Math.min(1, g.interludeT / 0.2) * Math.min(1, (2.0 - g.interludeT) / 0.3);
    blendRect(frame, 40, 62, W - 40, 116, C.void, 0.72 * a);
    text(p, g.banner ?? "", W / 2, 76, C.warm, { font: "big", align: "center", alpha: a });
    text(p, g.bannerT ?? "", W / 2, 92, C.text, { align: "center", alpha: a });
    if (g.stageIndex < STAGES.length - 1) {
      text(p, "NEXT - " + STAGE_NAMES[g.stageIndex + 1], W / 2, 104, C.textDim, { align: "center", alpha: a * 0.9 });
    }
  }

  function drawResult(p, g) {
    const x0 = 46, y0 = 34, w = W - 92, h = 112;
    p.rect(x0, y0, w, h, C.void);
    p.rect(x0 + 1, y0 + 1, w - 2, h - 2, C.wallTop);
    p.rect(x0, y0, w, 1, C.pillowHi); p.rect(x0, y0 + h - 1, w, 1, C.pillowHi);
    p.rect(x0, y0, 1, h, C.pillowHi); p.rect(x0 + w - 1, y0, 1, h, C.pillowHi);

    text(p, g.banner ?? "", W / 2, y0 + 12, C.warm, { font: "big", align: "center" });
    p.rect(x0 + 18, y0 + 24, w - 36, 1, C.frame);
    text(p, "SCORE " + (g.finalScore || g.score), W / 2, y0 + 34, C.text, { align: "center" });
    text(p, "SWAT " + g.totalKills + "   MISS " + g.misses, W / 2, y0 + 50, C.textDim, { align: "center" });
    text(p, "BITE " + g.bites + "   BEST x" + Math.max(1, g.bestCombo), W / 2, y0 + 60, C.textDim, { align: "center" });
    text(p, g.endReason === "eaten" ? "REACHED " + (g.stageIndex + 1) + "/" + STAGES.length : "ALL " + STAGES.length + " NIGHTS", W / 2, y0 + 72, C.textDim, { align: "center" });
    const a = 0.5 + Math.sin(g.t * 4) * 0.5;
    text(p, "TAP TO RETRY", W / 2, y0 + 90, C.text, { align: "center", alpha: 0.45 + a * 0.55 });
  }

  return {
    state: g,
    update,
    draw,
    pointer,
    slap,
    start,
    restart,
    /** テスト/QA 用：いまの蚊とステージの状態 */
    debug() {
      const m = g.bugs[0];
      return {
        phase: g.phase,
        stage: g.stageIndex,
        stageName: g.world.name,
        nightLen: g.world.night,
        night: g.night,
        totalKills: g.totalKills,
        state: m?.state ?? "none",
        landed: m?.state === "land",
        air: m ? airborne(m) : false,
        landTimer: m?.landTimer ?? 0,
        mosquito: m ? { x: m.x, y: m.y } : { x: 0, y: 0 },
        hand: { x: g.hand.x, y: g.hand.y },
        kills: g.kills,
        target: g.world.bugs,
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

function drawSplat(p, s, t, world) {
  const fade = s.t > 10 ? Math.max(0, 1 - (s.t - 10) / 3) : 1;
  if (fade <= 0) return;
  // 空中で仕留めたものは落ちてくる
  let y = s.y;
  if (s.kind === "air") {
    const k = Math.min(1, s.t / 0.28);
    y = lerp(s.from, s.fallTo, k * k);
  }
  p.ellipse(s.x, y, 2.6, 2.0, C.splat, fade);
  p.ellipse(s.x - 0.6, y - 0.6, 1.4, 1.0, C.splatHi, fade);
  for (const l of s.lumps) {
    for (let dy = 0; dy < l.s; dy++)
      for (let dx = 0; dx < l.s; dx++) p.dot(s.x + l.x + dx, y + l.y + dy, C.splat, fade);
  }
  if (s.kind !== "blanket" && s.kind !== "air") {
    const len = Math.min(6, 2 + s.t * 1.2);
    for (let i = 1; i < len; i++) p.px(s.x + 2, y + i * 2, C.splat);
  }
}
