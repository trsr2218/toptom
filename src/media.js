// Media import and probing. Files stay on the device as blobs in IndexedDB.
import { media as mediaStore } from './store.js';
import { uid } from './model.js';

const urls = new Map();
export function mediaURL(m) {
  if (!urls.has(m.id)) urls.set(m.id, URL.createObjectURL(m.blob));
  return urls.get(m.id);
}
export function releaseURL(id) { const u = urls.get(id); if (u) { URL.revokeObjectURL(u); urls.delete(id); } }

export function kindOf(file) {
  const t = file.type || '', n = file.name.toLowerCase();
  if (t.startsWith('video/') || /\.(mp4|mov|webm|mkv|m4v|ts|avi)$/.test(n)) return 'video';
  if (t.startsWith('image/') || /\.(png|jpe?g|webp|gif|heic|avif|bmp|svg)$/.test(n)) return 'image';
  if (t.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/.test(n)) return 'audio';
  return null;
}

export async function importFile(file, onProgress) {
  const kind = kindOf(file);
  if (!kind) throw new Error(`Topier cannot read ${file.name}. Use a video, photo or sound file.`);
  const m = { id: uid(), name: file.name.replace(/\.[^.]+$/, ''), file: file.name, type: file.type, kind, size: file.size, blob: file, created: Date.now(), duration: 0, w: 0, h: 0, thumb: null, peaks: null };
  const url = URL.createObjectURL(file);
  try {
    if (kind === 'image') await probeImage(m, url);
    else if (kind === 'video') await probeVideo(m, url);
    else await probeAudio(m, url);
    if (kind !== 'image') { onProgress && onProgress('Reading the sound...'); m.peaks = await peaks(file).catch(() => null); if (kind === 'video' && !m.peaks) m.silent = true; }
  } finally { URL.revokeObjectURL(url); }
  await mediaStore.put(m);
  return m;
}

function probeImage(m, url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      m.w = img.naturalWidth; m.h = img.naturalHeight; m.duration = 0;
      m.thumb = thumbFrom(img, m.w, m.h);
      res();
    };
    img.onerror = () => rej(new Error('Could not read this image.'));
    img.src = url;
  });
}

function probeVideo(m, url) {
  return new Promise((res, rej) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    const fail = () => rej(new Error('This browser cannot play this video. MP4 (H.264) and WebM work everywhere.'));
    v.onerror = fail;
    v.onloadedmetadata = () => {
      m.duration = isFinite(v.duration) ? v.duration : 0; m.w = v.videoWidth; m.h = v.videoHeight;
      v.currentTime = Math.min(1, m.duration / 3);
    };
    v.onseeked = () => { m.thumb = thumbFrom(v, m.w, m.h); v.src = ''; res(); };
    setTimeout(() => { if (!m.thumb) { m.thumb = null; if (m.duration || m.w) res(); else fail(); } }, 8000);
  });
}

function probeAudio(m, url) {
  return new Promise((res, rej) => {
    const a = new Audio(); a.preload = 'metadata'; a.src = url;
    a.onloadedmetadata = () => { m.duration = isFinite(a.duration) ? a.duration : 0; res(); };
    a.onerror = () => rej(new Error('This browser cannot play this sound file.'));
    setTimeout(res, 8000);
  });
}

function thumbFrom(src, w, h) {
  const c = document.createElement('canvas');
  const k = Math.min(1, 320 / Math.max(w, h));
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  try { c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.7); } catch { return null; }
}

// Waveform peaks: about 20 per second, normalised 0..1, as a plain array so it stores cleanly.
let actx;
export async function decodeAudio(blob) {
  actx ??= new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
  const buf = await blob.arrayBuffer();
  return await actx.decodeAudioData(buf);
}
async function peaks(blob) {
  const ab = await decodeAudio(blob);
  const ch = ab.getChannelData(0);
  const per = Math.floor(ab.sampleRate / 20), n = Math.floor(ch.length / per);
  const out = new Array(n);
  let max = 1e-6;
  for (let i = 0; i < n; i++) {
    let s = 0; const o = i * per;
    for (let j = 0; j < per; j += 4) s += ch[o + j] * ch[o + j];
    out[i] = Math.sqrt(s / (per / 4)); if (out[i] > max) max = out[i];
  }
  return out.map((v) => +(v / max).toFixed(3));
}

// The loudest non-overlapping windows of a given length, from stored peaks (20 per second).
export function loudestWindows(peaks, len, count = 3) {
  const w = Math.min(peaks.length, Math.round(len * 20));
  if (!w) return [];
  const score = []; let sum = 0;
  for (let i = 0; i < peaks.length; i++) {
    sum += peaks[i]; if (i >= w) sum -= peaks[i - w];
    if (i >= w - 1) score.push({ start: (i - w + 1) / 20, v: sum / w });
  }
  score.sort((a, b) => b.v - a.v);
  const picks = [];
  for (const c of score) { if (picks.every((p) => Math.abs(p.start - c.start) >= len)) picks.push(c); if (picks.length === count) break; }
  const top = picks[0] ? picks[0].v : 1;
  return picks.map((p) => ({ start: p.start, level: p.v / top }));
}

// Beat markers: onsets from the peak envelope, for cut-on-the-beat.
export function beats(peaks, minGap = 0.3) {
  if (!peaks) return [];
  const out = []; let last = -1;
  const avg = peaks.reduce((a, b) => a + b, 0) / peaks.length;
  for (let i = 2; i < peaks.length - 1; i++) {
    const t = i / 20;
    if (peaks[i] > avg * 1.3 && peaks[i] > peaks[i - 1] * 1.25 && peaks[i] >= peaks[i + 1] && t - last >= minGap) { out.push(t); last = t; }
  }
  return out;
}
