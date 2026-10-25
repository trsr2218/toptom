import { openTrial } from './trial.js';
// Topier project model. Plain JSON so it saves to IndexedDB and travels to Topi as data.
// Times are seconds. Positions are fractions of the canvas (0..1), so a project can change size.

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const SIZES = {
  reels: { id: 'reels', name: 'Reels, TikTok, Shorts', w: 1080, h: 1920, label: '9:16' },
  square: { id: 'square', name: 'Square post', w: 1080, h: 1080, label: '1:1' },
  portrait: { id: 'portrait', name: 'Feed post', w: 1080, h: 1350, label: '4:5' },
  landscape: { id: 'landscape', name: 'YouTube, X, Facebook', w: 1920, h: 1080, label: '16:9' },
};

export const TRACK_KINDS = {
  video: { name: 'Video', accepts: ['video', 'image'] },
  overlay: { name: 'Overlay', accepts: ['video', 'image'] },
  text: { name: 'Text', accepts: ['text', 'caption'] },
  audio: { name: 'Music', accepts: ['audio'] },
  voice: { name: 'Voice', accepts: ['audio'] },
};

export function newProject({ name = 'Untitled video', size = 'reels', fps = 30, mode = 'standard' } = {}) {
  const s = SIZES[size] || SIZES.reels;
  const now = Date.now();
  return {
    id: uid(), v: 1, name, w: s.w, h: s.h, fps, mode, created: now, updated: now,
    bg: '#000000',
    tracks: [
      { id: uid(), kind: 'text', name: 'Text', clips: [], muted: false, locked: false },
      { id: uid(), kind: 'overlay', name: 'Overlay', clips: [], muted: false, locked: false },
      { id: uid(), kind: 'video', name: 'Video', clips: [], muted: false, locked: false },
      { id: uid(), kind: 'voice', name: 'Voice', clips: [], muted: false, locked: false },
      { id: uid(), kind: 'audio', name: 'Music', clips: [], muted: false, locked: false, duck: true },
    ],
    captions: { style: 'bold', position: 0.78, font: 'Inter', size: 0.055, color: '#ffffff', highlight: '#FF7A1A', bg: 'rgba(0,0,0,0.55)' },
    brandKitId: null,
    watermark: !openTrial(),
    history: [],
  };
}

const BASE = () => ({
  id: uid(), start: 0, duration: 5, in: 0, speed: 1, volume: 1, muted: false,
  x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, fit: 'cover',
  look: 'none', lookAmount: 1, transIn: { type: 'none', dur: 0.5 }, transOut: { type: 'none', dur: 0.5 }, kf: {},
});

export function newMediaClip(media, start = 0) {
  const c = { ...BASE(), type: media.kind, mediaId: media.id, name: media.name, start };
  if (media.kind === 'image') c.duration = 4;
  else { c.duration = media.duration || 5; c.srcDuration = media.duration || 5; }
  if (media.kind === 'audio') { c.fadeIn = 0; c.fadeOut = 0.8; }
  return c;
}

export function newTextClip(preset, start = 0, text = null) {
  const { id: _id, name: _name, text: presetText, ...style } = preset || {};
  const t = text || presetText || 'Your text';
  return {
    ...BASE(), type: 'text', start, duration: 4,
    font: 'Inter', weight: 800, size: 0.08, color: '#ffffff', bg: 'transparent', pad: 0.4,
    align: 'center', letter: 0, line: 1.1, shadow: true, stroke: '', radius: 0.5, maxWidth: 0.9,
    anim: 'pop', transIn: { type: 'none', dur: 0.3 }, transOut: { type: 'none', dur: 0.3 },
    ...style, text: t, name: t,
  };
}

export function newCaptionClip(words, start, duration) {
  // words: [{ t, d, w }] relative to the clip start
  return { ...BASE(), type: 'caption', name: 'Captions', start, duration, words, y: 0.78, text: words.map((w) => w.w).join(' ') };
}

export const clipEnd = (c) => c.start + c.duration;
export const projectDuration = (p) => Math.max(0, ...p.tracks.flatMap((t) => t.clips.map(clipEnd)));
export const findClip = (p, id) => { for (const t of p.tracks) { const c = t.clips.find((x) => x.id === id); if (c) return { clip: c, track: t }; } return null; };
export const trackOf = (p, kind) => p.tracks.find((t) => t.kind === kind);

// Source time for a clip at timeline time t, honouring speed.
export const sourceTime = (c, t) => c.in + (t - c.start) * c.speed;

// Interpolated property value at time t (keyframes in Pro mode, else the static value).
export function prop(c, key, t) {
  const kfs = c.kf && c.kf[key];
  if (!kfs || !kfs.length) return c[key];
  const lt = t - c.start;
  if (lt <= kfs[0].t) return kfs[0].v;
  for (let i = 1; i < kfs.length; i++) {
    if (lt <= kfs[i].t) {
      const a = kfs[i - 1], b = kfs[i], k = (lt - a.t) / Math.max(1e-6, b.t - a.t);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // ease in-out
      return a.v + (b.v - a.v) * e;
    }
  }
  return kfs[kfs.length - 1].v;
}

// Snap clips on a track so they do not overlap: later clips shift right.
export function tidyTrack(track) {
  track.clips.sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const c of track.clips) {
    if (c.start < cursor) c.start = cursor;
    cursor = c.start + c.duration;
  }
}

// Close gaps on the main video track so the story plays through.
export function ripple(track) {
  track.clips.sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const c of track.clips) { c.start = cursor; cursor += c.duration; }
}

export function splitClip(track, clip, t) {
  if (t <= clip.start + 0.1 || t >= clipEnd(clip) - 0.1) return null;
  const left = clip, right = { ...JSON.parse(JSON.stringify(clip)), id: uid() };
  const cut = t - clip.start;
  right.start = t; right.duration = clip.duration - cut; right.in = clip.in + cut * clip.speed;
  left.duration = cut;
  left.transOut = { type: 'none', dur: 0.5 }; right.transIn = { type: 'none', dur: 0.5 };
  if (clip.words) {
    left.words = clip.words.filter((w) => w.t < cut);
    right.words = clip.words.filter((w) => w.t >= cut).map((w) => ({ ...w, t: w.t - cut }));
  }
  track.clips.splice(track.clips.indexOf(clip) + 1, 0, right);
  return right;
}

export function resizeProject(p, size) {
  const s = SIZES[size] || SIZES.reels;
  p.w = s.w; p.h = s.h;
}

export function summarize(p) {
  // The compact view Topi reads: no blobs, no history.
  const d = projectDuration(p);
  return {
    name: p.name, size: `${p.w}x${p.h}`, fps: p.fps, mode: p.mode, duration: +d.toFixed(2),
    tracks: p.tracks.map((t) => ({
      kind: t.kind, muted: t.muted,
      clips: t.clips.map((c) => ({
        id: c.id, type: c.type, name: c.name, start: +c.start.toFixed(2), duration: +c.duration.toFixed(2),
        ...(c.type === 'text' ? { text: c.text, font: c.font, anim: c.anim } : {}),
        ...(c.type === 'caption' ? { words: c.words ? c.words.length : 0 } : {}),
        ...(c.look && c.look !== 'none' ? { look: c.look } : {}),
        ...(c.transIn && c.transIn.type !== 'none' ? { transIn: c.transIn.type } : {}),
        ...(c.speed !== 1 ? { speed: c.speed } : {}),
        ...(c.volume !== 1 ? { volume: c.volume } : {}),
      })),
    })),
    captions: !!p.tracks.some((t) => t.clips.some((c) => c.type === 'caption')),
    music: !!trackOf(p, 'audio').clips.length,
    watermark: p.watermark,
  };
}
