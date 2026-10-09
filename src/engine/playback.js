// Real-time playback for the editor: one media element per clip, kept in step with the timeline clock.
import { clipEnd, sourceTime, projectDuration, prop } from '../model.js';
import { mediaURL } from '../media.js';
import { drawFrame } from './render.js';

export class Player {
  constructor(project, canvas, getMedia) {
    this.project = project; this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.getMedia = getMedia;              // (mediaId) -> media record (sync, from a cache)
    this.els = new Map();                  // clip.id -> element
    this.images = new Map();               // media.id -> HTMLImageElement
    this.time = 0; this.playing = false; this.rate = 1;
    this.selected = null; this.guides = true; this.loop = false;
    this._raf = 0; this._clock = 0; this._t0 = 0; this.onTime = null; this.onEnd = null;
    this.sources = { get: (c, t) => this.source(c, t), get selected() { return null; } };
    this.sources = { get: (c, t) => this.source(c, t) };
    Object.defineProperty(this.sources, 'selected', { get: () => this.selected });
    this.volume = 1;
  }

  // Return a drawable for the clip at time t.
  source(c, t) {
    const m = this.getMedia(c.mediaId);
    if (!m) return null;
    if (c.type === 'image') {
      let img = this.images.get(m.id);
      if (!img) { img = new Image(); img.onload = () => this.draw(); img.src = mediaURL(m); this.images.set(m.id, img); }
      return img.complete && img.naturalWidth ? img : null;
    }
    if (c.type === 'video') {
      const v = this.el(c, m);
      return v.readyState >= 2 ? v : null;
    }
    return null;
  }

  el(c, m) {
    let e = this.els.get(c.id);
    if (!e) {
      e = document.createElement(c.type === 'audio' ? 'audio' : 'video');
      e.preload = 'auto'; e.playsInline = true; e.crossOrigin = 'anonymous'; e.src = mediaURL(m);
      e.muted = false; e._clip = c.id;
      e.addEventListener('seeked', () => { if (!this.playing) this.draw(); });
      e.addEventListener('loadeddata', () => { if (!this.playing) this.draw(); });
      this.els.set(c.id, e);
    }
    return e;
  }

  // Keep every element on the right frame and play state for time t.
  sync(t, hard = false) {
    const p = this.project;
    const active = new Set();
    let voiceActive = false;
    for (const tr of p.tracks) for (const c of tr.clips) {
      if (c.type !== 'video' && c.type !== 'audio') continue;
      const on = t >= c.start && t < clipEnd(c);
      if (!on) continue;
      if ((c.type === 'video' || tr.kind === 'voice') && !c.muted && !tr.muted && c.volume > 0) voiceActive = true;
    }
    for (const tr of p.tracks) for (const c of tr.clips) {
      if (c.type !== 'video' && c.type !== 'audio') continue;
      const m = this.getMedia(c.mediaId); if (!m) continue;
      const e = this.el(c, m);
      const on = t >= c.start && t < clipEnd(c);
      if (!on) { if (!e.paused) e.pause(); continue; }
      active.add(c.id);
      const st = sourceTime(c, t);
      const drift = Math.abs((e.currentTime || 0) - st);
      if (hard || drift > (this.playing ? 0.25 : 0.03)) { try { e.currentTime = st; } catch {} }
      e.playbackRate = Math.min(4, Math.max(0.25, c.speed * this.rate));
      let vol = c.muted || tr.muted ? 0 : prop(c, 'volume', t);
      const lt = t - c.start, rem = clipEnd(c) - t;
      if (c.fadeIn && lt < c.fadeIn) vol *= lt / c.fadeIn;
      if (c.fadeOut && rem < c.fadeOut) vol *= rem / c.fadeOut;
      if (tr.kind === 'audio' && tr.duck && voiceActive) vol *= 0.22;
      e.volume = Math.max(0, Math.min(1, vol * this.volume));
      if (this.playing && e.paused) e.play().catch(() => {});
      if (!this.playing && !e.paused) e.pause();
    }
    for (const [id, e] of this.els) if (!active.has(id) && !e.paused) e.pause();
  }

  draw() {
    const t = this.time;
    drawFrame(this.ctx, this.project, t, this.sources, { guides: this.guides && !this.playing });
  }

  seek(t) {
    this.time = Math.max(0, Math.min(projectDuration(this.project), t));
    this._t0 = performance.now(); this._clock = this.time;
    this.sync(this.time, true); this.draw();
    this.onTime && this.onTime(this.time);
  }

  play() {
    if (this.playing) return;
    const end = projectDuration(this.project);
    if (this.time >= end - 0.02) this.time = 0;
    this.playing = true; this._t0 = performance.now(); this._clock = this.time;
    this.sync(this.time, true);
    const tick = () => {
      if (!this.playing) return;
      this.time = this._clock + ((performance.now() - this._t0) / 1000) * this.rate;
      const dur = projectDuration(this.project);
      if (this.time >= dur) {
        if (this.loop && dur > 0) { this.time = 0; this._clock = 0; this._t0 = performance.now(); this.sync(0, true); }
        else { this.time = dur; this.pause(); this.onEnd && this.onEnd(); return; }
      }
      this.sync(this.time); this.draw(); this.onTime && this.onTime(this.time);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  pause() {
    this.playing = false; cancelAnimationFrame(this._raf);
    for (const e of this.els.values()) if (!e.paused) e.pause();
    this.sync(this.time, false); this.draw(); this.onTime && this.onTime(this.time);
  }

  toggle() { this.playing ? this.pause() : this.play(); }

  // Call when clips were removed or media changed.
  refresh() {
    const ids = new Set(this.project.tracks.flatMap((t) => t.clips.map((c) => c.id)));
    for (const [id, e] of this.els) if (!ids.has(id)) { e.pause(); e.src = ''; this.els.delete(id); }
    this.sync(this.time, true); this.draw();
  }

  destroy() { this.pause(); for (const e of this.els.values()) { e.src = ''; } this.els.clear(); }
}
