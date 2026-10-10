// Export: renders every frame with the same compositor as the preview, encodes with WebCodecs
// (H.264 + AAC) and muxes to MP4 in the browser. Falls back to a real-time WebM recording when
// WebCodecs is missing, then converts that to MP4 with ffmpeg.wasm.
import { Muxer, ArrayBufferTarget } from '../../vendor/mp4-muxer/mp4-muxer.mjs';
import { clipEnd, sourceTime, projectDuration, prop } from '../model.js';
import { mediaURL, decodeAudio } from '../media.js';
import { drawFrame, loadWatermark } from './render.js';
import { ensureFont } from '../presets.js';
import { frameSourceFor, releaseBuffers } from './decoder.js';

export function webCodecsAvailable() {
  return typeof VideoEncoder === 'function' && typeof AudioEncoder === 'function' && typeof VideoFrame === 'function';
}

const even = (n) => Math.round(n / 2) * 2;

export async function exportProject(project, preset, { getMedia, onProgress = () => {}, signal } = {}) {
  const W = even(preset.w), H = even(preset.h), fps = preset.fps || project.fps || 30;
  const duration = projectDuration(project);
  if (duration <= 0) throw new Error('Add something to the timeline first.');
  await loadWatermark();
  const fonts = new Set(project.tracks.flatMap((t) => t.clips.map((c) => c.font).filter(Boolean)));
  fonts.add(project.captions && project.captions.font || 'Inter');
  await Promise.all([...fonts].map(ensureFont));
  if (webCodecsAvailable()) return exportWebCodecs(project, { W, H, fps, duration, kbps: preset.kbps || 8000 }, getMedia, onProgress, signal);
  return exportRecorder(project, { W, H, fps, duration }, getMedia, onProgress, signal);
}

// Frame sources for offline rendering. Video clips decode straight from the file with WebCodecs
// (decoder.js); clips that cannot are seeked on a video element. Images are decoded once.
function offlineSources(project, getMedia) {
  const els = new Map(), images = new Map(), decoders = new Map(), frames = new Map(), tried = new Set();
  const el = (c, m) => {
    let v = els.get(c.id);
    if (!v) { v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = mediaURL(m); els.set(c.id, v); }
    return v;
  };
  const ready = (v) => v.readyState >= 1 ? Promise.resolve() : new Promise((r) => { v.onloadedmetadata = () => r(); v.onerror = () => r(); setTimeout(r, 8000); });
  const seek = (v, st) => new Promise((res) => {
    if (Math.abs(v.currentTime - st) < 0.002 && v.readyState >= 2) return res();
    let done = false; const fin = () => { if (!done) { done = true; res(); } };
    v.onseeked = fin; v.currentTime = st; setTimeout(fin, 1500);
  });
  const decoderFor = async (c, m) => {
    if (decoders.has(c.id)) return decoders.get(c.id);
    if (tried.has(c.id)) return null;
    tried.add(c.id);
    const fs = await frameSourceFor(m);
    if (fs) decoders.set(c.id, fs);
    return fs;
  };
  return {
    stats: { decoded: 0, seeked: 0 },
    async prepare(t) {
      const jobs = [];
      for (const tr of project.tracks) for (const c of tr.clips) {
        if (c.type === 'video') {
          const nearStart = t >= c.start - 0.001 && t < clipEnd(c);
          const nextStarts = tr.clips.some((n) => n !== c && Math.abs(n.start - clipEnd(c)) < 0.06 && t >= n.start && t < n.start + ((n.transIn && n.transIn.dur) || 0.5) + 0.05);
          if (!nearStart && !nextStarts) {
            // finished with this clip: free its decoder
            const d = decoders.get(c.id); if (d && t > clipEnd(c) + 3) { d.close(); decoders.delete(c.id); frames.delete(c.id); }
            continue;
          }
          const m = getMedia(c.mediaId); if (!m) continue;
          const st = nearStart ? sourceTime(c, t) : sourceTime(c, clipEnd(c) - 0.001);
          jobs.push((async () => {
            const d = await decoderFor(c, m);
            if (d) {
              try { const f = await d.frameAt(Math.max(0, st)); if (f) { frames.set(c.id, f); this.stats.decoded++; return; } }
              catch (e) { console.warn('decoder fell back to seeking for', c.name, e && e.message); d.close(); decoders.delete(c.id); }
            }
            const v = el(c, m);
            await ready(v); await seek(v, Math.max(0, Math.min(st, (v.duration || st) - 0.001))); this.stats.seeked++;
          })());
        } else if (c.type === 'image' && !images.has(c.mediaId)) {
          const m = getMedia(c.mediaId); if (!m) continue;
          const img = new Image(); img.src = mediaURL(m); images.set(c.mediaId, img);
          jobs.push(img.decode().catch(() => {}));
        }
      }
      await Promise.all(jobs);
    },
    get(c) {
      if (c.type === 'image') { const i = images.get(c.mediaId); return i && i.naturalWidth ? i : null; }
      if (c.type === 'video') {
        const f = frames.get(c.id); if (f) return f;
        const v = els.get(c.id); return v && v.readyState >= 2 ? v : null;
      }
      return null;
    },
    destroy() { for (const v of els.values()) v.src = ''; for (const d of decoders.values()) d.close(); decoders.clear(); frames.clear(); releaseBuffers(); },
  };
}

async function exportWebCodecs(project, { W, H, fps, duration, kbps }, getMedia, onProgress, signal) {
  const level = W * H > 1920 * 1080 ? '640033' : W * H > 1280 * 720 ? '640028' : '64001f';
  const vcfg = { codec: `avc1.${level}`, width: W, height: H, bitrate: kbps * 1000, framerate: fps, latencyMode: 'quality', avc: { format: 'avc' } };
  const sup = await VideoEncoder.isConfigSupported(vcfg);
  if (!sup.supported) { vcfg.codec = 'avc1.42001f'; const s2 = await VideoEncoder.isConfigSupported(vcfg); if (!s2.supported) throw new Error('This browser cannot encode H.264 video.'); }
  const sampleRate = 48000;
  const acfg = { codec: 'mp4a.40.2', sampleRate, numberOfChannels: 2, bitrate: 160000 };
  const asup = await AudioEncoder.isConfigSupported(acfg).catch(() => ({ supported: false }));
  const withAudio = asup.supported;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(), fastStart: 'in-memory',
    video: { codec: 'avc', width: W, height: H, frameRate: fps },
    audio: withAudio ? { codec: 'aac', numberOfChannels: 2, sampleRate } : undefined,
    firstTimestampBehavior: 'offset',
  });
  let encErr = null;
  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { encErr = e; } });
  venc.configure(vcfg);

  // Audio first: it is quick and it tells us early if decoding fails.
  if (withAudio) {
    onProgress({ stage: 'audio', pct: 0 });
    const mix = await mixAudio(project, duration, sampleRate, getMedia);
    const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { encErr = e; } });
    aenc.configure(acfg);
    const frames = mix.length, step = 1024 * 8;
    for (let i = 0; i < frames; i += step) {
      const n = Math.min(step, frames - i);
      const data = new Float32Array(n * 2);
      data.set(mix.getChannelData(0).subarray(i, i + n), 0);
      data.set(mix.getChannelData(1).subarray(i, i + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / sampleRate * 1e6), data });
      aenc.encode(ad); ad.close();
    }
    await aenc.flush(); aenc.close();
  }

  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  const src = offlineSources(project, getMedia);
  const total = Math.ceil(duration * fps);
  const t0 = performance.now();
  try {
    for (let i = 0; i < total; i++) {
      if (signal && signal.aborted) throw new Error('cancelled');
      if (encErr) throw encErr;
      const t = i / fps;
      await src.prepare(t);
      drawFrame(ctx, project, t, src, {});
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
      venc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
      if (i % 3 === 0) {
        const el = (performance.now() - t0) / 1000, eta = i ? el / i * (total - i) : 0;
        onProgress({ stage: 'video', pct: i / total, eta });
      }
    }
    await venc.flush(); venc.close();
  } finally { src.destroy(); }
  if (encErr) throw encErr;
  muxer.finalize();
  onProgress({ stage: 'done', pct: 1 });
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

// ---------- audio mix ----------
const bufCache = new Map();
async function audioBuffer(m) {
  if (!bufCache.has(m.id)) bufCache.set(m.id, decodeAudio(m.blob).catch(() => null));
  return bufCache.get(m.id);
}

export async function mixAudio(project, duration, sampleRate, getMedia) {
  const len = Math.ceil(duration * sampleRate) + sampleRate;
  const ctx = new OfflineAudioContext(2, len, sampleRate);
  // voice intervals: where speech or on-camera sound plays, for ducking
  const voice = [];
  for (const tr of project.tracks) for (const c of tr.clips) {
    if ((c.type === 'video' && tr.kind !== 'audio') || tr.kind === 'voice') if (!c.muted && !tr.muted && c.volume > 0) voice.push([c.start, clipEnd(c)]);
  }
  for (const tr of project.tracks) for (const c of tr.clips) {
    if (c.type !== 'video' && c.type !== 'audio') continue;
    if (c.muted || tr.muted || c.volume <= 0) continue;
    const m = getMedia(c.mediaId); if (!m) continue;
    const buf = await audioBuffer(m); if (!buf) continue;
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = c.speed || 1;
    const g = ctx.createGain();
    const base = c.volume;
    g.gain.setValueAtTime(c.fadeIn ? 0 : base, c.start);
    if (c.fadeIn) g.gain.linearRampToValueAtTime(base, c.start + c.fadeIn);
    if (c.fadeOut) { g.gain.setValueAtTime(base, Math.max(c.start, clipEnd(c) - c.fadeOut)); g.gain.linearRampToValueAtTime(0, clipEnd(c)); }
    // keyframed volume
    if (c.kf && c.kf.volume && c.kf.volume.length) for (const k of c.kf.volume) g.gain.linearRampToValueAtTime(k.v, c.start + k.t);
    s.connect(g);
    let last = g;
    if (tr.kind === 'audio' && tr.duck && voice.length) {
      const d = ctx.createGain(); d.gain.setValueAtTime(1, 0);
      for (const [a, b] of voice) {
        const a0 = Math.max(0, a - 0.15), b0 = b + 0.15;
        if (b0 <= c.start || a0 >= clipEnd(c)) continue;
        d.gain.setValueAtTime(1, Math.max(0, a0 - 0.3)); d.gain.linearRampToValueAtTime(0.22, a0);
        d.gain.setValueAtTime(0.22, b0); d.gain.linearRampToValueAtTime(1, b0 + 0.5);
      }
      g.connect(d); last = d;
    }
    last.connect(ctx.destination);
    const offset = Math.max(0, c.in), durS = Math.min(c.duration * (c.speed || 1), Math.max(0, buf.duration - offset));
    try { s.start(c.start, offset, durS); } catch {}
  }
  const out = await ctx.startRendering();
  // trim to duration
  const n = Math.ceil(duration * sampleRate);
  const trimmed = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate });
  for (let ch = 0; ch < 2; ch++) trimmed.copyToChannel(out.getChannelData(ch).subarray(0, n), ch);
  // soft limiter
  for (let ch = 0; ch < 2; ch++) { const d = trimmed.getChannelData(ch); for (let i = 0; i < d.length; i++) { const v = d[i]; d[i] = v > 1 ? 1 : v < -1 ? -1 : v; } }
  return trimmed;
}

// ---------- fallback: real-time recording ----------
async function exportRecorder(project, { W, H, fps, duration }, getMedia, onProgress, signal) {
  if (typeof MediaRecorder !== 'function') throw new Error('This browser cannot export video. Use Chrome, Edge or a current Safari.');
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  const stream = canvas.captureStream(fps);
  const ac = new AudioContext({ sampleRate: 48000 });
  const mix = await mixAudio(project, duration, 48000, getMedia);
  const src = ac.createBufferSource(); src.buffer = mix; const dest = ac.createMediaStreamDestination(); src.connect(dest);
  dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
  const parts = []; rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const done = new Promise((r) => { rec.onstop = r; });
  const sources = offlineSources(project, getMedia);
  rec.start(500); src.start();
  const t0 = performance.now();
  try {
    for (;;) {
      const t = (performance.now() - t0) / 1000;
      if (t >= duration || (signal && signal.aborted)) break;
      await sources.prepare(t); drawFrame(ctx, project, t, sources, {});
      onProgress({ stage: 'video', pct: t / duration, eta: duration - t });
      await new Promise((r) => setTimeout(r, 1000 / fps));
    }
  } finally { rec.stop(); src.stop(); sources.destroy(); }
  await done; await ac.close();
  const webm = new Blob(parts, { type: 'video/webm' });
  onProgress({ stage: 'convert', pct: 0.98 });
  try { return await webmToMp4(webm, onProgress); } catch { return webm; }
}

async function webmToMp4(webm, onProgress) {
  const { FFmpeg } = await import('../../vendor/ffmpeg/dist/esm/index.js');
  const ff = new FFmpeg();
  const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
  const get = async (u, type) => { const cache = await caches.open('topier-core-0.12.6').catch(() => null); let r = cache && await cache.match(u); if (!r) { r = await fetch(u); if (cache && r.ok) cache.put(u, r.clone()); } return URL.createObjectURL(new Blob([await r.arrayBuffer()], { type })); };
  await ff.load({ coreURL: await get(`${base}/ffmpeg-core.js`, 'text/javascript'), wasmURL: await get(`${base}/ffmpeg-core.wasm`, 'application/wasm') });
  await ff.writeFile('/in.webm', new Uint8Array(await webm.arrayBuffer()));
  ff.on('progress', ({ progress }) => onProgress({ stage: 'convert', pct: 0.98 + progress * 0.02 }));
  await ff.exec(['-i', '/in.webm', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '/out.mp4']);
  const data = await ff.readFile('/out.mp4');
  return new Blob([data.buffer], { type: 'video/mp4' });
}
