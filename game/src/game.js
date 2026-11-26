// KA — 夜の蚊取り。3晩（和室・洋室・夏の夜）を勝ち抜く。
// 蚊は着地寸前で止まる（予備動作）。ただし空中でも叩ける——当たりは小さい。

import { createFrame, painterFor, mix } from "../../vendor/pixelfx/src/core/index.js";
import { C, W, H } from "./palette.js";
import { STAGES, STAGE_NAMES, stageWorld, drawSleeperBase, drawSleeperHead, BED } from "./scene.js";
import { createMosquito, updateMosquito, drawMosquito, hittable, hitRadius, biteEta, airborne } from "./mosquito.js";
import { createHand, aim, startSlap, updateHand, drawHand, impactPoint, canSlap, IMPACT_AT, SLAP_COOLDOWN } from "./hand.js";
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
    phase: "title", // title | help | play | interlude | clear | over
    titleT: 0,
    menuIndex: 0,
    helpT: 0,
    clearT: 0,
    clearInfo: null,
    paused: false,
    pauseIndex: 0,
    soundOn: true,
    log: [],            // ステージごとの成績（リザルトで並べる）
    resultIndex: 0,
    stageBites: 0,
    stageCombo: 0,
    stageBonus: 0,
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
    cut: null, // 終わりの演出 {kind:'clear'|'dawn'|'fail', t}
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
    g.stageBites = 0;
    g.stageCombo = 0;
    g.stageBonus = 0;
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
    if (g.phase !== "ready" && g.phase !== "title" && g.phase !== "over") return;
    g.phase = "play";
    g.night = 0;
    g.t = 0;
    g.spawnIn = 0.7;
    g.events.push({ type: "start" });
  }

  function restart() {
    g.phase = "title";
    g.paused = false;
    g.log = [];
    g.cut = null;
    g.clearInfo = null;
    g.menuIndex = 0;
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
    g.popups.length = 0; // 直前の「PACHI!」などを残さない
    g.sparks.length = 0;
    const w = g.world;
    if (reason === "eaten") {
      g.phase = "over";
      g.flash = 0;
      g.cut = { kind: "fail", t: 0 };
      g.banner = "NO SLEEP";
      g.finalScore = g.score;
      g.events.push({ type: "end", reason });
      return;
    }
    // クリア or 夜明け
    const clear = reason === "clear";
    if (clear) g.splats.length = 0; // 夜を越えたら血の跡は拭う
    const timeBonus = Math.max(0, Math.round((w.night - g.night) * 10));
    const bonus = clear ? 500 + timeBonus : 100;
    g.stageBonus = bonus;
    g.score += bonus;
    g.stageScore += bonus;
    g.banner = clear ? "NIGHT CLEAR" : "DAWN";
    g.bannerT = clear ? `+${bonus}` : `+${bonus}`;
    g.events.push({ type: "end", reason: clear ? "clear" : "dawn" });
    g.cut = { kind: clear ? "clear" : "dawn", t: 0, allClear: false };

    if (g.stageIndex >= STAGES.length - 1) {
      scoreStage(); // 最後の夜もリザルトの表に載せる
      g.phase = "over";
      g.cut = { kind: clear ? "clear" : "dawn", t: 0, allClear: clear };
      g.banner = clear ? "ALL CLEAR" : "DAWN";
      g.finalScore = g.score;
      return;
    }
    if (clear) g.hp = Math.min(HP_MAX, g.hp + 1); // クリアで体力が1回復
    g.phase = "interlude";
    g.interludeT = 0;
  }

  /** 演出が終わったら、次の夜の前に独立した「クリア画面」を挟む。 */
  function scoreStage() {
    g.log.push({
      name: g.world.name,
      jp: g.world.jp,
      kills: g.kills,
      bugs: g.world.bugs,
      bites: g.bitesInStage ?? 0,
      score: g.stageScore,
      combo: g.stageCombo ?? g.bestCombo,
      clear: g.endReason === "clear",
    });
  }

  function finishStage() {
    scoreStage();
    g.clearInfo = {
      clear: g.endReason === "clear",
      name: g.world.name,
      jp: g.world.jp,
      index: g.stageIndex,
      next: g.stageIndex < STAGES.length - 1 ? STAGE_NAMES[g.stageIndex + 1] : null,
      kills: g.kills,
      bugs: g.world.bugs,
      bites: g.stageBites ?? 0,
      combo: g.stageCombo ?? g.bestCombo,
      bonus: g.stageBonus ?? 0,
      score: g.stageScore,
      total: g.score,
    };
    g.phase = "clear";
    g.clearT = 0;
    g.events.push({ type: "clearScreen" });
  }

  function nextStage() {
    g.cut = null;
    loadStage(g.stageIndex + 1);
    g.phase = "play";
    g.events.push({ type: "stage", index: g.stageIndex });
  }

  // ---------------------------------------------------------------- 入力
  /** 終わりの演出中は、手を画面の外へ退がらせる（笑顔を隠さない）。 */
  function restHand() {
    g.hand.tx = 262;
    g.hand.ty = 206;
  }

  // ---------------------------------------------------------------- メニュー
  const TITLE_MENU = 3; // START / HOW TO PLAY / SOUND
  const RESULT_MENU = 2; // RETRY / TITLE
  const PAUSE_MENU = 3; // RESUME / RESTART / TITLE

  function menuCount() {
    if (g.phase === "title") return TITLE_MENU;
    if (g.phase === "over") return RESULT_MENU;
    if (g.paused) return PAUSE_MENU;
    return 0;
  }

  function menuMove(d) {
    const n = menuCount();
    if (!n) return;
    const key = g.phase === "over" ? "resultIndex" : g.paused ? "pauseIndex" : "menuIndex";
    g.resultIndex = g.resultIndex ?? 0;
    g[key] = ((g[key] ?? 0) + d + n) % n;
    g.events.push({ type: "menu", dir: d });
  }

  /** 決定。どの画面でも「スペース／クリック」で呼べる。返り値は消費したか。 */
  function confirm() {
    if (g.paused) {
      if (g.pauseIndex === 0) g.paused = false;
      else if (g.pauseIndex === 1) { restart(); start(); }
      else restart();
      return true;
    }
    if (g.phase === "title") {
      if (g.menuIndex === 0) { start(); return true; }
      if (g.menuIndex === 1) { g.phase = "help"; g.helpT = 0; return true; }
      g.soundOn = !g.soundOn;
      g.events.push({ type: "sound", on: g.soundOn });
      return true;
    }
    if (g.phase === "help") { g.phase = "title"; return true; }
    if (g.phase === "clear") {
      if (g.clearT > 0.5) nextStage();
      return true;
    }
    if (g.phase === "over") {
      if (g.resultIndex === 0) { restart(); start(); }
      else restart();
      return true;
    }
    return false;
  }

  function togglePause() {
    if (g.phase !== "play") return false;
    g.paused = !g.paused;
    g.pauseIndex = 0;
    g.events.push({ type: "pause", paused: g.paused });
    return true;
  }

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
    g.stageCombo = Math.max(g.stageCombo, g.combo);
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

    if (g.paused) return;

    if (g.phase === "title" || g.phase === "help") {
      g.titleT += dt;
      if (g.phase === "help") g.helpT += dt;
      updateHand(g.hand, dt);
      g.fx.update(dt);
      return;
    }
    if (g.phase === "ready") { updateHand(g.hand, dt); g.fx.update(dt); return; }

    if (g.phase === "clear") {
      g.clearT += dt;
      // 何も押さなくても 9 秒で次の夜へ（待たせすぎない）
      if (g.clearT > 9) nextStage();
      return;
    }

    if (g.phase === "interlude") {
      g.interludeT += dt;
      if (g.cut) g.cut.t += dt;
      restHand();
      updateHand(g.hand, dt);
      g.fx.update(dt);
      if (g.interludeT > 2.0) finishStage();
      return;
    }
    if (g.phase === "over") {
      if (g.cut) g.cut.t += dt;
      restHand();
      updateHand(g.hand, dt);
      return;
    }

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
        g.stageBites++;
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
    pRef = null;
    if (g.phase === "title") { const p0 = painterFor(frame); drawTitle(p0, frame); return; }
    if (g.phase === "help") {
      const p0 = painterFor(frame);
      drawHelp(p0, frame);
      return;
    }
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
    drawSleeperBase(p, g.t, w.pal);
    for (const b of g.bugs) drawMosquito(p, b, g.t, w);
    g.fx.draw(frame, "back");
    g.fx.draw(frame, "front");
    // pixelfx のエフェクトは描画原点を place() したまま返すことがある。
    // ここで戻さないと、続く布団や手が画面外に描かれて「布団が消える」。
    p.reset();
    w.drawOver(p, g.t);
    // 顔は布団の手前（布団の縁が頭の後ろに回る）
    drawSleeperHead(p, g.t, g.bites > 0 && g.phase === "play" ? 1 : 0, w.pal, cutExpr(), cutShake());
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

    if (g.phase === "play" || g.phase === "interlude") {
      drawHud(p, g);
      if (g.showPrinciples) drawPrinciple(p, g);
    }

    if (g.phase === "play" && !g.hintDone && g.hintT > 0) {
      const a = Math.min(1, g.hintT / 1.5);
      const hovering = g.bugs.some((b) => b.state === "hover" || b.state === "land");
      const msg = hovering ? "SLAP NOW!" : "WAIT... IT LANDS SOON";
      text(p, msg, W / 2, H - 26, hovering ? C.warm : C.textDim, { align: "center", alpha: a });
    }

    if (g.phase === "interlude") {
      if (g.cut && g.cut.kind === "clear") drawClearFx(p, frame, g.cut.t);
      drawBanner(p, g, 0.12, frame);
      // 光の粒は帯の手前（顔のまわりを舞う）
      if (g.cut && g.cut.kind === "clear") drawSparkles(p, g.cut.t);
    }
    if (g.phase === "over") {
      const ct = g.cut ? g.cut.t : 99;
      if (ct < CUT_HOLD) drawCutscene(p, frame);
      else {
        blendRect(frame, 0, 0, W, H, C.void, 0.62);
        pRef = p;
        drawResult(p, g);
      }
    }
    if (g.phase === "clear") {
      pRef = p;
      drawClearScreen(p, frame);
    }
    if (g.paused) {
      pRef = p;
      drawPause(p, frame);
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


  // ---------------------------------------------------------------- 画面（タイトル/ヘルプ/クリア/ポーズ）
  /** 右向きの三角（メニューのカーソル）。 */
  function caret(p, x, y, c) {
    for (let i = 0; i < 3; i++) p.rect(x + i, y + i, 1, 5 - i * 2, c);
  }

  function panel(frame, x, y, w, h, k = 0.72) {
    blendRect(frame, x - 2, y - 2, x + w + 2, y + h + 2, C.void, k);
    p_rectBorder(x, y, w, h);
  }
  let pRef = null;
  function p_rectBorder(x, y, w, h) {
    const p = pRef;
    p.rect(x, y, w, 1, C.frameHi);
    p.rect(x, y + h - 1, w, 1, C.frame);
    p.rect(x, y, 1, h, C.frameHi);
    p.rect(x + w - 1, y, 1, h, C.frame);
    p.put(x, y, C.warm); p.put(x + w - 1, y, C.warm);
  }

  /** 選択行（下地の帯）。scale=2 でタイトル/ポーズの大きいメニュー。 */
  function menuRow(p, x, y, w, label, on, t, scale = 2) {
    const hh = scale === 2 ? 15 : 11;
    if (on) {
      p.rect(x + 5, y - 4, w - 10, hh, C.void, 0.55);
      p.rect(x + 5, y - 4, w - 10, 1, C.warm, 0.85);
      p.rect(x + 5, y - 4 + hh - 1, w - 10, 1, C.frame, 0.7);
      const glow = 0.55 + Math.sin(t * 5) * 0.25;
      caret(p, x + 10, y, C.warm);
    }
    text(p, label, x + w / 2 + (on ? 2 : 0), y, on ? C.text : C.textDim, { font: "mini", scale, align: "center" });
  }

  /** タイトル/ヘルプの下地（静かに息をする寝姿）。 */
  function drawBackdrop(p, frame, dark = 0.5) {
    const w = g.world;
    frame.color.set(w.frame.color);
    frame.light.fill(0);
    pRef = p;
    p.reset();
    w.drawAmbient(p, g.t);
    drawSleeperBase(p, g.t, w.pal);
    w.drawOver(p, g.t);
    drawSleeperHead(p, g.t, 0, w.pal, "sleep", 0);
    blendRect(frame, 0, 0, W, H, C.void, dark);
    blendRect(frame, 0, 52, W, H, C.void, dark * 0.8);
  }

  function drawTitle(p, frame) {
    drawBackdrop(p, frame);

    const bob = Math.round(Math.sin(g.t * 1.2) * 1);
    // ロゴ
    text(p, "KA", W / 2 + 2, 6 + bob + 2, C.void, { font: "big", scale: 4, align: "center" });
    text(p, "KA", W / 2, 6 + bob, C.text, { font: "big", scale: 4, align: "center" });
    text(p, "MOSQUITO NIGHT", W / 2, 38, C.warm, { font: "mini", scale: 2, align: "center" });
    p.rect(W / 2 - 52, 50, 104, 1, C.frameHi);
    p.rect(W / 2 - 52, 50, 14, 1, C.warm);
    p.rect(W / 2 + 38, 50, 14, 1, C.warm);

    // メニュー
    const items = ["START", "HOW TO PLAY", g.soundOn ? "SOUND ON" : "SOUND OFF"];
    const bw = 112, bx = Math.round((W - bw) / 2);
    for (let i = 0; i < items.length; i++) {
      menuRow(p, bx, 61 + i * 18, bw, items[i], g.menuIndex === i, g.t);
    }
    // 操作
    const blink = Math.sin(g.t * 3) > -0.4;
    text(p, "UP/DOWN SELECT    SPACE OK", W / 2, 124, C.textDim, { align: "center", alpha: blink ? 1 : 0.6 });
    text(p, "3 NIGHTS   TATAMI / WESTERN / SUMMER", W / 2, H - 14, C.textDim, { align: "center", alpha: 0.8 });
  }

  function drawHelp(p, frame) {
    drawBackdrop(p, frame, 0.72);
    blendRect(frame, 0, 0, W, H, C.void, 0.55);
    pRef = p;
    const x = 30, y = 16, w = W - 60, h = H - 40;
    panel(frame, x, y, w, h, 0.5);
    text(p, "HOW TO PLAY", W / 2, y + 10, C.warm, { font: "big", align: "center", scale: 1 });
    p.rect(x + 12, y + 24, w - 24, 1, C.frameHi);
    const lines = [
      "A MOSQUITO COMES IN ON THE BUZZ.",
      "IT HOVERS, THEN STOPS TO BITE.",
      "SLAP IT WHILE IT RESTS ON YOU.",
      "A MISS SCARES IT AWAY.",
      "3 BITES AND THE NIGHT ENDS.",
      "SWAT EVERY BUG TO SLEEP ON.",
    ];
    for (let i = 0; i < lines.length; i++) {
      text(p, lines[i], x + 10, y + 34 + i * 11, i > 2 && i < 4 ? C.text : C.textDim);
    }
    p.rect(x + 12, y + 100, w - 24, 1, C.frameHi);
    text(p, "SPACE SLAP   P PRINCIPLES   M SOUND", x + 10, y + 106, C.textDim);
    text(p, "ESC PAUSE   R TITLE", x + 10, y + 116, C.textDim);
    const blink = Math.sin(g.t * 3) > -0.3;
    text(p, "SPACE / CLICK   BACK", W / 2, H - 16, blink ? C.text : C.textDim, { align: "center" });
  }

  function drawClearScreen(p, frame) {
    const info = g.clearInfo;
    blendRect(frame, 0, 0, W, H, C.void, 0.78);
    pRef = p;
    const x = 34, y = 22, w = W - 68, h = H - 44;
    panel(frame, x, y, w, h, 0.55);
    const inK = clamp01(g.clearT / 0.35);
    const title = info.clear ? "NIGHT CLEAR" : "DAWN BREAKS";
    if (g.clearT > 0.12) wobbleText(p, title, W / 2, y + 12, g.clearT * 0.7, 1.2 * inK, info.clear ? C.warm : C.text);
    text(p, "NIGHT " + (info.index + 1) + " / " + STAGES.length + "   " + info.name, W / 2, y + 30, C.textDim, { align: "center" });
    p.rect(x + 14, y + 39, w - 28, 1, C.frameHi);

    const rows = [
      ["SWAT", info.kills + " / " + info.bugs, C.text],
      ["BITE", String(info.bites), info.bites > 0 ? C.zit : C.text],
      ["BEST COMBO", "x" + Math.max(1, info.combo), C.text],
      ["NIGHT BONUS", "+" + info.bonus, C.warm],
      ["TOTAL SCORE", String(info.total), C.text],
    ];
    const vis = Math.min(rows.length, Math.floor(g.clearT / 0.16) + 1);
    for (let i = 0; i < vis; i++) {
      const ry = y + 48 + i * 11;
      text(p, rows[i][0], x + 16, ry, C.textDim);
      text(p, rows[i][1], x + w - 16, ry, rows[i][2], { align: "right" });
    }
    p.rect(x + 14, y + 104, w - 28, 1, C.frameHi);
    if (info.next) {
      text(p, "NEXT  " + info.next, W / 2, y + 110, C.text, { align: "center" });
    } else {
      text(p, "ALL " + STAGES.length + " NIGHTS DONE", W / 2, y + 110, C.warm, { align: "center" });
    }
    if (g.clearT > 0.5) {
      const blink = Math.sin(g.t * 4) > -0.3;
      text(p, "SPACE / TAP   NEXT NIGHT", W / 2, y + h - 12, blink ? C.text : C.textDim, { align: "center" });
    }
  }

  function drawPause(p, frame) {
    blendRect(frame, 0, 0, W, H, C.void, 0.72);
    pRef = p;
    const w = 118, x = Math.round((W - w) / 2), y = 24, h = 110;
    panel(frame, x, y, w, h, 0.55);
    text(p, "PAUSED", W / 2, y + 10, C.warm, { font: "big", align: "center" });
    p.rect(x + 12, y + 24, w - 24, 1, C.frameHi);
    const items = ["RESUME", "RESTART", "TITLE"];
    for (let i = 0; i < items.length; i++) menuRow(p, x + 12, y + 38 + i * 20, w - 24, items[i], g.pauseIndex === i, g.t);
  }

  /** 画面右下の「羽音スコープ」：蚊の方向と距離が一目で分かる。 */
  function drawScope(p, g) {
    const bw = 42, bh = 28, x0 = W - bw - 3, y0 = H - bh - 3;
    p.rect(x0, y0, bw, bh, C.void, 0.5);
    p.rect(x0, y0, bw, 1, C.frameHi, 0.55);
    p.rect(x0, y0 + bh - 1, bw, 1, C.frame, 0.7);
    p.rect(x0, y0, 1, bh, C.frameHi, 0.4);
    p.rect(x0 + bw - 1, y0, 1, bh, C.frameHi, 0.4);
    // 世界座標 → 枠内（部屋の平面をそのまま縮小）
    const mx = (wx) => x0 + 2 + clamp01((wx - 8) / 304) * (bw - 5);
    const my = (wy) => y0 + 2 + clamp01((wy - 88) / 88) * (bh - 5);
    // 自分（寝ている人）: 枕と体のライン
    for (let i = 0; i < 3; i++) p.put(mx(BED.head.cx + i * 60), my(BED.head.cy + 8), C.frameHi, 0.7);
    p.rect(Math.round(mx(BED.head.cx)) - 1, Math.round(my(BED.head.cy)) - 1, 3, 3, C.pillowHi, 0.75);
    const earX = BED.head.cx - 4, earY = BED.head.cy - 2;
    for (const b of g.bugs) {
      const d = Math.hypot(b.x - earX, b.y - earY);
      const near = 1 - Math.min(1, d / 240);
      const landed = b.state === "land";
      const c = landed ? C.zit : near > 0.62 ? C.warm : C.textDim;
      const bx = Math.round(mx(b.x)), by = Math.round(my(b.y));
      p.put(bx, by, c);
      p.put(bx + 1, by, c, 0.6);
      if (near > 0.5) {
        const a = 0.25 + Math.sin(g.t * (landed ? 16 : 8)) * 0.2;
        p.ring(bx, by, 3.5, 1, c, Math.max(0, a));
      }
    }
  }

  function drawHud(p, g) {
    const w = g.world;
    const left = 1 - clamp01(g.night / w.night);
    // 夜の残り（上端のバー）
    p.rect(0, 0, W, 1, C.void);
    p.rect(0, 0, Math.round(W * left), 1, left < 0.25 ? C.zit : C.pillowHi);
    p.rect(0, 1, W, 1, C.void, 0.35);

    // 体力（ハート）
    for (let i = 0; i < HP_MAX; i++) {
      const x = 6 + i * 10, y = 5, alive = i < g.hp, c = alive ? C.zit : C.wallHi;
      p.px(x + 1, y, c); p.px(x + 2, y + 1, c); p.px(x + 3, y, c);
      p.px(x, y + 1, c); p.px(x + 4, y + 1, c);
      p.rect(x, y + 2, 5, 1, c);
      p.rect(x + 1, y + 3, 3, 1, c);
      p.px(x + 2, y + 4, c);
    }
    if (g.hp === 1) {
      const a = 0.55 + Math.sin(g.t * 7) * 0.45;
      text(p, "1 BITE LEFT", 6, 14, C.zit, { alpha: Math.max(0.25, a) });
    }

    // 右上：部屋名と、捕獲の進み（四角いピップ）
    text(p, "NIGHT " + (g.stageIndex + 1) + "  " + w.name, W - 6, 5, C.textDim, { align: "right" });
    const total = w.bugs, pw = 5, gap = 2;
    const px0 = W - 6 - (total * pw + (total - 1) * gap);
    for (let i = 0; i < total; i++) {
      const x = px0 + i * (pw + gap);
      if (i < g.kills) p.rect(x, 14, pw, 4, C.pillowHi);
      else p.rect(x, 14, pw, 4, C.frame, 0.7);
    }

    // コンボ（続いているうちは数字が伸びる）
    if (g.combo > 1) {
      const k = clamp01(g.combo / 5);
      text(p, "COMBO", 6, 24, C.textDim);
      text(p, "x" + g.combo, 6, 30, k >= 1 ? C.warm : C.text, { font: "big" });
      for (let i = 0; i < Math.min(5, g.combo); i++) p.rect(6 + i * 5, 40, 3, 2, i < 5 ? C.warm : C.frame);
    }

    // 平手のクールダウン（打てない間は手の下に細いバー）
    if (!canSlap(g.hand) && g.phase === "play") {
      const k = clamp01(g.hand.cooldown / SLAP_COOLDOWN);
      const bx = Math.round(g.hand.x) - 11, by = Math.round(g.hand.y) + 17;
      p.rect(bx, by, 22, 2, C.void, 0.65);
      p.rect(bx, by, Math.round(22 * (1 - k)), 2, C.frameHi);
    }

    // 蚊の状態：着地中は刺されるまでの残り、ホバー中は「いま叩ける」窓
    for (const b of g.bugs) {
      if (b.state === "hover") {
        const win = 0.32 / (b.speed || 1);
        const k = clamp01(b.t / win);
        const r = 13 - k * 7;
        p.ring(b.x, b.y, r, 1, C.warm, 0.75 - k * 0.35);
        if (k > 0.55) {
          const a = 0.6 + Math.sin(g.t * 40) * 0.4;
          text(p, "NOW", b.x, b.y - r - 7, C.warm, { align: "center", alpha: a });
        }
      }
      if (b.state === "land" && b.spot?.kind === "skin") {
        const total = (b.spot.kind === "skin" ? 1.45 : 1.6) * (g.world.grace ?? 1) / (b.speed || 1);
        const grow = clamp01(1 - b.landTimer / Math.max(0.2, total));
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
    drawScope(p, g);
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
    // 顔（y=95〜126）を隠さないように、帯は上に置く
    blendRect(frame, 40, 26, W - 40, 82, C.void, 0.7 * a);
    text(p, g.banner ?? "", W / 2, 40, C.warm, { font: "big", align: "center", alpha: a });
    text(p, g.bannerT ?? "", W / 2, 56, C.text, { align: "center", alpha: a });
    if (g.stageIndex < STAGES.length - 1) {
      text(p, "NEXT - " + STAGE_NAMES[g.stageIndex + 1], W / 2, 68, C.textDim, { align: "center", alpha: a * 0.9 });
    }
  }

  // ---- 終わりの演出 ------------------------------------------------
  const CUT_HOLD = 1.9; // 演出を見せる時間（この後リザルトへ）

  function cutExpr() {
    if (!g.cut) return "sleep";
    return g.cut.kind === "fail" ? "ouch" : "happy";
  }

  /** 失敗のときは頭が左右に揺れる（痒くてたまらない）。 */
  function cutShake() {
    if (!g.cut || g.cut.kind !== "fail") return 0;
    const k = Math.min(1, g.cut.t / 0.25) * Math.max(0, 1 - g.cut.t / (CUT_HOLD + 0.4));
    return Math.sin(g.t * 26) * 2.4 * k;
  }

  /** クリア：夜明けの光と、頭のまわりに舞う光の粒。 */
  function drawClearFx(p, frame, t) {
    // 夜明けの光（画面全体をわずかに暖める）
    blendRect(frame, 0, 0, W, H, C.warm, 0.04 + Math.min(0.12, t * 0.09));
    drawSparkles(p, t);
  }

  /** 頭のまわりを舞い上がる光の粒。 */
  function drawSparkles(p, t) {
    const hx = BED.head.cx, hy = BED.head.cy;
    for (let i = 0; i < 12; i++) {
      const k = (t * 0.5 + i / 12) % 1;
      const x = Math.round(hx - 26 + ((i * 41) % 54) + Math.sin(i * 1.7 + t * 2) * 3);
      const y = Math.round(hy + 8 - k * 46);
      if (y < 6) continue;
      const big = i % 4 === 0;
      p.put(x, y, C.text);
      if (big) { p.put(x - 1, y, C.warm); p.put(x + 1, y, C.warm); p.put(x, y - 1, C.warm); p.put(x, y + 1, C.warm); }
    }
  }

  /** 失敗：頬と首に湿疹が増え、引っかき傷が走る。 */
  function drawFailFx(p, t) {
    const grow = Math.min(1, t / 0.9);
    const hx = BED.head.cx, hy = BED.head.cy;
    // 頬・あご・首すじに湿疹が増えていく（顔の輪郭の内側）
    const spots = [[6, 8], [-7, 10], [10, 12], [-2, 14], [14, 6], [-11, 6]];
    spots.forEach(([dx, dy], i) => {
      const r = 0.9 + grow * (1.1 + (i % 3) * 0.45);
      const x = hx + dx + Math.round(cutShake());
      const y = hy + dy;
      p.ellipse(x, y, r, r, g.world.pal.zit);
      p.put(x, y - 1, C.zitHi ?? C.warm);
    });
    // かいていた手（3本の傷）
    // かきむしる手：頬を3本の傷が滑る
    const k = (t * 2.6) % 1;
    if (k < 0.55) {
      for (let i = 0; i < 3; i++) {
        const x = Math.round(hx - 4 + k * 16) + i * 3;
        const y = hy + 10 + i * 2;
        p.line(x, y, x + 2, y - 3, C.skinHi);
      }
    }
  }

  /** 大きな文字を1文字ずつ揺らして出す。 */
  function wobbleText(p, str, cx, cy, t, amp, color) {
    const dy = Math.round(Math.sin(t * 16) * amp);
    const dx = Math.round(Math.cos(t * 11) * amp * 0.5);
    text(p, str, cx + dx + 1, cy + dy + 1, C.void, { font: "big", align: "center" });
    text(p, str, cx + dx, cy + dy, color, { font: "big", align: "center" });
  }

  function drawCutscene(p, frame) {
    const t = g.cut.t;
    const w = g.world;
    if (g.cut.kind === "fail") {
      drawFailFx(p, t);
      if (t > 0.12) wobbleText(p, "ITCHY!", W / 2, 44, t, 2.2, C.warm);
      text(p, "TOO ITCHY TO SLEEP", W / 2, 60, C.textDim, { align: "center" });
    } else {
      drawClearFx(p, frame, t);
      const all = g.cut.kind === "clear" && g.cut.allClear;
      const msg = all ? "ALL CLEAR!" : g.cut.kind === "clear" ? "NIGHT CLEAR!" : "DAWN!";
      if (t > 0.1) wobbleText(p, msg, W / 2, 44, t * 0.5, 1.4, C.warm);
      if (all) text(p, "3 NIGHTS, NO BITES", W / 2, 60, C.textDim, { align: "center" });
      else if (g.stageIndex < STAGES.length - 1) text(p, "NEXT - " + STAGE_NAMES[g.stageIndex + 1], W / 2, 60, C.textDim, { align: "center" });
    }
  }

  function rankFor() {
    const cleared = g.log.filter((r) => r.clear).length;
    const all = cleared >= STAGES.length;
    const score = g.finalScore || g.score;
    if (all && g.bites <= 2) return "S";
    if (all) return "A";
    if (score >= 3200) return "B";
    if (score >= 1800) return "C";
    return "D";
  }

  /** リザルト。ステージごとの成績を並べ、RETRY / TITLE を選べる。 */
  function drawResult(p, g) {
    const x0 = 28, y0 = 12, w = W - 56, h = H - 26;
    p.rect(x0, y0, w, h, C.void);
    p.rect(x0 + 1, y0 + 1, w - 2, h - 2, C.wall);
    p.rect(x0, y0, w, 1, C.pillowHi); p.rect(x0, y0 + h - 1, w, 1, C.frameHi);
    p.rect(x0, y0, 1, h, C.pillowHi); p.rect(x0 + w - 1, y0, 1, h, C.frameHi);
    // 四隅の飾り
    for (const [cx, cy] of [[x0 + 2, y0 + 2], [x0 + w - 3, y0 + 2], [x0 + 2, y0 + h - 3], [x0 + w - 3, y0 + h - 3]]) p.put(cx, cy, C.warm);

    const all = g.endReason === "dawn" || g.log.length >= STAGES.length;
    const title = (g.banner === "ALL CLEAR" ? "ALL CLEAR" : g.endReason === "eaten" ? "NO SLEEP" : g.banner) ?? "NO SLEEP";
    text(p, title, W / 2, y0 + 9, C.warm, { font: "big", align: "center" });
    p.rect(x0 + 10, y0 + 20, w - 20, 1, C.frameHi);

    text(p, "SCORE", x0 + 12, y0 + 26, C.textDim);
    text(p, String(g.finalScore || g.score), x0 + w - 12, y0 + 26, C.text, { align: "right" });
    p.rect(x0 + 10, y0 + 35, w - 20, 1, C.frame);

    // ステージごとの行
    for (let i = 0; i < STAGES.length; i++) {
      const r = g.log[i];
      const ry = y0 + 41 + i * 10;
      const dim = r ? C.text : C.frame;
      text(p, String(i + 1), x0 + 12, ry, r ? C.textDim : C.frame);
      text(p, STAGE_NAMES[i] ?? "", x0 + 22, ry, dim);
      if (r) {
        text(p, r.kills + "/" + r.bugs, x0 + w - 52, ry, r.clear ? C.text : C.textDim, { align: "right" });
        text(p, r.bites + " BITE", x0 + w - 12, ry, r.bites > 0 ? C.zit : C.textDim, { align: "right" });
      } else {
        text(p, "-", x0 + w - 12, ry, C.frame, { align: "right" });
      }
    }
    p.rect(x0 + 10, y0 + 74, w - 20, 1, C.frame);

    text(p, "BEST COMBO x" + Math.max(1, g.bestCombo), x0 + 12, y0 + 80, C.textDim);
    text(p, "MISS " + g.misses, x0 + w - 12, y0 + 80, C.textDim, { align: "right" });
    // ランク
    const rank = rankFor();
    text(p, "RANK", x0 + 12, y0 + 90, C.textDim);
    text(p, rank, x0 + w - 12, y0 + 88, rank === "S" ? C.warm : C.text, { font: "big", align: "right" });
    p.rect(x0 + 10, y0 + 100, w - 20, 1, C.frameHi);

    // メニュー
    const mw = 92, mx = Math.round((W - mw) / 2);
    const items = ["RETRY", "TITLE"];
    for (let i = 0; i < items.length; i++) menuRow(p, mx, y0 + 106 + i * 15, mw, items[i], g.resultIndex === i, g.t, 1);
  }

  return {
    state: g,
    update,
    draw,
    pointer,
    slap,
    start,
    restart,
    confirm,
    menuMove,
    togglePause,
    nextStage,
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
