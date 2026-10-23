// All sound is synthesised: no files to load, nothing to fail through the proxy.
let ac = null, master = null, noiseBuf = null;
const loops = {};

function ctx() {
  if (ac) return ac;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ac = new AC();
  master = ac.createGain(); master.gain.value = .55;
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}
const now = () => ac.currentTime;
function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function noise(dur, type, freq, q, peak, dec, delay = 0, rate = 1) {
  if (!ctx()) return;
  const t = now() + delay;
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = rate;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain(); env(g, t, .002, peak, dec);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t, Math.random() * .5, dur + .05);
  return f;
}
function tone(type, f0, f1, peak, dec, delay = 0) {
  if (!ctx()) return;
  const t = now() + delay;
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dec);
  const g = ac.createGain(); env(g, t, .004, peak, dec);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dec + .05);
}
function loop(name, build) {
  if (loops[name] || !ctx()) return loops[name];
  loops[name] = build();
  return loops[name];
}
function kill(name) { const L = loops[name]; if (!L) return; try { L.stop(); } catch (e) { } delete loops[name]; }

export const sfx = {
  unlock() { if (ctx() && ac.state === 'suspended') ac.resume(); },
  step() { noise(.04, 'lowpass', 500, 1, .08, .05, 0, .6); },
  door(heavy) { tone('triangle', heavy ? 90 : 160, heavy ? 60 : 110, .12, .25); noise(.2, 'bandpass', heavy ? 300 : 900, 2, .06, .2); },
  pick(heavy) { if (heavy) noise(.06, 'bandpass', 2400, 6, .12, .05); else tone('square', 2400 + Math.random() * 600, 2000, .03, .03); },
  grab() { noise(.15, 'lowpass', 700, 1, .25, .15); tone('sine', 140, 70, .2, .15); },
  punch() { tone('sine', 160, 50, .55, .12); noise(.05, 'lowpass', 1200, 1, .35, .06); },
  pickup() { tone('triangle', 660, 660, .08, .05); tone('triangle', 990, 990, .08, .07, .06); },
  toss() { noise(.25, 'bandpass', 600, 1, .12, .25); },
  knife() { noise(.08, 'highpass', 3000, 1, .25, .08); tone('sine', 120, 40, .4, .14, .1); },
  dry() { tone('square', 1800, 1700, .05, .02); },
  reload() { tone('square', 900, 850, .06, .03); tone('square', 600, 560, .07, .04, .5); tone('square', 1300, 1250, .07, .03, .9); },
  shotQuiet() { noise(.08, 'lowpass', 1100, .7, .55, .09); tone('sine', 180, 60, .5, .09); noise(.02, 'highpass', 4000, 1, .12, .03); },
  shotLoud(d = 5) { const v = Math.max(.15, 1 - d / 22); noise(.35, 'lowpass', 2600, .5, .9 * v, .32); tone('sine', 110, 40, .8 * v, .25); noise(.04, 'highpass', 3000, 1, .5 * v, .05); },
  ricochet() { tone('sine', 2600 + Math.random() * 1500, 900, .05, .14); noise(.04, 'bandpass', 3000, 3, .1, .05); },
  hit() { noise(.06, 'lowpass', 500, 1, .6, .08); tone('sine', 90, 40, .45, .1); },
  hurt() { tone('sawtooth', 220, 90, .2, .18); noise(.1, 'lowpass', 700, 1, .45, .12); },
  glass() { for (let i = 0; i < 6; i++) tone('triangle', 2500 + Math.random() * 3000, 1800, .06, .12 + Math.random() * .2, i * .03); noise(.3, 'highpass', 3500, 1, .3, .3); },
  spark() { noise(.2, 'highpass', 4000, 1, .2, .2); tone('square', 120, 40, .1, .2); },
  thud() { tone('sine', 110, 45, .5, .2); noise(.08, 'lowpass', 400, 1, .3, .12); },
  spotted() { tone('square', 700, 700, .08, .06); tone('square', 1050, 1050, .1, .12, .07); },
  ding() { tone('triangle', 880, 880, .12, .12); tone('triangle', 1320, 1320, .12, .25, .1); },
  clang() { tone('triangle', 420 + Math.random() * 200, 300, .18, .4); noise(.1, 'bandpass', 1500, 4, .15, .12); },
  crash(p) { const v = Math.min(1, p / 9); noise(.4, 'lowpass', 1400, .6, .7 * v + .2, .35); tone('sine', 80, 35, .7 * v + .2, .3); noise(.25, 'bandpass', 3000, 2, .25 * v, .25, .02); },
  boom() { noise(1.2, 'lowpass', 900, .5, 1, 1.1, 0, .5); tone('sine', 70, 25, 1, .9); },
  alarm(on) {
    if (!on) return kill('alarm');
    loop('alarm', () => {
      const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = 980;
      const lfo = ac.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 2.2;
      const lg = ac.createGain(); lg.gain.value = 230; lfo.connect(lg); lg.connect(o.frequency);
      const g = ac.createGain(); g.gain.value = .035;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
      o.connect(f); f.connect(g); g.connect(master); o.start(); lfo.start();
      return { stop() { o.stop(); lfo.stop(); } };
    });
  },
  engine(on) {
    if (!on) return kill('engine');
    loop('engine', () => {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 45;
      const o2 = ac.createOscillator(); o2.type = 'square'; o2.frequency.value = 22.5;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 3;
      const g = ac.createGain(); g.gain.value = .13;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(master); o.start(); o2.start();
      return { o, o2, f, g, stop() { o.stop(); o2.stop(); } };
    });
  },
  engineSpeed(v, boost) {
    const L = loops.engine; if (!L) return;
    const t = now();
    L.o.frequency.setTargetAtTime(45 + v * 120 + (boost ? 40 : 0), t, .08);
    L.o2.frequency.setTargetAtTime(22.5 + v * 60, t, .08);
    L.f.frequency.setTargetAtTime(380 + v * 900 + (boost ? 600 : 0), t, .1);
  },
  skid(on) {
    if (!on) { const L = loops.skid; if (L) { L.g.gain.setTargetAtTime(0, now(), .05); } return; }
    const L = loop('skid', () => {
      const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 4;
      const g = ac.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(master); s.start();
      return { g, stop() { s.stop(); } };
    });
    L && L.g.gain.setTargetAtTime(.12, now(), .03);
  },
  siren(on) {
    if (!on) return kill('siren');
    loop('siren', () => {
      const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = 800;
      const lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = .55;
      const lg = ac.createGain(); lg.gain.value = 330; lfo.connect(lg); lg.connect(o.frequency);
      const g = ac.createGain(); g.gain.value = 0;
      o.connect(g); g.connect(master); o.start(); lfo.start();
      return { g, stop() { o.stop(); lfo.stop(); } };
    });
  },
  sirenNear(d) { const L = loops.siren; if (L) L.g.gain.setTargetAtTime(Math.max(0, .1 * (1 - d / 28)), now(), .2); },
  stopLoops() { for (const k of Object.keys(loops)) kill(k); }
};
