#!/usr/bin/env node
// ブラウザなしでゲームロジックを検証する。
//   node game/tools/sim-test.mjs

import { createGame } from "../src/game.js";

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}

const STEP = 1 / 60;
const run = (g, sec) => { for (let i = 0; i < Math.round(sec / STEP); i++) g.update(STEP); };

/** 蚊が着地するまで進める。 */
function untilLanded(g, max = 20) {
  for (let i = 0; i < max / STEP; i++) {
    g.update(STEP);
    const d = g.debug();
    if (d.state === "land") return d;
  }
  return null;
}

console.log("KA ロジック");
{
  const g = createGame({ seed: 5 });
  g.start();
  const d = untilLanded(g);
  check("蚊は着地する", !!d, JSON.stringify(d));

  // 着地した蚊を狙って叩く
  g.pointer(d.mosquito.x, d.mosquito.y);
  run(g, 0.12); // 手を寄せる
  const slapped = g.slap();
  run(g, 0.4);
  const after = g.debug();
  check("着地中の蚊は叩ける", slapped && after.kills === 1, JSON.stringify(after));
  check("スコアが入る", after.score > 0, String(after.score));
}

{
  const g = createGame({ seed: 9 });
  g.start();
  run(g, 1.0); // まだ飛んでいる
  const d = g.debug();
  check("飛んでいる蚊は叩けない", d.state === "fly", d.state);
  g.pointer(d.mosquito.x, d.mosquito.y);
  g.slap();
  run(g, 0.4);
  check("空振りはキルにならない", g.debug().kills === 0, String(g.debug().kills));
  check("空振りはカウントされる", g.state.misses >= 1, String(g.state.misses));
}

{
  // 肌に着地させて放置 → 刺される
  const g = createGame({ seed: 21 });
  g.start();
  let bit = false, guard = 0;
  while (!bit && guard++ < 60 * 40) {
    g.update(STEP);
    const m = g.state.bugs[0];
    if (m && m.state === "land" && m.spot.kind === "skin") {
      const hp0 = g.state.hp;
      for (let i = 0; i < 200 && g.state.hp === hp0; i++) g.update(STEP);
      bit = g.state.hp < hp0;
    }
  }
  check("肌に着地して放置すると刺される", bit, `hp=${g.state.hp}`);
  check("刺されると睡眠が減る", g.state.hp < 3, String(g.state.hp));
}

{
  // ヒットストップ：当たった直後は世界が止まる
  const g = createGame({ seed: 5 });
  g.start();
  const d = untilLanded(g);
  g.pointer(d.mosquito.x, d.mosquito.y);
  run(g, 0.12);
  g.slap();
  // 当たるまで進める
  let killed = false;
  for (let i = 0; i < 30 && !killed; i++) {
    g.update(STEP);
    killed = g.state.kills === 1;
  }
  const hs = g.state.hitStop;
  check("当たるとヒットストップが入る", killed && hs > 0, `hitStop=${hs.toFixed(3)}`);
  const nightBefore = g.state.night;
  g.update(STEP);
  check("ヒットストップ中は時計が止まる", Math.abs(g.state.night - nightBefore) < 1e-9, `${nightBefore} → ${g.state.night}`);
}

{
  const g = createGame({ seed: 2 });
  g.start();
  run(g, 46);
  check("45秒で夜が明ける", g.state.phase === "dawn" || g.state.phase === "over", g.state.phase);
  run(g, 3);
  check("リザルトに移る", g.state.phase === "over", g.state.phase);
  g.restart();
  g.start();
  check("再挑戦でリセットされる", g.state.hp === 3 && g.state.kills === 0 && g.state.score === 0, JSON.stringify(g.debug()));
}

{
  // 同じ種なら同じ結果（Math.random を使っていない証拠）
  const trace = (seed) => {
    const g = createGame({ seed });
    g.start();
    const log = [];
    for (let i = 0; i < 60 * 6; i++) {
      g.update(STEP);
      if (i % 10 === 0) log.push(g.debug().mosquito.x.toFixed(3) + "," + g.debug().mosquito.y.toFixed(3));
    }
    return log.join("|");
  };
  check("決定的（同じ種で同じ動き）", trace(4) === trace(4));
  check("種が違えば動きも違う", trace(4) !== trace(5));
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
