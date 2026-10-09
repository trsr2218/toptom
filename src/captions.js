// Captions: decode a clip's sound to 16 kHz mono, send to the Whisper worker, get word timings back.
import { decodeAudio } from './media.js';
import { sourceTime, clipEnd } from './model.js';

let worker = null;
function getWorker() {
  worker ??= new Worker('/src/captions.worker.js', { type: 'module' });
  return worker;
}

export function captionsAvailable() { return typeof Worker === 'function' && typeof WebAssembly === 'object'; }

// Resample an AudioBuffer slice to 16 kHz mono.
async function toMono16k(buf, offset, duration) {
  const sr = 16000, n = Math.max(1, Math.ceil(duration * sr));
  const ctx = new OfflineAudioContext(1, n, sr);
  const s = ctx.createBufferSource(); s.buffer = buf; s.connect(ctx.destination);
  s.start(0, offset, duration);
  const out = await ctx.startRendering();
  return out.getChannelData(0);
}

/**
 * Transcribe one clip. Returns words relative to the clip's timeline start: [{ w, t, d }].
 * onProgress({ stage: 'decode'|'model'|'listen', pct })
 */
export async function transcribeClip(clip, media, { lang = 'en', onProgress = () => {} } = {}) {
  onProgress({ stage: 'decode', pct: 0 });
  const buf = await decodeAudio(media.blob);
  const offset = Math.max(0, clip.in), dur = Math.min(clip.duration * (clip.speed || 1), Math.max(0.5, buf.duration - offset));
  const audio = await toMono16k(buf, offset, dur);
  const w = getWorker();
  const id = Math.random().toString(36).slice(2);
  return new Promise((res, rej) => {
    const onMsg = (e) => {
      const m = e.data;
      if (m.type === 'progress') onProgress(m);
      if (m.id && m.id !== id) return;
      if (m.type === 'done') { w.removeEventListener('message', onMsg); res(m.words.map((x) => ({ ...x, t: x.t / (clip.speed || 1), d: x.d / (clip.speed || 1) }))); }
      if (m.type === 'error') { w.removeEventListener('message', onMsg); rej(new Error(m.message)); }
    };
    w.addEventListener('message', onMsg);
    w.postMessage({ type: 'transcribe', id, audio, lang }, [audio.buffer]);
  });
}

// Captions typed by hand: spread the words evenly over the clip.
export function wordsFromText(text, duration) {
  const ws = String(text).split(/\s+/).filter(Boolean);
  if (!ws.length) return [];
  const per = duration / ws.length;
  return ws.map((w, i) => ({ w, t: i * per, d: per * 0.9 }));
}
