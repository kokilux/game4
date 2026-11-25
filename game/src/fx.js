// pixelfx のエフェクトをゲームに接続する層。叩いた瞬間の「火花」は本家の impact をそのまま使う。

import { createFx } from "../../vendor/pixelfx/src/core/index.js";
import * as hitSpark from "../../vendor/pixelfx/src/fx/impacts/hit-spark.js";
import * as bluntHit from "../../vendor/pixelfx/src/fx/impacts/blunt-hit.js";
import * as critHit from "../../vendor/pixelfx/src/fx/impacts/crit-hit.js";

export function createFxLayer() {
  const live = [];
  return {
    spawn(mod, x, y, opts = {}) {
      const fx = createFx(mod, { x, y, ...opts });
      live.push(fx);
      return fx;
    },
    /** 平手が当たった音と光。 */
    slap(x, y, big = false) {
      if (big) this.spawn(critHit, x, y, { light: 1.1 });
      return this.spawn(hitSpark, x, y, { light: 0.9 });
    },
    thud(x, y) {
      return this.spawn(bluntHit, x, y, { light: 0.75 });
    },
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        live[i].update(dt);
        if (live[i].done()) live.splice(i, 1);
      }
    },
    draw(frame, layer = "front") {
      for (const fx of live) fx.draw(frame, layer);
    },
    clear() { live.length = 0; },
    get count() { return live.length; },
  };
}
