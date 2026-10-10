// Fast frame access for export: demux MP4/MOV with mp4box.js and decode with WebCodecs, so frames
// stream straight out of the file instead of the player seeking to every one. Anything this cannot
// handle (WebM, odd codecs, huge files, no WebCodecs) returns null and export falls back to seeking.

const MAX_BYTES = 600 * 1024 * 1024;
let mp4boxLoad = null;
function loadMP4Box() {
  if (window.MP4Box) return Promise.resolve(window.MP4Box);
  mp4boxLoad ??= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = '/vendor/mp4box/mp4box.all.min.js';
    s.onload = () => res(window.MP4Box); s.onerror = () => rej(new Error('mp4box failed to load'));
    document.head.appendChild(s);
  });
  return mp4boxLoad;
}

const buffers = new Map(); // media.id -> Promise<ArrayBuffer>, shared between clips of the same file
export function releaseBuffers() { buffers.clear(); }

export function decoderAvailable() { return typeof VideoDecoder === 'function' && typeof EncodedVideoChunk === 'function'; }

export async function frameSourceFor(media) {
  if (!media || media.kind !== 'video' || !decoderAvailable()) return null;
  if (media.size > MAX_BYTES) return null;
  const isMp4 = /mp4|quicktime|m4v/i.test(media.type || '') || /\.(mp4|mov|m4v)$/i.test(media.file || '');
  if (!isMp4) return null;
  const fs = new FrameSource(media);
  try { await fs.open(); return fs; } catch (e) { console.warn('Decoder path unavailable for', media.name, e && e.message); fs.close(); return null; }
}

function rotationOf(matrix) {
  if (!matrix || matrix.length < 5) return 0;
  const a = matrix[0] / 65536, b = matrix[1] / 65536;
  const deg = Math.round(Math.atan2(b, a) * 180 / Math.PI);
  return ((deg % 360) + 360) % 360;
}

export class FrameSource {
  constructor(media) {
    this.media = media; this.file = null; this.track = null; this.decoder = null; this.config = null;
    this.pending = []; this.out = []; this.current = null; this.eof = false; this.err = null; this.rotation = 0;
    this.canvas = null; this.lastT = -1;
  }

  async open() {
    const MP4Box = await loadMP4Box();
    if (!buffers.has(this.media.id)) buffers.set(this.media.id, this.media.blob.arrayBuffer());
    const buffer = await buffers.get(this.media.id);
    const file = MP4Box.createFile();
    this.file = file;
    const ready = new Promise((res, rej) => { file.onReady = res; file.onError = (e) => rej(new Error(String(e))); setTimeout(() => rej(new Error('mp4 parse timeout')), 30000); });
    const CH = 8 * 1024 * 1024;
    for (let off = 0; off < buffer.byteLength; off += CH) {
      const chunk = buffer.slice(off, Math.min(buffer.byteLength, off + CH)); chunk.fileStart = off; file.appendBuffer(chunk);
    }
    file.flush();
    const info = await ready;
    const track = info.videoTracks && info.videoTracks[0];
    if (!track) throw new Error('no video track');
    this.track = track;
    const trak = file.getTrackById(track.id);
    let description = null;
    for (const entry of trak.mdia.minf.stbl.stsd.entries) {
      const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
      if (box) { const DS = window.DataStream || MP4Box.DataStream; const ds = new DS(undefined, 0, DS.BIG_ENDIAN); box.write(ds); description = new Uint8Array(ds.buffer, 8); break; }
    }
    const config = { codec: track.codec, hardwareAcceleration: 'prefer-hardware' };
    if (description && !/^vp0?9/.test(track.codec)) config.description = description;
    if (track.video) { config.codedWidth = track.video.width; config.codedHeight = track.video.height; }
    const sup = await VideoDecoder.isConfigSupported(config).catch(() => ({ supported: false }));
    if (!sup.supported) { delete config.hardwareAcceleration; const s2 = await VideoDecoder.isConfigSupported(config).catch(() => ({ supported: false })); if (!s2.supported) throw new Error('codec not supported: ' + track.codec); }
    this.config = config;
    this.rotation = rotationOf(trak.tkhd && trak.tkhd.matrix);
    file.onSamples = (id, user, samples) => { for (const s of samples) this.pending.push(s); if (this.pending.length > 90) file.stop(); };
    file.setExtractionOptions(track.id, null, { nbSamples: 30 });
    this.duration = track.duration / track.timescale;
  }

  _newDecoder() {
    if (this.decoder && this.decoder.state !== 'closed') { try { this.decoder.close(); } catch {} }
    this.decoder = new VideoDecoder({ output: (f) => this.out.push(f), error: (e) => { this.err = e; } });
    this.decoder.configure(this.config);
    this.err = null;
  }

  _drain() { for (const f of this.out) f.close(); this.out.length = 0; }

  // Position the stream so that frames from the keyframe before t will flow.
  seek(t) {
    try { this.file.stop(); } catch {}
    this.pending.length = 0; this._drain();
    if (this.current) { this.current.close(); this.current = null; }
    this._newDecoder(); this.eof = false;
    this.file.seek(Math.max(0, Math.min(t, Math.max(0, this.duration - 0.05))), true);
    this.file.start();
    this.lastT = -1;
  }

  // The frame to show at source time t (seconds). Monotonic use is fast; going backwards re-seeks.
  async frameAt(t) {
    // Re-seek when going backwards or jumping more than 1.5 s ahead; otherwise decode forward.
    if (this.lastT < 0 || t < this.lastT - 0.001 || t > this.lastT + 1.5) this.seek(t);
    this.lastT = t;
    const tu = t * 1e6;
    let guard = 0;
    while (!this.eof && !(this.out.length && this.out[this.out.length - 1].timestamp > tu)) {
      if (this.err) throw this.err;
      // Only the newest frame at or before t can be shown: close the rest now, or the decoder's
      // frame pool fills up and it stops producing output.
      while (this.out.length > 1 && this.out[1].timestamp <= tu) this.out.shift().close();
      await this._pump();
      if (++guard > 4000) throw new Error('decoder stalled');
    }
    while (this.out.length && this.out[0].timestamp <= tu) { if (this.current) this.current.close(); this.current = this.out.shift(); }
    if (!this.current && this.out.length) { this.current = this.out.shift(); } // t before the first frame
    return this.current ? this._wrap(this.current) : null;
  }

  async _pump() {
    // Keep the decoder's queue short: feed nothing while it is busy, so memory stays flat.
    if (this.decoder.decodeQueueSize > 8) { await new Promise((r) => setTimeout(r, 2)); return; }
    if (!this.pending.length) this.file.start();
    if (!this.pending.length) {
      if (this.decoder.state === 'configured') { try { await this.decoder.flush(); } catch {} }
      this.eof = true; return;
    }
    const s = this.pending.shift();
    this.decoder.decode(new EncodedVideoChunk({ type: s.is_sync ? 'key' : 'delta', timestamp: Math.round(1e6 * s.cts / s.timescale), duration: Math.round(1e6 * s.duration / s.timescale), data: s.data }));
    try { this.file.releaseUsedSamples(this.track.id, s.number); } catch {}
    if (!this.out.length) await new Promise((r) => setTimeout(r, 0));
  }

  // VideoFrame as a drawable; rotated phone footage is turned upright on a canvas.
  _wrap(frame) {
    if (!this.rotation) return frame;
    const sw = frame.displayWidth, sh = frame.displayHeight, swap = this.rotation === 90 || this.rotation === 270;
    const w = swap ? sh : sw, h = swap ? sw : sh;
    if (!this.canvas || this.canvas.width !== w || this.canvas.height !== h) { this.canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); }
    const g = this.canvas.getContext('2d');
    g.save(); g.translate(w / 2, h / 2); g.rotate(this.rotation * Math.PI / 180); g.drawImage(frame, -sw / 2, -sh / 2, sw, sh); g.restore();
    return this.canvas;
  }

  close() {
    try { this.file && this.file.stop(); } catch {}
    this._drain(); if (this.current) { this.current.close(); this.current = null; }
    if (this.decoder && this.decoder.state !== 'closed') { try { this.decoder.close(); } catch {} }
    this.pending.length = 0; this.file = null;
  }
}
