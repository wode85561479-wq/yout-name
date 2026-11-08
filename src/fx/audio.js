// Procedural ambience with WebAudio — nothing is loaded from files.
//   wind      : filtered noise with slow gusts (all day)
//   cicadas   : a band-passed, pulsing drone (late morning to afternoon)
//   higurashi : the descending "kana-kana-kana" call of evening cicadas (dusk)
//   crickets  : bell-cricket trills (night)

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const band = (h, a, b, c, d) => clamp01(Math.min((h - a) / (b - a), (d - h) / (d - c)));

export function createAmbience() {
  let ctx = null;
  let master, windGain, windFilter, cicadaGain, higuBus, cricketBus;
  let noiseBuf;
  let nextHigu = 0, nextCricket = 0, nextGust = 0;
  let weights = { wind: 0, cicada: 0, higu: 0, cricket: 0 };
  let enabled = false;

  function makeNoise() {
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b = (b + 0.02 * w) / 1.02; // gentle low-pass for a softer bed
      d[i] = w * 0.35 + b * 3.0;
    }
    return buf;
  }

  function loopNoise() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.loopStart = Math.random();
    src.start(0, Math.random() * 2);
    return src;
  }

  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = makeNoise();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // wind
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.7;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    loopNoise().connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);

    // cicada drone: two band-passed noise voices, amplitude-modulated
    cicadaGain = ctx.createGain();
    cicadaGain.gain.value = 0;
    cicadaGain.connect(master);
    for (const [f, rate, pan] of [[4300, 23, -0.5], [5600, 31, 0.45]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = 6;
      const am = ctx.createGain();
      am.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.45;
      lfo.connect(lfoDepth);
      lfoDepth.connect(am.gain);
      lfo.start();
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      loopNoise().connect(bp);
      bp.connect(am);
      am.connect(p);
      p.connect(cicadaGain);
    }

    higuBus = ctx.createGain();
    higuBus.gain.value = 0;
    higuBus.connect(master);
    cricketBus = ctx.createGain();
    cricketBus.gain.value = 0;
    cricketBus.connect(master);
  }

  // One evening cicada: a run of bright pulses that slide down in pitch and fade.
  function higurashi(t0) {
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(higuBus);
    const n = 14 + Math.floor(Math.random() * 10);
    const f0 = 4200 + Math.random() * 500;
    const gap = 0.1 + Math.random() * 0.03;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * gap;
      const k = i / n;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f0 * (1 - 0.08 * k), t);
      osc.frequency.linearRampToValueAtTime(f0 * (1 - 0.08 * k) * 0.93, t + gap * 0.8);
      const g = ctx.createGain();
      const amp = 0.22 * (1 - k * 0.75) * (i < 3 ? (i + 1) / 3 : 1);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0008, t + gap * 0.9);
      osc.connect(g);
      g.connect(pan);
      osc.start(t);
      osc.stop(t + gap);
    }
  }

  // Bell cricket (鈴虫): "riiin" — a fast-trilled high tone, repeated.
  function cricket(t0) {
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.8 - 0.9;
    pan.connect(cricketBus);
    const f = 4000 + Math.random() * 900;
    const reps = 2 + Math.floor(Math.random() * 4);
    for (let r = 0; r < reps; r++) {
      const t = t0 + r * (0.55 + Math.random() * 0.2);
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      const trem = ctx.createOscillator();
      trem.frequency.value = 45 + Math.random() * 15;
      const tremDepth = ctx.createGain();
      tremDepth.gain.value = 0.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06, t + 0.03);
      g.gain.setValueAtTime(0.06, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.42);
      const am = ctx.createGain();
      am.gain.value = 0.5;
      trem.connect(tremDepth);
      tremDepth.connect(am.gain);
      osc.connect(am);
      am.connect(g);
      g.connect(pan);
      osc.start(t); trem.start(t);
      osc.stop(t + 0.45); trem.stop(t + 0.45);
    }
  }

  return {
    get enabled() { return enabled; },
    async enable() {
      if (!ctx) init();
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* ignore */ } }
      enabled = true;
      master.gain.setTargetAtTime(0.7, ctx.currentTime, 0.8);
    },
    disable() {
      enabled = false;
      if (ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    },
    update(hour, after) {
      if (!ctx || !enabled) return;
      const h = ((hour % 24) + 24) % 24;
      const now = ctx.currentTime;
      weights = {
        wind: 0.65,
        cicada: band(h, 8.5, 10.5, 15.5, 17.2) * (after ? 0.7 : 1),
        higu: Math.max(band(h, 16.3, 17.2, 18.8, 19.4), band(h, 4.6, 5.0, 5.5, 6.2) * 0.6),
        cricket: Math.max(band(h, 18.8, 19.8, 23.9, 24.1), band(h, -0.1, 0, 3.8, 4.8)),
      };
      windGain.gain.setTargetAtTime(0.16 * weights.wind, now, 1.5);
      cicadaGain.gain.setTargetAtTime(0.05 * weights.cicada, now, 2);
      higuBus.gain.setTargetAtTime(0.5 * weights.higu, now, 1.5);
      cricketBus.gain.setTargetAtTime(0.6 * weights.cricket, now, 1.5);
      if (now > nextGust) {
        windFilter.frequency.setTargetAtTime(280 + Math.random() * 700, now, 1.8);
        nextGust = now + 2 + Math.random() * 4;
      }
      if (weights.higu > 0.05 && now > nextHigu) {
        higurashi(now + 0.05);
        nextHigu = now + 5 + Math.random() * 9;
      }
      if (weights.cricket > 0.05 && now > nextCricket) {
        cricket(now + 0.05);
        nextCricket = now + 0.4 + Math.random() * 1.6;
      }
    },
  };
}
