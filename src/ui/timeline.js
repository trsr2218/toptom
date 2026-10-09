// Timeline: tracks, clips, trim handles, drag to move with snapping, playhead, zoom.
import { projectDuration, clipEnd, tidyTrack, ripple, trackOf, TRACK_KINDS } from '../model.js';
import { beats } from '../media.js';
import { tc } from '../editor.js';

let app, pps = 40, snaps = [];
const $ = (id) => document.getElementById(id);
const TRACK_ORDER = { text: 0, overlay: 1, video: 2, voice: 3, audio: 4 };

export function mount(a) {
  app = a;
  app.on('change', render); app.on('select', paintSel); app.on('time', movePlayhead); app.on('mode', render);
  const ruler = $('ruler'), scroll = $('tlScroll');
  scroll.addEventListener('scroll', () => { ruler.style.setProperty('--sx', `${-scroll.scrollLeft}px`); ruler.scrollLeft = scroll.scrollLeft; drawRuler(); });
  const scrub = (e) => { const r = $('tlTracks').getBoundingClientRect(); app.seek(Math.max(0, (e.clientX - r.left) / pps)); };
  ruler.addEventListener('pointerdown', (e) => { ruler.setPointerCapture(e.pointerId); scrub(e); const mv = (ev) => scrub(ev); ruler.addEventListener('pointermove', mv); ruler.addEventListener('pointerup', () => ruler.removeEventListener('pointermove', mv), { once: true }); });
  $('tlTracks').addEventListener('pointerdown', (e) => { if (e.target.closest('.clip')) return; app.select(null); scrub(e); });
  scroll.addEventListener('wheel', (e) => { if (e.ctrlKey) { e.preventDefault(); zoom(e.deltaY < 0 ? 1.15 : 0.87); } }, { passive: false });
  $('addTrack').onclick = () => { app.set('Add track', (p) => { p.tracks.splice(1, 0, { id: Math.random().toString(36).slice(2), kind: 'overlay', name: 'Overlay ' + (p.tracks.filter((t) => t.kind === 'overlay').length + 1), clips: [] }); }); };
  new ResizeObserver(() => drawRuler()).observe(scroll);
  app.timeline = { fit, zoom };
  setTimeout(fit, 100);
}

export function fit() { const d = Math.max(5, projectDuration(app.project)); const w = $('tlScroll').clientWidth - 40; pps = Math.max(8, Math.min(300, w / d)); render(); }
export function zoom(f) { pps = Math.max(4, Math.min(600, pps * f)); render(); }

function visibleTracks() {
  const p = app.project;
  const ts = [...p.tracks].sort((a, b) => (TRACK_ORDER[a.kind] ?? 9) - (TRACK_ORDER[b.kind] ?? 9));
  if (app.mode === 'pro') return ts;
  return ts.filter((t) => t.clips.length || ['text', 'video', 'audio'].includes(t.kind));
}

function render() {
  const p = app.project, tracks = visibleTracks();
  const d = Math.max(projectDuration(p) + 10, 20), width = d * pps;
  const labels = $('tlLabels'), tl = $('tlTracks');
  labels.innerHTML = ''; tl.querySelectorAll('.tl-track').forEach((x) => x.remove());
  tl.style.width = `${width}px`; tl.style.height = `${tracks.length * 46}px`;
  snaps = [0];
  for (const t of tracks) {
    const lab = document.createElement('div'); lab.className = 'tl-label';
    lab.innerHTML = `<span class="name">${t.name || TRACK_KINDS[t.kind].name}</span>
      ${t.kind !== 'text' ? `<button class="ib ${t.muted ? 'on' : ''}" data-a="mute" title="Mute">${t.muted ? '🔇' : '🔊'}</button>` : ''}
      ${t.kind === 'audio' ? `<button class="ib ${t.duck ? 'on' : ''}" data-a="duck" title="Dip under speech">▾</button>` : ''}
      <button class="ib ${t.hidden ? 'on' : ''}" data-a="hide" title="Hide">${t.hidden ? '◌' : '◉'}</button>`;
    lab.querySelectorAll('button').forEach((b) => b.onclick = () => app.set('Track', () => { if (b.dataset.a === 'mute') t.muted = !t.muted; if (b.dataset.a === 'duck') t.duck = !t.duck; if (b.dataset.a === 'hide') t.hidden = !t.hidden; }));
    labels.appendChild(lab);
    const row = document.createElement('div'); row.className = 'tl-track'; row.dataset.track = t.id; row.style.backgroundSize = `${pps}px 100%`;
    tl.appendChild(row);
    for (const c of t.clips) { row.appendChild(clipEl(c, t)); snaps.push(c.start, clipEnd(c)); }
  }
  // beat markers from the music track
  const mu = trackOf(p, 'audio');
  if (mu && mu.clips[0]) { const m = app.getMedia(mu.clips[0].mediaId); if (m && m.peaks) { const c = mu.clips[0]; for (const b of beats(m.peaks)) { const t = c.start + (b - c.in) / c.speed; if (t < c.start || t > clipEnd(c)) continue; const el = document.createElement('div'); el.className = 'beat'; el.style.left = `${t * pps}px`; tl.appendChild(el); snaps.push(t); } } }
  drawRuler(); movePlayhead(app.time); paintSel(app.selection);
}

function clipEl(c, t) {
  const el = document.createElement('div');
  el.className = `clip ${c.type}`; el.dataset.id = c.id;
  el.style.left = `${c.start * pps}px`; el.style.width = `${Math.max(6, c.duration * pps)}px`;
  const m = c.mediaId ? app.getMedia(c.mediaId) : null;
  let inner = '';
  if ((c.type === 'video' || c.type === 'image') && m && m.thumb) inner += `<div class="thumbs" style="background-image:url(${m.thumb})"></div>`;
  if ((c.type === 'audio' || c.type === 'video') && m && m.peaks) inner += `<canvas class="wave"></canvas>`;
  if (c.transIn && c.transIn.type !== 'none') inner += `<div class="tr"></div>`;
  inner += `<span class="lbl">${c.type === 'text' ? 'T ' : c.type === 'caption' ? 'CC ' : ''}${esc(c.name || c.text || '')}</span><div class="h l"></div><div class="h r"></div>`;
  if (c.kf) for (const k of Object.values(c.kf)) for (const kf of k) inner += `<i class="kfm" style="left:${kf.t * pps - 3}px"></i>`;
  el.innerHTML = inner;
  const wave = el.querySelector('.wave');
  if (wave) requestAnimationFrame(() => drawWave(wave, m.peaks, c));
  el.addEventListener('pointerdown', (e) => startDrag(e, c, t, el));
  el.addEventListener('dblclick', () => { app.select(c.id); app.seek(c.start); });
  return el;
}

function drawWave(cv, peaks, c) {
  const w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
  cv.width = w; cv.height = h; const g = cv.getContext('2d');
  g.fillStyle = c.type === 'audio' ? 'rgba(160,120,255,0.55)' : 'rgba(255,255,255,0.35)';
  const per = c.speed * 20 / pps; // peaks per pixel
  for (let x = 0; x < w; x++) { const i = Math.floor(c.in * 20 + x * per); const v = peaks[i] || 0; const bh = Math.max(1, v * h * 0.9); g.fillRect(x, (h - bh) / 2, 1, bh); }
}

function drawRuler() {
  const r = $('ruler'), sx = $('tlScroll').scrollLeft, w = r.clientWidth;
  r.innerHTML = '';
  const step = pps > 120 ? 0.5 : pps > 60 ? 1 : pps > 25 ? 2 : pps > 12 ? 5 : 10;
  const t0 = Math.floor(sx / pps / step) * step, t1 = (sx + w) / pps;
  for (let t = t0; t <= t1; t += step) { const d = document.createElement('div'); d.className = 'tick'; d.style.left = `${t * pps - sx}px`; d.textContent = tc(t).replace(/\.0$/, ''); r.appendChild(d); }
}

function movePlayhead(t) {
  $('playhead').style.left = `${t * pps}px`;
  const s = $('tlScroll'), x = t * pps - s.scrollLeft;
  if (app.player.playing && (x > s.clientWidth - 60 || x < 0)) s.scrollLeft = Math.max(0, t * pps - 60);
}
function paintSel(id) { document.querySelectorAll('.clip').forEach((el) => el.classList.toggle('sel', el.dataset.id === id)); }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- drag: move or trim ----------
function startDrag(e, c, track, el) {
  if (e.button && e.button !== 0) return;
  e.stopPropagation();
  app.select(c.id);
  const mode = e.target.classList.contains('h') ? (e.target.classList.contains('l') ? 'trimL' : 'trimR') : 'move';
  const x0 = e.clientX, start0 = c.start, dur0 = c.duration, in0 = c.in;
  const m = c.mediaId ? app.getMedia(c.mediaId) : null;
  const maxSrc = (c.type === 'video' || c.type === 'audio') && m && m.duration ? m.duration : Infinity;
  let moved = false, targetTrack = track;
  const line = document.createElement('div'); line.className = 'snapline'; line.hidden = true; $('tlTracks').appendChild(line);
  el.setPointerCapture(e.pointerId);
  const snap = (t, except) => { if (!app.snapOn && app.snapOn !== undefined) return t; const tol = 8 / pps; let best = t, bd = tol; for (const s of [...snaps, app.time]) { if (except && Math.abs(s - except) < 1e-6) continue; const d = Math.abs(s - t); if (d < bd) { bd = d; best = s; } } line.hidden = best === t; line.style.left = `${best * pps}px`; return best; };
  const onMove = (ev) => {
    const dx = (ev.clientX - x0) / pps;
    if (Math.abs(ev.clientX - x0) > 3) moved = true;
    if (!moved) return;
    if (mode === 'move') {
      let ns = Math.max(0, start0 + dx); ns = snap(ns); if (Math.abs(ns - (start0 + dx)) > 7 / pps) { const e2 = snap(start0 + dx + dur0) - dur0; if (e2 >= 0 && Math.abs(e2 - (start0 + dx)) < 7 / pps) ns = e2; }
      c.start = ns;
      // track change (overlay <-> video, voice <-> audio)
      const rowEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.tl-track');
      if (rowEl) { const tr = app.project.tracks.find((t) => t.id === rowEl.dataset.track); if (tr && tr !== targetTrack && (TRACK_KINDS[tr.kind].accepts.includes(c.type))) { document.querySelectorAll('.tl-track').forEach((r) => r.classList.remove('over')); rowEl.classList.add('over'); targetTrack = tr; } }
      el.style.left = `${c.start * pps}px`;
    } else if (mode === 'trimL') {
      let ns = Math.max(0, Math.min(start0 + dur0 - 0.2, start0 + dx)); ns = snap(ns, start0);
      const delta = ns - start0; const nin = in0 + delta * c.speed; if (nin < 0) return;
      c.start = ns; c.duration = dur0 - delta; c.in = nin;
      el.style.left = `${c.start * pps}px`; el.style.width = `${c.duration * pps}px`;
    } else {
      let ne = Math.max(start0 + 0.2, start0 + dur0 + dx); ne = snap(ne, start0 + dur0);
      let nd = ne - start0; if (maxSrc !== Infinity) nd = Math.min(nd, (maxSrc - c.in) / c.speed);
      c.duration = nd; el.style.width = `${c.duration * pps}px`;
    }
    app.player.draw();
  };
  const onUp = () => {
    el.removeEventListener('pointermove', onMove); line.remove(); document.querySelectorAll('.tl-track').forEach((r) => r.classList.remove('over'));
    if (!moved) return;
    const final = { start: c.start, duration: c.duration, in: c.in };
    c.start = start0; c.duration = dur0; c.in = in0;
    app.set(mode === 'move' ? 'Move' : 'Trim', (p) => {
      Object.assign(c, final);
      if (targetTrack !== track) { track.clips.splice(track.clips.indexOf(c), 1); targetTrack.clips.push(c); }
      tidyTrack(targetTrack); if (track !== targetTrack) tidyTrack(track);
      if (track.kind === 'video' && mode !== 'move') ripple(track);
      if (c.words && mode === 'trimL') { const cut = final.in - in0; c.words = c.words.filter((w) => w.t >= cut).map((w) => ({ ...w, t: w.t - cut })); }
    });
    app.seek(c.start);
  };
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp, { once: true });
  el.addEventListener('pointercancel', onUp, { once: true });
}
