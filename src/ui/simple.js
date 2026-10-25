// Simple mode: the story as cards. One card per clip on the main track, quick actions, no timeline.
import { trackOf, clipEnd } from '../model.js';
import { lookById } from '../looks.js';

let app;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (t) => { const m = Math.floor(t / 60), s = Math.round(t % 60); return `${m}:${String(s).padStart(2, '0')}`; };

export function mount(a) { app = a; app.on('change', render); app.on('select', render); app.on('mode', render); }

function render() {
  if (app.mode !== 'simple') return;
  const box = $('simpleView'); const tr = trackOf(app.project, 'video');
  const clips = [...tr.clips].sort((x, y) => x.start - y.start);
  const texts = trackOf(app.project, 'text').clips;
  let h = `<div class="row between"><strong>Your story</strong><button class="btn sm primary" data-a="add">+ Add</button></div>`;
  if (!clips.length) h += `<div class="empty">Add a video or photos and they show up here as scenes.</div>`;
  clips.forEach((c, i) => {
    const m = app.getMedia(c.mediaId);
    const txt = texts.filter((t) => t.start < clipEnd(c) && clipEnd(t) > c.start && t.type === 'text').map((t) => t.text).join(' · ');
    h += `<div class="scene ${app.selection === c.id ? 'on' : ''}" data-id="${c.id}">
      ${m && m.thumb ? `<img src="${m.thumb}" alt="" style="filter:${lookFilter(c)}">` : `<div></div>`}
      <div><div class="s-title">${i + 1}. ${esc(c.name)}</div><div class="s-sub">${fmt(c.duration)}${c.look && c.look !== 'none' ? ' · ' + c.look : ''}${txt ? ' · ' + esc(txt.slice(0, 40)) : ''}</div>
        <div class="row" style="margin-top:6px;gap:4px;flex-wrap:wrap">${c.type === 'video' ? `<button class="btn sm ghost" data-best="${c.id}">Best 15 s</button>` : ''}<button class="btn sm ghost" data-text="${c.id}">Text</button><button class="btn sm ghost" data-look="${c.id}">Look</button><button class="btn sm ghost" data-del="${c.id}">Remove</button></div></div>
      <div class="s-acts"><button class="ib" data-up="${c.id}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">▲</button><button class="ib" data-down="${c.id}" ${i === clips.length - 1 ? 'disabled' : ''} aria-label="Move down">▼</button></div></div>`;
  });
  h += `<div class="sec"><div class="row" style="flex-wrap:wrap;gap:6px"><button class="btn sm" data-a="captions">Captions</button><button class="btn sm" data-a="music">Music</button><button class="btn sm" data-a="dissolve">Smooth cuts</button><button class="btn sm primary" data-a="export">Export</button></div></div>`;
  box.innerHTML = h;
  box.querySelectorAll('.scene').forEach((el) => el.onclick = (e) => { if (e.target.closest('button')) return; app.select(el.dataset.id); const f = app.selected(); f && app.seek(f.clip.start); });
  box.querySelectorAll('[data-best]').forEach((b) => b.onclick = () => app.commands.best_moment({ clipId: b.dataset.best, length: 15 }));
  box.querySelectorAll('[data-text]').forEach((b) => b.onclick = () => { const f = clips.find((c) => c.id === b.dataset.text); app.seek(f.start); app.commands.add_text({ preset: 'title' }); });
  box.querySelectorAll('[data-look]').forEach((b) => b.onclick = () => { app.select(b.dataset.look); app.openPanel('looks'); });
  box.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => app.commands.remove_clip({ clipId: b.dataset.del }));
  box.querySelectorAll('[data-up]').forEach((b) => b.onclick = () => app.commands.reorder({ clipId: b.dataset.up, dir: -1 }));
  box.querySelectorAll('[data-down]').forEach((b) => b.onclick = () => app.commands.reorder({ clipId: b.dataset.down, dir: 1 }));
  const a = (n) => box.querySelector(`[data-a=${n}]`);
  a('add').onclick = () => $('fileInput').click();
  a('captions').onclick = () => app.commands.add_captions({});
  a('music').onclick = () => app.openPanel('music');
  a('dissolve').onclick = () => app.commands.set_transitions({ trans: 'dissolve' });
  a('export').onclick = () => app.commands.open_export();
}
function lookFilter(c) { return lookById(c.look).filter || 'none'; }
