// WebAudio だけで鳴らす。蚊の羽音は音程と音量で距離を伝える（暗闇のレーダー）。

export function createAudio() {
  let ctx = null;
  let master = null;
  let buzz = null;
  let noiseBuf = null;
  let muted = false;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    // ノイズ（拍手・空振り・羽音の下地）
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // 蚊の羽音：2つの発振器 + ローパス + トレモロ
    const osc1 = ctx.createOscillator();
    osc1.type = "sawtooth";
    osc1.frequency.value = 320;
    const osc2 = ctx.createOscillator();
    osc2.type = "square";
    osc2.frequency.value = 640;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;
    lp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.value = 0;
    const trem = ctx.createOscillator();
    trem.frequency.value = 8.5;
    const tremGain = ctx.createGain();
    tremGain.gain.value = 0.35;
    const tremSum = ctx.createGain();
    tremSum.gain.value = 1;
    trem.connect(tremGain).connect(tremSum.gain);
    osc1.connect(lp);
    osc2.connect(lp);
    lp.connect(g).connect(tremSum).connect(master);
    osc1.start();
    osc2.start();
    trem.start();
    buzz = { osc1, osc2, g, lp, trem };
    return ctx;
  }

  const now = () => (ctx ? ctx.currentTime : 0);

  function noise(dur, { type = "highpass", freq = 1200, gain = 0.25, q = 0.8, sweep = 0 } = {}) {
    if (!ctx) return;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, now());
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(80, freq * sweep), now() + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now());
    g.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
    s.connect(f).connect(g).connect(master);
    s.start(now());
    s.stop(now() + dur + 0.02);
  }

  function tone(freq, dur, { type = "sine", gain = 0.2, to = null, delay = 0 } = {}) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    o.type = type;
    const t0 = now() + delay;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  return {
    unlock() {
      const c = ensure();
      if (!c) return;
      if (c.state === "suspended") c.resume();
    },
    setMuted(v) {
      muted = v;
      if (master.canPlay) master.gain.value = v ? 0 : 0.9;
    },
    get muted() { return muted; },
    /** 羽音。vol 0 で消える。 */
    buzz(vol, freq, on) {
      if (!ctx || !buzz) return;
      const v = muted ? 0 : Math.max(0, Math.min(0.13, vol));
      buzz.g.gain.setTargetAtTime(on ? v : 0, now(), 0.05);
      if (on) {
        buzz.osc1.frequency.setTargetAtTime(freq, now(), 0.06);
        buzz.osc2.frequency.setTargetAtTime(freq * 2.02, now(), 0.06);
      }
    },
    swing() {
      if (!ctx) return;
      noise(0.09, { type: "highpass", freq: 1500, gain: 0.06, sweep: 2.4 });
    },
    hit(fast) {
      if (!ctx) return;
      // 平手：低い「バシッ」+ 空気の破裂
      noise(0.06, { type: "lowpass", freq: 2200, gain: 0.4, sweep: 0.25 });
      noise(0.03, { type: "highpass", freq: 3000, gain: 0.22 });
      tone(fast ? 220 : 180, 0.12, { type: "triangle", gain: 0.3, to: 70 });
      if (fast) tone(880, 0.09, { type: "square", gain: 0.06, delay: 0.02, to: 1320 });
    },
    miss() {
      if (!ctx) return;
      noise(0.12, { type: "bandpass", freq: 700, gain: 0.1, q: 1.2, sweep: 2.2 });
    },
    bite() {
      if (!ctx) return;
      tone(140, 0.3, { type: "sawtooth", gain: 0.16, to: 90 });
      tone(1200, 0.16, { type: "square", gain: 0.05, to: 600, delay: 0.02 });
      noise(0.2, { type: "bandpass", freq: 900, gain: 0.08, q: 2 });
    },
    land() {
      if (!ctx) return;
      tone(520, 0.05, { type: "sine", gain: 0.05 });
    },
    /** コンボ：上がっていく短いアルペジオ（特典の合図）。 */
    combo(n = 3) {
      if (!ctx) return;
      const base = 660 + Math.min(6, n) * 40;
      [0, 1, 2].forEach((i) => tone(base * (1 + i * 0.26), 0.16, { type: "triangle", gain: 0.085, delay: i * 0.055 }));
    },
    /** 起きてしまった：警告の2音。 */
    wake() {
      if (!ctx) return;
      tone(180, 0.22, { type: "square", gain: 0.11, to: 120 });
      tone(240, 0.24, { type: "square", gain: 0.09, to: 140, delay: 0.18 });
      noise(0.3, { type: "bandpass", freq: 500, gain: 0.12, q: 1.1 });
    },
    start() {
      if (!ctx) return;
      tone(440, 0.18, { type: "triangle", gain: 0.1 });
      tone(660, 0.22, { type: "triangle", gain: 0.08, delay: 0.1 });
    },
    end(good) {
      if (!ctx) return;
      const notes = good ? [523, 659, 784, 1046] : [392, 330, 262];
      notes.forEach((f, i) => tone(f, 0.4, { type: "triangle", gain: 0.09, delay: i * 0.13 }));
    },
  };
}
