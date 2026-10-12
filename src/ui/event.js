// Whole-event mode (Studio): one long recording in, a branded clip for every part of the event out.
// The recording is cut into equal parts, the loudest stretch of each part becomes its own project,
// and all of them can be exported in one run.
import { newProject, newMediaClip, newTextClip, trackOf } from '../model.js';
import { projects } from '../store.js';
import { loudestWindows } from '../media.js';
import { TEXT_PRESETS, EXPORTS } from '../presets.js';
import { exportProject } from '../engine/export.js';
import { has, openPlans } from '../plan.js';
import * as auth from '../auth.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (t) => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; };
const chips = (name, list, on) => list.map((n) => `<button type="button" class="chip ${n === on ? 'on' : ''}" data-${name}="${n}">${n}</button>`).join('');

export function open(app) {
  if (!has('studio')) {
    const s = app.sheet(`<h3>Whole-event mode</h3><p class="muted">Drop in the full recording of a show, a service or a conference, and get a branded clip for every part of it in one run. It comes with Studio.</p><div class="row" style="margin-top:10px"><button class="btn primary" id="evUp">See Studio</button></div>`);
    s.querySelector('#evUp').onclick = () => { app.closeSheet(); openPlans('studio'); };
    return;
  }
  const vids = [...app.media.values()].filter((m) => m.kind === 'video' && m.peaks && m.duration >= 60).sort((a, b) => b.duration - a.duration);
  if (!vids.length) {
    const s = app.sheet(`<h3>Whole-event mode</h3><p class="muted">Add the full recording first: one video of a minute or more, with sound. Then come back here.</p><div class="row" style="margin-top:10px"><button class="btn primary" id="evAdd">Upload the recording</button></div>`);
    s.querySelector('#evAdd').onclick = () => { app.closeSheet(); app.commands.open_upload(); };
    return;
  }
  const b = app.brand;
  const guess = (m) => [3, 5, 8, 12].reduce((best, n) => (Math.abs(n - m.duration / 300) < Math.abs(best - m.duration / 300) ? n : best), 3);
  let count = guess(vids[0]), len = 30;
  const s = app.sheet(`<h3>Whole-event mode</h3><p class="muted">Topier listens to the whole recording, splits it into parts, and cuts the loudest stretch of each part into its own clip.</p>
    <label class="f">Recording<select id="evSrc">${vids.map((m) => `<option value="${m.id}">${esc(m.name)}, ${fmt(m.duration)}</option>`).join('')}</select></label>
    <div class="sec"><h4>How many clips</h4><div class="row" id="evCount">${chips('n', [3, 5, 8, 12], count)}</div></div>
    <div class="sec"><h4>Seconds each</h4><div class="row" id="evLen">${chips('l', [15, 30, 60], len)}</div></div>
    <label class="row" style="margin:10px 0;font-size:13px"><input type="checkbox" id="evBrand" ${b ? 'checked' : 'disabled'}> ${b ? `Brand every clip with ${esc(b.name || b.handle || 'my brand kit')}` : 'Set up a brand kit to brand every clip'}</label>
    <div class="row"><button class="btn primary" id="evGo">Make the clips</button></div>`);
  const pick = (box, key, set) => s.querySelectorAll(`#${box} .chip`).forEach((c) => c.onclick = () => { set(+c.dataset[key]); s.querySelectorAll(`#${box} .chip`).forEach((x) => x.classList.toggle('on', x === c)); });
  pick('evCount', 'n', (v) => { count = v; }); pick('evLen', 'l', (v) => { len = v; });
  s.querySelector('#evSrc').onchange = (e) => { count = guess(app.getMedia(e.target.value)); s.querySelectorAll('#evCount .chip').forEach((x) => x.classList.toggle('on', +x.dataset.n === count)); };
  s.querySelector('#evGo').onclick = async () => {
    const m = app.getMedia(s.querySelector('#evSrc').value);
    const made = await build(app, m, count, len, s.querySelector('#evBrand').checked ? b : null);
    results(app, m, made);
  };
}

// One window per part of the recording: the loudest stretch inside each equal slice.
export function eventWindows(peaks, duration, count, len) {
  const part = duration / count, out = [];
  for (let i = 0; i < count; i++) {
    const a = Math.floor(i * part * 20), z = Math.floor((i + 1) * part * 20);
    const win = loudestWindows(peaks.slice(a, z), Math.min(len, part), 1)[0];
    if (win) out.push({ start: a / 20 + win.start, duration: Math.min(len, part) });
  }
  return out;
}

async function build(app, m, count, len, brand) {
  const wins = eventWindows(m.peaks, m.duration, count, len), made = [];
  const preset = (id) => TEXT_PRESETS.find((t) => t.id === id);
  for (const [i, w] of wins.entries()) {
    const p = newProject({ name: `${m.name}, part ${i + 1}`, mode: app.project.mode });
    p.w = app.project.w; p.h = app.project.h; p.watermark = false;
    const c = newMediaClip(m, 0); c.in = w.start; c.duration = w.duration;
    trackOf(p, 'video').clips.push(c);
    if (brand) {
      p.brandKitId = brand.id;
      const text = trackOf(p, 'text');
      if (brand.name) { const t = newTextClip(preset('title'), 0, brand.name.toUpperCase()); t.duration = Math.min(3, w.duration); t.y = 0.2; if (brand.font) t.font = brand.font; text.clips.push(t); }
      if (brand.handle) { const h = newTextClip(preset('handle'), 0, brand.handle); h.duration = w.duration; h.y = 0.9; if (brand.color) h.bg = brand.color; text.clips.push(h); }
      const logo = brand.logoId && app.getMedia(brand.logoId);
      if (logo) { const l = newMediaClip(logo, 0); l.duration = w.duration; l.fit = 'contain'; l.scale = 0.22; l.x = 0.86; l.y = 0.08; l.name = 'Logo'; trackOf(p, 'overlay').clips.push(l); }
    }
    await projects.put(p); auth.pushProject(p);
    made.push({ project: p, at: w.start });
  }
  return made;
}

function results(app, m, made) {
  const s = app.sheet(`<h3>${made.length} clips from ${esc(m.name)}</h3><p class="muted">Each one is its own project, so you can open and fine-tune it. Or export them all now.</p>
    <div class="list" id="evList">${made.map((x, i) => `<div class="row between ev-row" data-i="${i}"><span><strong>Part ${i + 1}</strong> <span class="muted">from ${fmt(x.at)}</span></span><span class="row"><a class="btn sm ghost" href="/editor?id=${x.project.id}">Open</a><a class="btn sm primary" data-dl hidden>Download</a></span></div>`).join('')}</div>
    <div id="evProg" hidden><div class="bar"><i id="evBar"></i></div><div class="row between"><span id="evMsg" class="muted">Starting...</span><button class="btn sm ghost" id="evCancel">Cancel</button></div></div>
    <div class="row" id="evActs" style="margin-top:10px"><button class="btn primary" id="evAll">Export all ${made.length}</button><a class="btn ghost" href="/">All projects</a></div>`);
  s.querySelector('#evAll').onclick = async () => {
    const ac = new AbortController(); app._sheetAbort = ac; app._exporting = true;
    s.querySelector('#evProg').hidden = false; s.querySelector('#evActs').hidden = true;
    s.querySelector('#evCancel').onclick = () => ac.abort();
    app.player.pause();
    const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let done = 0;
    try {
      for (const [i, x] of made.entries()) {
        const p = x.project;
        const preset = EXPORTS.find((e) => e.w === p.w && e.h === p.h) || { id: 'event', w: p.w, h: p.h, fps: 30, kbps: 8000 };
        const blob = await exportProject(p, preset, {
          getMedia: (id) => app.getMedia(id), signal: ac.signal,
          onProgress: ({ pct }) => { const bar = s.querySelector('#evBar'), msg = s.querySelector('#evMsg'); if (!bar) return; bar.style.width = `${Math.round(((i + (pct || 0)) / made.length) * 100)}%`; msg.textContent = `Clip ${i + 1} of ${made.length}, ${Math.round((pct || 0) * 100)}%`; },
        });
        const a = s.querySelector(`.ev-row[data-i="${i}"] [data-dl]`); if (!a) break;
        a.href = URL.createObjectURL(blob); a.download = `${slug(p.name)}.${blob.type.includes('webm') ? 'webm' : 'mp4'}`; a.hidden = false; done++;
      }
      s.querySelector('#evProg').hidden = true; app.toast(`${done} clips ready. Tap Download on each.`);
    } catch (e) {
      if (e.message === 'cancelled') { const pr = s.querySelector('#evProg'); if (pr) { pr.hidden = true; s.querySelector('#evActs').hidden = false; } }
      else { console.error(e); const msg = s.querySelector('#evMsg'); if (msg) { msg.textContent = 'Export failed: ' + (e.message || 'try again'); msg.style.color = 'var(--bad)'; } }
    } finally { app._exporting = false; app._sheetAbort = null; }
  };
}
