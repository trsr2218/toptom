// The compositor. One function draws any time t of a project to a canvas, from the media elements a
// `sources` object provides. The preview and the export share it, so what you see is what you get.
import { prop, sourceTime, clipEnd } from '../model.js';
import { lookById, scaledFilter, applyLookLayers } from '../looks.js';

let logoImg = null, logoReady = null;
export function loadWatermark() {
  logoReady ??= new Promise((res) => { const i = new Image(); i.onload = () => { logoImg = i; res(i); }; i.onerror = () => res(null); i.src = '/assets/brand/topier-logo-white.svg'; });
  return logoReady;
}
loadWatermark();

const hasFilter = (() => { try { const c = document.createElement('canvas').getContext('2d'); return 'filter' in c; } catch { return false; } })();
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const dur = (tr) => Math.max(0.05, (tr && tr.dur) || 0.5);

/**
 * sources.get(clip) -> drawable (video element, image, or canvas) positioned at the right source time, or null.
 * sources.selected -> clip id to outline (preview only).
 */
export function drawFrame(ctx, project, t, sources, opts = {}) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; if (hasFilter) ctx.filter = 'none';
  ctx.fillStyle = project.bg || '#000'; ctx.fillRect(0, 0, W, H);
  const order = ['video', 'overlay', 'text'];
  for (const kind of order) {
    for (const track of project.tracks.filter((tr) => tr.kind === kind)) {
      if (track.hidden) continue;
      const clips = track.clips;
      for (let i = 0; i < clips.length; i++) {
        const c = clips[i];
        if (t < c.start || t >= clipEnd(c)) continue;
        if (c.type === 'text') drawText(ctx, project, c, t, W, H);
        else if (c.type === 'caption') drawCaptions(ctx, project, c, t, W, H);
        else {
          // transition from the previous clip on this track into this one
          const prev = clips.find((p) => p !== c && Math.abs(clipEnd(p) - c.start) < 0.06 && p.type !== 'text');
          const tin = c.transIn && c.transIn.type !== 'none' && prev ? c.transIn : null;
          const k = tin ? clamp01((t - c.start) / dur(tin)) : 1;
          if (tin && k < 1) {
            drawMedia(ctx, project, prev, clipEnd(prev) - 0.001, sources, W, H, { trans: tin.type, k, role: 'out' });
            drawMedia(ctx, project, c, t, sources, W, H, { trans: tin.type, k, role: 'in' });
          } else drawMedia(ctx, project, c, t, sources, W, H, null);
        }
      }
    }
  }
  if (project.watermark && logoImg && !opts.noWatermark) {
    const lw = W * 0.17, lh = lw * logoImg.naturalHeight / logoImg.naturalWidth;
    ctx.save(); ctx.globalAlpha = 0.75; if (hasFilter) ctx.filter = 'drop-shadow(0 1px 4px rgba(0,0,0,.6))';
    ctx.drawImage(logoImg, W - lw - W * 0.03, H - lh - H * 0.022, lw, lh); ctx.restore();
  }
  if (opts.guides) drawGuides(ctx, W, H);
  if (sources && sources.selected) outline(ctx, project, sources.selected, t, W, H);
  ctx.restore();
}

// Geometry of a media clip on the canvas: x, y, w, h of the drawn rect (before rotation).
export function mediaRect(project, c, t, src, W, H) {
  const sw = src ? (src.videoWidth || src.naturalWidth || src.width || 16) : 16;
  const sh = src ? (src.videoHeight || src.naturalHeight || src.height || 9) : 9;
  const fit = c.fit || 'cover';
  let w, h;
  if (fit === 'fill') { w = W; h = H; }
  else { const r = fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh); w = sw * r; h = sh * r; }
  const s = prop(c, 'scale', t); w *= s; h *= s;
  const x = prop(c, 'x', t) * W - w / 2, y = prop(c, 'y', t) * H - h / 2;
  return { x, y, w, h, sw, sh };
}

function drawMedia(ctx, project, c, t, sources, W, H, tr) {
  const src = sources.get(c, t);
  const r = mediaRect(project, c, t, src, W, H);
  const look = lookById(c.look);
  const amount = c.lookAmount == null ? 1 : c.lookAmount;
  let alpha = prop(c, 'opacity', t);
  ctx.save();
  // transition transforms
  if (tr) {
    const k = tr.k, e = easeOut(k), isIn = tr.role === 'in';
    switch (tr.trans) {
      case 'fade': alpha *= isIn ? clamp01((k - 0.5) * 2) : clamp01(1 - k * 2); break;
      case 'dissolve': alpha *= isIn ? k : 1; break;
      case 'slide-left': ctx.translate(isIn ? (1 - e) * W : -e * W, 0); break;
      case 'slide-up': ctx.translate(0, isIn ? (1 - e) * H : -e * H); break;
      case 'zoom': if (isIn) { alpha *= k; const z = 1.25 - 0.25 * e; ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); } else { const z = 1 + 0.2 * e; ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); } break;
      case 'wipe': if (isIn) { ctx.beginPath(); ctx.rect(0, 0, W * e, H); ctx.clip(); } break;
      case 'blur': if (isIn) { alpha *= k; } break;
      case 'flash': { alpha *= isIn ? clamp01(k * 1.5) : 1; } break;
    }
  }
  ctx.globalAlpha = clamp01(alpha);
  const rot = prop(c, 'rotation', t);
  if (rot) { ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.rotate(rot * Math.PI / 180); ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2)); }
  let f = hasFilter ? scaledFilter(look.filter, amount) : '';
  if (tr && tr.trans === 'blur' && tr.role === 'in' && hasFilter) f += ` blur(${Math.round((1 - easeOut(tr.k)) * 24)}px)`;
  if (hasFilter) ctx.filter = f || 'none';
  if (src) { try { ctx.drawImage(src, r.x, r.y, r.w, r.h); } catch {} }
  else { ctx.fillStyle = '#1a1a22'; ctx.fillRect(r.x, r.y, r.w, r.h); }
  if (hasFilter) ctx.filter = 'none';
  applyLookLayers(ctx, look, amount, Math.max(0, r.x), Math.max(0, r.y), Math.min(W, r.w), Math.min(H, r.h), t);
  ctx.restore();
  if (tr && tr.trans === 'flash' && tr.role === 'in') {
    ctx.save(); ctx.globalAlpha = Math.sin(Math.PI * tr.k) * 0.9; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
}

// ---------- text ----------
export function wrapLines(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
    }
    out.push(line);
  }
  return out;
}

export function textMetrics(ctx, c, W, H) {
  const size = Math.max(8, c.size * H);
  ctx.font = `${c.weight || 400} ${size}px "${c.font || 'Inter'}", Inter, sans-serif`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(c.letter || 0) * size}px`;
  const lines = wrapLines(ctx, c.text || '', W * (c.maxWidth || 0.9));
  const lh = size * (c.line || 1.1);
  const tw = Math.max(...lines.map((l) => ctx.measureText(l).width), 1);
  const pad = (c.bg && c.bg !== 'transparent') ? size * (c.pad == null ? 0.4 : c.pad) : 0;
  const bw = tw + pad * 2, bh = lines.length * lh + pad * 1.2;
  const cx = c.x * W, cy = c.y * H;
  return { size, lines, lh, tw, pad, bw, bh, x: cx - bw / 2, y: cy - bh / 2, cx, cy };
}

function drawText(ctx, project, c, t, W, H) {
  const lt = t - c.start, rem = clipEnd(c) - t;
  const inD = 0.45, outD = 0.3;
  const kin = clamp01(lt / inD), kout = clamp01(rem / outD);
  ctx.save();
  const m = textMetrics(ctx, c, W, H);
  let alpha = prop(c, 'opacity', t) * (c.anim === 'none' ? 1 : kout);
  let sx = 1, sy = 1, dx = 0, dy = 0, visibleChars = Infinity;
  const e = easeOut(kin);
  switch (c.anim) {
    case 'fade': alpha *= kin; break;
    case 'pop': { const over = kin < 1 ? 0.6 + 0.55 * e - 0.15 * Math.sin(kin * Math.PI) : 1; sx = sy = over; alpha *= clamp01(kin * 2); break; }
    case 'slide-up': dy = (1 - e) * m.size * 1.5; alpha *= kin; break;
    case 'slide-left': dx = (1 - e) * W * 0.25; alpha *= kin; break;
    case 'zoom': sx = sy = 1.4 - 0.4 * e; alpha *= kin; break;
    case 'typewriter': visibleChars = Math.floor(clamp01(lt / Math.max(0.4, Math.min(2.5, (c.text || '').length * 0.05))) * (c.text || '').length); break;
    case 'bounce': dy = -Math.abs(Math.sin(kin * Math.PI * 1.5)) * (1 - kin) * m.size; alpha *= clamp01(kin * 3); break;
  }
  const s = prop(c, 'scale', t);
  ctx.globalAlpha = clamp01(alpha);
  ctx.translate(m.cx + dx, m.cy + dy); ctx.rotate((prop(c, 'rotation', t) || 0) * Math.PI / 180); ctx.scale(sx * s, sy * s); ctx.translate(-m.cx, -m.cy);
  if (m.pad) {
    ctx.fillStyle = c.bg; const r = Math.min(m.bh / 2, m.size * (c.radius == null ? 0.5 : c.radius));
    roundRect(ctx, m.x, m.y, m.bw, m.bh, r); ctx.fill();
  }
  ctx.textAlign = c.align || 'center'; ctx.textBaseline = 'middle';
  const ax = c.align === 'left' ? m.x + m.pad : c.align === 'right' ? m.x + m.bw - m.pad : m.cx;
  let shown = 0;
  m.lines.forEach((line, i) => {
    const y = m.y + m.pad * 0.6 + m.lh * (i + 0.5);
    let txt = line;
    if (visibleChars !== Infinity) { const left = visibleChars - shown; txt = line.slice(0, Math.max(0, left)); shown += line.length + 1; }
    if (!txt) return;
    if (c.shadow) { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = m.size * 0.18; ctx.shadowOffsetY = m.size * 0.04; }
    if (c.stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = m.size * 0.12; ctx.strokeStyle = c.stroke; ctx.strokeText(txt, ax, y); }
    ctx.fillStyle = c.color || '#fff'; ctx.fillText(txt, ax, y);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  });
  ctx.restore();
}

// ---------- captions ----------
export function captionPhrases(words, maxWords = 4, maxSpan = 2.4) {
  const out = []; let cur = [];
  for (const w of words) {
    if (cur.length && (cur.length >= maxWords || w.t + w.d - cur[0].t > maxSpan || /[.!?]$/.test(cur[cur.length - 1].w))) { out.push(cur); cur = []; }
    cur.push(w);
  }
  if (cur.length) out.push(cur);
  return out.map((ws) => ({ t: ws[0].t, end: ws[ws.length - 1].t + ws[ws.length - 1].d, words: ws }));
}

function drawCaptions(ctx, project, c, t, W, H) {
  const st = project.captions || {};
  const lt = t - c.start;
  const phrases = c._phrases || (c._phrases = captionPhrases(c.words || []));
  const ph = phrases.find((p) => lt >= p.t - 0.05 && lt < p.end + 0.15);
  if (!ph) return;
  const size = (st.size || 0.055) * H, font = st.font || 'Inter';
  ctx.save();
  ctx.font = `800 ${size}px "${font}", Inter, sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const gap = size * 0.28;
  const widths = ph.words.map((w) => ctx.measureText(w.w).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (ph.words.length - 1);
  const maxW = W * 0.88;
  const scale = Math.min(1, maxW / total);
  const cy = (c.y != null ? c.y : st.position || 0.78) * H;
  const pad = size * 0.45;
  ctx.translate(W / 2, cy); ctx.scale(scale, scale); ctx.translate(-W / 2, -cy);
  const x0 = W / 2 - total / 2;
  const style = st.style || 'bold';
  if (style === 'bold' || style === 'clean') {
    if (style === 'bold') { ctx.fillStyle = st.bg || 'rgba(0,0,0,0.55)'; roundRect(ctx, x0 - pad, cy - size * 0.75, total + pad * 2, size * 1.5, size * 0.3); ctx.fill(); }
    let x = x0;
    ph.words.forEach((w, i) => {
      const active = lt >= w.t && lt < w.t + w.d + 0.05;
      ctx.fillStyle = active ? (st.highlight || '#FF7A1A') : (st.color || '#fff');
      if (style === 'clean') { ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = size * 0.2; ctx.lineWidth = size * 0.14; ctx.lineJoin = 'round'; ctx.strokeStyle = '#000'; ctx.strokeText(w.w, x, cy); }
      ctx.fillText(w.w, x, cy); x += widths[i] + gap;
    });
  } else { // pill per word, active word pops
    let x = x0;
    ph.words.forEach((w, i) => {
      const active = lt >= w.t && lt < w.t + w.d + 0.05;
      ctx.save();
      if (active) { ctx.translate(x + widths[i] / 2, cy); ctx.scale(1.12, 1.12); ctx.translate(-(x + widths[i] / 2), -cy); }
      ctx.fillStyle = active ? (st.highlight || '#FF7A1A') : (st.bg || 'rgba(0,0,0,0.55)');
      roundRect(ctx, x - pad * 0.5, cy - size * 0.7, widths[i] + pad, size * 1.4, size * 0.35); ctx.fill();
      ctx.fillStyle = active ? '#111' : (st.color || '#fff'); ctx.fillText(w.w, x, cy);
      ctx.restore(); x += widths[i] + gap;
    });
  }
  ctx.restore();
}

export function roundRect(c, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

function drawGuides(ctx, W, H) {
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.setLineDash([8, 8]); ctx.lineWidth = 2;
  const ix = W * 0.06, top = H * 0.12, bot = H * 0.2;
  ctx.strokeRect(ix, top, W - ix * 2, H - top - bot);
  ctx.restore();
}

function outline(ctx, project, id, t, W, H) {
  for (const tr of project.tracks) for (const c of tr.clips) {
    if (c.id !== id || t < c.start || t >= clipEnd(c)) continue;
    ctx.save(); ctx.strokeStyle = '#FF7A1A'; ctx.lineWidth = Math.max(2, W * 0.004); ctx.setLineDash([W * 0.012, W * 0.008]);
    if (c.type === 'text') { const m = textMetrics(ctx, c, W, H); ctx.strokeRect(m.x - 6, m.y - 6, m.bw + 12, m.bh + 12); }
    else if (c.type !== 'caption') { const r = mediaRect(project, c, t, null, W, H); ctx.strokeRect(r.x, r.y, r.w, r.h); }
    ctx.restore();
  }
}

// Hit test for the preview: which clip is under (fx, fy) in canvas fractions, topmost first.
export function hitTest(ctx, project, t, fx, fy, W, H) {
  const order = ['text', 'overlay', 'video'];
  for (const kind of order) for (const tr of project.tracks.filter((x) => x.kind === kind)) for (let i = tr.clips.length - 1; i >= 0; i--) {
    const c = tr.clips[i];
    if (t < c.start || t >= clipEnd(c) || c.type === 'caption') continue;
    if (c.type === 'text') { const m = textMetrics(ctx, c, W, H); if (fx * W >= m.x && fx * W <= m.x + m.bw && fy * H >= m.y && fy * H <= m.y + m.bh) return c; }
    else { const r = mediaRect(project, c, t, null, W, H); if (fx * W >= r.x && fx * W <= r.x + r.w && fy * H >= r.y && fy * H <= r.y + r.h) return c; }
  }
  return null;
}
