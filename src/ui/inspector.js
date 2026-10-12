// Inspector: properties of the selected clip, or the project when nothing is selected.
import { findClip, SIZES, clipEnd, trackOf, tidyTrack, ripple } from '../model.js';
import { LOOKS } from '../looks.js';
import { FONTS, ANIMS, TRANSITIONS, ensureFont } from '../presets.js';

let app;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function mount(a) { app = a; app.on('select', render); app.on('change', render); app.on('mode', render); }

function render() {
  const box = $('inspectorBody');
  const f = app.selected();
  if (!f) { box.innerHTML = projectForm(); wireProject(box); return; }
  const { clip: c, track } = f;
  const pro = app.mode === 'pro';
  let h = `<div class="p-title"><span>${c.type === 'text' ? 'Text' : c.type === 'caption' ? 'Captions' : c.type === 'audio' ? 'Sound' : c.type === 'image' ? 'Photo' : 'Video'}</span><button class="ib" data-a="close" aria-label="Close">×</button></div>`;
  if (c.type === 'text') h += textForm(c, pro);
  else if (c.type === 'caption') h += captionForm(c);
  else h += mediaForm(c, track, pro);
  h += `<div class="sec"><h4>Timing</h4><div class="f-row">${num('start', 'Start', c.start, 0.1)}${num('duration', 'Length', c.duration, 0.1)}</div></div>
    <div class="row" style="margin-top:8px"><button class="btn sm" data-a="dup">Duplicate</button><button class="btn sm ghost" data-a="del">Delete</button></div>`;
  box.innerHTML = h;
  wire(box, c, track);
}

const num = (k, label, v, step = 0.01, min = 0, max = 9999) => `<label class="f">${label}<input type="number" data-k="${k}" value="${(+v).toFixed(2)}" step="${step}" min="${min}" max="${max}"></label>`;
const range = (k, label, v, min, max, step, fmt = (x) => x, kf = false) => `<label class="f">${label}<span class="val" data-val="${k}">${fmt(v)}</span>${kf ? `<button class="kf" data-kf="${k}" title="Keyframe">◆</button>` : ''}<input type="range" data-k="${k}" value="${v}" min="${min}" max="${max}" step="${step}"></label>`;
const sel = (k, label, v, opts) => `<label class="f">${label}<select data-k="${k}">${opts.map((o) => `<option value="${o.id}" ${o.id === v ? 'selected' : ''}>${o.name}</option>`).join('')}</select></label>`;
const color = (k, label, v) => `<label class="f">${label}<input type="color" data-k="${k}" value="${/^#/.test(v) ? v : '#ffffff'}"></label>`;
const check = (k, label, v) => `<label class="f-check"><input type="checkbox" data-k="${k}" ${v ? 'checked' : ''}> ${label}</label>`;
const pct = (x) => `${Math.round(x * 100)}%`;

function mediaForm(c, track, pro) {
  const isA = c.type === 'audio';
  let h = '';
  if (!isA) {
    h += `<div class="sec"><h4>Look</h4>${sel('look', 'Look', c.look || 'none', LOOKS)}${range('lookAmount', 'Strength', c.lookAmount ?? 1, 0, 1, 0.05, pct)}</div>`;
    h += `<div class="sec"><h4>Layout</h4>${sel('fit', 'Fit', c.fit, [{ id: 'cover', name: 'Fill the frame' }, { id: 'contain', name: 'Fit inside' }, { id: 'fill', name: 'Stretch' }])}
      ${range('scale', 'Scale', c.scale, 0.1, 4, 0.01, (x) => x.toFixed(2), pro)}
      <div class="f-row">${range('x', 'Left to right', c.x, -0.5, 1.5, 0.005, pct, pro)}${range('y', 'Top to bottom', c.y, -0.5, 1.5, 0.005, pct, pro)}</div>
      ${range('rotation', 'Rotate', c.rotation || 0, -180, 180, 1, (x) => `${Math.round(x)}°`, pro)}${range('opacity', 'Opacity', c.opacity, 0, 1, 0.01, pct, pro)}</div>`;
    h += `<div class="sec"><h4>Transition in</h4>${sel('transIn.type', 'Type', c.transIn?.type || 'none', TRANSITIONS)}${range('transIn.dur', 'Length', c.transIn?.dur || 0.5, 0.2, 2, 0.1, (x) => `${(+x).toFixed(1)} s`)}</div>`;
  }
  if (c.type !== 'image') {
    h += `<div class="sec"><h4>Sound and speed</h4>${range('volume', 'Volume', c.volume, 0, 2, 0.01, pct, pro)}${check('muted', 'Mute', c.muted)}
      ${range('speed', 'Speed', c.speed, 0.25, 4, 0.05, (x) => `${(+x).toFixed(2)}x`)}
      ${isA ? `<div class="f-row">${num('fadeIn', 'Fade in', c.fadeIn || 0, 0.1, 0, 10)}${num('fadeOut', 'Fade out', c.fadeOut || 0, 0.1, 0, 10)}</div>` : ''}
      ${isA ? '' : `<button class="btn sm" data-a="best">Cut to the loudest 30 s</button>`}</div>`;
  }
  return h;
}

function textForm(c, pro) {
  return `<label class="f">Text<textarea data-k="text" rows="2">${esc(c.text)}</textarea></label>
    <div class="f-row">${sel('font', 'Font', c.font, FONTS)}${sel('weight', 'Weight', String(c.weight), [{ id: '400', name: 'Regular' }, { id: '600', name: 'Semibold' }, { id: '800', name: 'Bold' }, { id: '900', name: 'Black' }])}</div>
    ${range('size', 'Size', c.size, 0.02, 0.3, 0.005, pct, pro)}
    <div class="f-row">${color('color', 'Colour', c.color)}<label class="f">Background<div class="row"><input type="color" data-k="bg" value="${/^#/.test(c.bg) ? c.bg : '#000000'}" style="width:60px"><button class="btn sm ghost" data-a="nobg">${c.bg === 'transparent' ? 'None' : 'Clear'}</button></div></label></div>
    <div class="f-row">${sel('align', 'Align', c.align, [{ id: 'left', name: 'Left' }, { id: 'center', name: 'Centre' }, { id: 'right', name: 'Right' }])}${sel('anim', 'Animation', c.anim, ANIMS)}</div>
    <div class="f-row">${range('letter', 'Spacing', c.letter || 0, -0.05, 0.3, 0.005, (x) => (+x).toFixed(2))}${range('line', 'Line height', c.line || 1.1, 0.8, 2, 0.05, (x) => (+x).toFixed(2))}</div>
    <div class="f-row">${check('shadow', 'Shadow', c.shadow)}<label class="f">Outline<div class="row"><input type="color" data-k="stroke" value="${/^#/.test(c.stroke) ? c.stroke : '#000000'}" style="width:60px"><button class="btn sm ghost" data-a="nostroke">${c.stroke ? 'Clear' : 'None'}</button></div></label></div>
    <div class="sec"><h4>Position</h4><div class="f-row">${range('x', 'Left to right', c.x, 0, 1, 0.005, pct, pro)}${range('y', 'Top to bottom', c.y, 0, 1, 0.005, pct, pro)}</div>${range('maxWidth', 'Max width', c.maxWidth || 0.9, 0.3, 1, 0.01, pct)}${range('rotation', 'Rotate', c.rotation || 0, -45, 45, 1, (x) => `${Math.round(x)}°`, pro)}${range('scale', 'Scale', c.scale, 0.3, 3, 0.01, (x) => (+x).toFixed(2), pro)}${range('opacity', 'Opacity', c.opacity, 0, 1, 0.01, pct, pro)}</div>`;
}

function captionForm(c) {
  const st = app.project.captions;
  const text = (c.words || []).map((w) => w.w).join(' ');
  return `<label class="f">Words (edit, keep the order)<textarea data-k="_captext" rows="4">${esc(text)}</textarea></label>
    <p class="muted" style="font-size:12px;margin:-4px 0 10px">Timing stays with each word. Add or remove words and the gaps spread evenly.</p>
    <div class="sec"><h4>Style, all captions</h4>${sel('cap.style', 'Style', st.style, [{ id: 'bold', name: 'Bold box' }, { id: 'clean', name: 'Clean outline' }, { id: 'pill', name: 'Word pills' }])}
    ${sel('cap.font', 'Font', st.font, FONTS)}${range('cap.size', 'Size', st.size, 0.03, 0.12, 0.002, pct)}
    <div class="f-row">${color('cap.color', 'Colour', st.color)}${color('cap.highlight', 'Active word', st.highlight)}</div>
    ${range('y', 'Position', c.y ?? st.position, 0.1, 0.95, 0.005, pct)}</div>`;
}

function projectForm() {
  const p = app.project;
  return `<div class="p-title"><span>Project</span></div>
    <label class="f">Name<input data-k="name" value="${esc(p.name)}"></label>
    ${sel('size', 'Canvas', Object.values(SIZES).find((s) => s.w === p.w && s.h === p.h)?.id || 'custom', [...Object.values(SIZES).map((s) => ({ id: s.id, name: `${s.name} (${s.label})` })), { id: 'custom', name: 'Custom' }])}
    <div class="f-row">${color('bg', 'Background', p.bg)}${sel('fps', 'Frame rate', String(p.fps), [{ id: '24', name: '24' }, { id: '30', name: '30' }, { id: '60', name: '60' }])}</div>
    ${check('watermark', 'Topier mark on export', p.watermark)}
    <p class="muted" style="font-size:12px">The mark comes off on paid plans. Everything else is free.</p>
    <div class="sec"><h4>Shortcuts</h4><p class="muted" style="font-size:12px;line-height:1.8"><kbd>Space</kbd> play · <kbd>S</kbd> split · <kbd>T</kbd> text · <kbd>Del</kbd> delete · <kbd>Ctrl Z</kbd> undo · <kbd>Ctrl D</kbd> duplicate · <kbd>←</kbd><kbd>→</kbd> frame · <kbd>+</kbd><kbd>-</kbd> zoom · <kbd>Ctrl E</kbd> export</p></div>
    <div class="empty">Select a clip on the timeline or the preview to edit it.</div>`;
}

function wireProject(box) {
  box.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('change', () => {
    const k = el.dataset.k, v = el.type === 'checkbox' ? el.checked : el.value;
    if (k === 'size') { if (v !== 'custom') app.commands.resize({ size: v }); return; }
    app.set('Project', (p) => { if (k === 'fps') p.fps = +v; else p[k] = v; });
    if (k === 'name') { $('projName').value = v; document.title = `${v} · Topier`; }
  }));
}

function setPath(obj, path, v) { const ks = path.split('.'); let o = obj; for (let i = 0; i < ks.length - 1; i++) { o[ks[i]] ??= {}; o = o[ks[i]]; } o[ks[ks.length - 1]] = v; }

function wire(box, c, track) {
  const numeric = new Set(['size', 'scale', 'x', 'y', 'rotation', 'opacity', 'volume', 'speed', 'lookAmount', 'letter', 'line', 'maxWidth', 'start', 'duration', 'fadeIn', 'fadeOut', 'transIn.dur', 'weight', 'cap.size']);
  const commit = (el, live) => {
    const k = el.dataset.k; let v = el.type === 'checkbox' ? el.checked : el.value;
    if (numeric.has(k)) v = +v;
    const label = el.closest('.f'); const valEl = label && label.querySelector(`[data-val="${k}"]`);
    if (valEl && el.type === 'range') valEl.textContent = fmtVal(k, v);
    app.set('Edit', (p) => {
      if (k === 'font') ensureFont(v);
      if (k === '_captext') { const ws = String(v).split(/\s+/).filter(Boolean); const old = c.words || []; const total = c.duration; c.words = ws.map((w, i) => old[i] && ws.length === old.length ? { ...old[i], w } : { w, t: (i / ws.length) * total, d: (total / ws.length) * 0.9 }); c.text = ws.join(' '); c.name = 'Captions'; return; }
      if (k.startsWith('cap.')) { p.captions[k.slice(4)] = v; return; }
      if (k === 'speed') { const srcLen = c.duration * c.speed; c.speed = v; c.duration = srcLen / v; track.kind === 'video' ? ripple(track) : tidyTrack(track); return; }
      if (k === 'start' || k === 'duration') { c[k] = Math.max(k === 'duration' ? 0.2 : 0, v); track.kind === 'video' && k === 'duration' ? ripple(track) : tidyTrack(track); return; }
      if (k === 'text') { c.text = v; c.name = v.slice(0, 40); return; }
      // keyframed property: edit the keyframe at the playhead if one exists
      const kfs = c.kf && c.kf[k];
      if (kfs && kfs.length) { const lt = app.time - c.start; const hit = kfs.find((x) => Math.abs(x.t - lt) < 0.08); if (hit) hit.v = v; else { kfs.push({ t: lt, v }); kfs.sort((a, b) => a.t - b.t); } }
      setPath(c, k, v);
    }, { merge: live ? 'insp-' + c.id + k : null, silent: live });
    if (live) app.player.draw();
  };
  box.querySelectorAll('[data-k]').forEach((el) => {
    if (el.type === 'range' || el.type === 'color') el.addEventListener('input', () => commit(el, true));
    el.addEventListener('change', () => commit(el, false));
    if (el.tagName === 'TEXTAREA') el.addEventListener('input', () => commit(el, true));
  });
  box.querySelectorAll('[data-kf]').forEach((b) => {
    const k = b.dataset.kf; const lt = app.time - c.start;
    const has = c.kf && c.kf[k] && c.kf[k].some((x) => Math.abs(x.t - lt) < 0.08);
    b.classList.toggle('on', !!has);
    b.onclick = () => app.set('Keyframe', () => {
      c.kf ??= {}; c.kf[k] ??= [];
      const i = c.kf[k].findIndex((x) => Math.abs(x.t - lt) < 0.08);
      if (i >= 0) c.kf[k].splice(i, 1); else { c.kf[k].push({ t: Math.max(0, lt), v: +c[k] }); c.kf[k].sort((a, b) => a.t - b.t); }
      if (!c.kf[k].length) delete c.kf[k];
    });
  });
  box.querySelector('[data-a=close]').onclick = () => { app.select(null); $('inspector').classList.remove('open'); };
  box.querySelector('[data-a=del]').onclick = () => app.commands.remove_clip({ clipId: c.id });
  box.querySelector('[data-a=dup]').onclick = () => app.set('Duplicate', () => { const d = JSON.parse(JSON.stringify(c)); d.id = Math.random().toString(36).slice(2); d.start = clipEnd(c); track.clips.push(d); tidyTrack(track); app.select(d.id); });
  const best = box.querySelector('[data-a=best]'); if (best) best.onclick = () => app.commands.best_moment({ clipId: c.id, length: 30 });
  const nobg = box.querySelector('[data-a=nobg]'); if (nobg) nobg.onclick = () => app.set('Background', () => { c.bg = c.bg === 'transparent' ? '#000000' : 'transparent'; });
  const nostroke = box.querySelector('[data-a=nostroke]'); if (nostroke) nostroke.onclick = () => app.set('Outline', () => { c.stroke = c.stroke ? '' : '#000000'; });
}

function fmtVal(k, v) {
  if (['scale', 'letter', 'line'].includes(k)) return (+v).toFixed(2);
  if (k === 'rotation') return `${Math.round(v)}°`;
  if (k === 'speed') return `${(+v).toFixed(2)}x`;
  if (k === 'transIn.dur') return `${(+v).toFixed(1)} s`;
  return `${Math.round(v * 100)}%`;
}
