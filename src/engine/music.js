// Generated music beds: rendered with WebAudio on the device, so there is nothing to license,
// nothing to download, and a project is never silent. Returns a WAV blob.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const PROG = {                          // MIDI roots, minor-ish progressions
  chill: [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]],
  hype: [[45, 52, 57, 60], [48, 52, 55, 60], [43, 50, 55, 59], [50, 53, 57, 60]],
  amapiano: [[50, 53, 57, 60], [48, 52, 55, 60], [45, 48, 52, 55], [47, 50, 53, 57]],
  cinematic: [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [45, 52, 57, 60]],
};

export async function generateBed(style = 'chill', bpm = 88, seconds = 60) {
  const sr = 44100;
  const loopBars = 8, loopSec = loopBars * 4 * 60 / bpm;
  const ctx = new OfflineAudioContext(2, Math.ceil((loopSec + 1.5) * sr), sr);
  const master = ctx.createGain(); master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ctx.destination);
  const beat = 60 / bpm, bar = beat * 4;
  const prog = PROG[style] || PROG.chill;
  const noise = noiseBuffer(ctx, 1);
  const bus = (type, freq, q = 0.7) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; f.connect(master); return f; };
  const buses = { 400: bus('lowpass', 400), 900: bus('lowpass', 900), 1200: bus('lowpass', 1200), 1800: bus('lowpass', 1800), 2200: bus('lowpass', 2200), 2600: bus('lowpass', 2600), 3000: bus('lowpass', 3000), hat: bus('highpass', 7000), clap: bus('bandpass', 1800, 0.8) };

  const env = (g, t, a, d, s, r, dur, peak = 1) => {
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.linearRampToValueAtTime(peak * s, t + a + d); g.gain.setValueAtTime(peak * s, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + r);
  };
  const tone = (type, freq, t, dur, vol, { a = 0.01, d = 0.1, s = 0.7, r = 0.2, detune = 0, lp = 0 } = {}) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
    const g = ctx.createGain(); env(g, t, a, d, s, r, dur, vol);
    o.connect(g); g.connect(lp ? buses[lp] : master); o.start(t); o.stop(t + dur + r + 0.05);
  };
  const kick = (t, vol = 1) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.4);
  };
  const hat = (t, vol = 0.25, len = 0.05) => {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    s.connect(g); g.connect(buses.hat); s.start(t); s.stop(t + len + 0.02);
  };
  const clap = (t, vol = 0.5) => {
    for (let i = 0; i < 3; i++) { const s = ctx.createBufferSource(); s.buffer = noise; const g = ctx.createGain(); g.gain.setValueAtTime(vol * (1 - i * 0.25), t + i * 0.012); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18 + i * 0.012); s.connect(g); g.connect(buses.clap); s.start(t + i * 0.012); s.stop(t + 0.3); }
  };
  const log = (t, freq, dur, vol = 0.9) => { // amapiano log drum
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(freq * 1.8, t); o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(buses[900]); o.start(t); o.stop(t + dur + 0.05);
  };

  const bars = loopBars;
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar, chord = prog[b % prog.length];
    // pads
    if (style === 'cinematic') {
      chord.forEach((n, i) => { tone('sawtooth', NOTE(n), t0, bar, 0.05, { a: bar * 0.4, d: 0.5, s: 0.9, r: 1.5, detune: i * 6 - 9, lp: 1200 }); tone('sine', NOTE(n - 12), t0, bar, 0.06, { a: 1, d: 0.5, s: 0.9, r: 1 }); });
      tone('sine', NOTE(chord[0] - 24), t0, bar, 0.12, { a: 0.5, d: 0.5, s: 0.9, r: 1 });
      if (b % 2 === 1) kick(t0, 0.5);
      continue;
    }
    if (style === 'chill') {
      chord.forEach((n, i) => tone('triangle', NOTE(n), t0, bar * 0.95, 0.07, { a: 0.3, d: 0.4, s: 0.8, r: 0.6, detune: i * 4 - 6, lp: 2200 }));
      for (let s = 0; s < 8; s++) { const t = t0 + s * beat / 2; hat(t, s % 2 ? 0.08 : 0.16, 0.06); }
      kick(t0, 0.8); kick(t0 + beat * 2.5, 0.6); clap(t0 + beat, 0.25); clap(t0 + beat * 3, 0.25);
      tone('sine', NOTE(chord[0] - 24), t0, beat * 1.5, 0.3, { a: 0.01, d: 0.3, s: 0.6, r: 0.2 }); tone('sine', NOTE(chord[0] - 24), t0 + beat * 2.5, beat, 0.25, { a: 0.01, d: 0.3, s: 0.6, r: 0.2 });
      if (b % 2 === 0) [0, 2, 1, 3].forEach((i, k) => tone('square', NOTE(chord[i] + 12), t0 + k * beat, beat * 0.5, 0.025, { a: 0.01, d: 0.1, s: 0.4, r: 0.2, lp: 1800 }));
      continue;
    }
    if (style === 'hype') {
      for (let s = 0; s < 4; s++) kick(t0 + s * beat, 1);
      for (let s = 0; s < 8; s++) hat(t0 + s * beat / 2 + (s % 2 ? beat * 0.02 : 0), s % 2 ? 0.14 : 0.22, 0.05);
      for (let s = 0; s < 16; s++) if (s % 4 === 2) hat(t0 + s * beat / 4, 0.1, 0.03);
      clap(t0 + beat, 0.6); clap(t0 + beat * 3, 0.6);
      chord.forEach((n, i) => tone('sawtooth', NOTE(n), t0, bar * 0.98, 0.045, { a: 0.05, d: 0.2, s: 0.8, r: 0.3, detune: i * 7 - 10, lp: 2600 }));
      for (let s = 0; s < 8; s++) tone('sawtooth', NOTE(chord[0] - 24), t0 + s * beat / 2, beat * 0.45, 0.28, { a: 0.005, d: 0.1, s: 0.5, r: 0.05, lp: 400 });
      if (b % 4 === 3) for (let s = 0; s < 8; s++) tone('square', NOTE(chord[(s + 1) % 4] + 12), t0 + s * beat / 2, beat * 0.25, 0.04, { a: 0.005, d: 0.05, s: 0.3, r: 0.1, lp: 3000 });
      continue;
    }
    // amapiano
    for (let s = 0; s < 16; s++) hat(t0 + s * beat / 4, s % 4 === 2 ? 0.2 : 0.07, 0.04);
    kick(t0, 0.7); kick(t0 + beat * 2, 0.7); clap(t0 + beat, 0.35); clap(t0 + beat * 3, 0.35);
    const pat = [0, 0.75, 1.5, 2.25, 3, 3.5];
    pat.forEach((p, i) => log(t0 + p * beat, NOTE(chord[i % 2 ? 0 : 0] - 24 + (i === 4 ? 7 : 0)), beat * 0.6, 0.85));
    chord.forEach((n, i) => tone('triangle', NOTE(n + 12), t0 + beat * 1.5, beat * 1.2, 0.05, { a: 0.02, d: 0.2, s: 0.5, r: 0.3, detune: i * 3 }));
    if (b % 2) chord.forEach((n) => tone('triangle', NOTE(n + 12), t0 + beat * 3.5, beat * 0.5, 0.05, { a: 0.01, d: 0.1, s: 0.5, r: 0.2 }));
  }
  // fade out at the end
  master.gain.setValueAtTime(0.8, seconds - 2); master.gain.linearRampToValueAtTime(0, seconds);
  const buf = await ctx.startRendering();
  return new File([toWav(buf)], `${style}-${bpm}bpm.wav`, { type: 'audio/wav' });
}

// Repeat the rendered loop to the wanted length, overlapping the tail, then fade the end.
function tile(loop, loopSec, seconds, sr) {
  const n = Math.ceil(seconds * sr), L = Math.round(loopSec * sr), out = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: sr });
  for (let ch = 0; ch < 2; ch++) {
    const d = out.getChannelData(ch), src = loop.getChannelData(ch);
    for (let start = 0; start < n; start += L) for (let i = 0; i < src.length && start + i < n; i++) d[start + i] += src[i];
    const fade = Math.min(n, Math.round(2 * sr));
    for (let i = 0; i < fade; i++) d[n - 1 - i] *= i / fade;
    for (let i = 0; i < n; i++) { const v = d[i]; d[i] = v > 1 ? 1 : v < -1 ? -1 : v; }
  }
  return out;
}

function noiseBuffer(ctx, seconds) {
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

export function toWav(buf) {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const out = new ArrayBuffer(44 + n * ch * 2), v = new DataView(out);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, ch, true); v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * ch * 2, true);
  let o = 44;
  const chans = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, chans[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true); o += 2; }
  return out;
}
