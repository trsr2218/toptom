// Left panel: Media, Text, Captions, Looks, Music, Brand, Project.
import { TEXT_PRESETS, FONTS, MUSIC, ensureFont } from '../presets.js';
import { LOOKS } from '../looks.js';
import { SIZES, trackOf, projectDuration } from '../model.js';
import { media as mediaStore, brands, projects } from '../store.js';
import { mediaURL } from '../media.js';
import { uid } from '../model.js';

let app, current = 'media';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function mount(a) {
  app = a;
  app.on('panel', (name) => { current = name; render(); });
  app.on('media', () => current === 'media' && render());
  app.on('change', () => (current === 'looks' || current === 'captions') && render());
  render();
}

function render() {
  const box = $('panel');
  box.innerHTML = { media, text, captions, looks, music, brand, project }[current]();
  box.querySelectorAll('[data-upload]').forEach((el) => el.onclick = () => $('fileInput').click());
  wire(box);
}

function media() {
  const items = [...app.media.values()].filter((m) => !m.hidden).sort((a, b) => b.created - a.created);
  return `<div class="p-title">Media <button class="btn sm primary" data-upload>Upload</button></div>
    <div class="drop-small" data-upload>Tap to add videos, photos or sound.<br><small>Or drop files anywhere.</small></div>
    ${items.length ? `<div class="grid2">${items.map((m) => `<div class="tile ${m.kind === 'audio' ? 'audio' : ''}" data-add="${m.id}" title="Add to timeline">
      ${m.thumb ? `<img src="${m.thumb}" alt="">` : `<span style="font-size:22px">${m.kind === 'audio' ? '♪' : '▣'}</span>`}
      <span class="kind">${m.kind === 'video' ? fmt(m.duration) : m.kind === 'audio' ? '♪ ' + fmt(m.duration) : 'IMG'}</span>
      <span class="cap">${esc(m.name)}</span><button class="x" data-del="${m.id}" aria-label="Remove">×</button></div>`).join('')}</div>` : `<div class="empty">Nothing here yet. Upload a set, a replay, photos or a beat.</div>`}
    <p class="muted" style="font-size:12px;margin-top:12px">Tap a file to add it at the playhead. Files stay on this device.</p>`;
}

function text() {
  return `<div class="p-title">Text</div><p class="p-sub">Tap a style to add it at the playhead, then edit on the right.</p>
    <div class="grid2">${TEXT_PRESETS.map((t) => `<div class="tile text-tile" data-text="${t.id}" style="font-family:'${t.font}';color:${t.color};background:${t.bg && t.bg !== 'transparent' ? t.bg : 'var(--card)'};${t.stroke ? `-webkit-text-stroke:1px ${t.stroke};` : ''}">${esc(t.text)}</div>`).join('')}</div>
    ${app.brand ? `<div class="sec"><h4>Brand</h4><button class="btn sm block" data-a="brandtext">Use brand font and colour on all text</button></div>` : ''}`;
}

function captions() {
  const caps = trackOf(app.project, 'text').clips.filter((c) => c.type === 'caption');
  const st = app.project.captions;
  return `<div class="p-title">Captions</div><p class="p-sub">Word by word, written on your device. Nothing is uploaded.</p>
    <button class="btn primary block" data-a="autocap">Auto captions for the whole video</button>
    <div class="row" style="margin:8px 0"><select id="capLang" class="btn sm" style="flex:1"><option value="en">English</option><option value="">Any language (bigger model)</option></select><button class="btn sm" data-a="capsel">Selected clip only</button></div>
    <div class="sec"><h4>Type them instead</h4><textarea id="capText" rows="3" style="width:100%;background:var(--card);border:1px solid var(--line);border-radius:8px;color:var(--ink);padding:8px" placeholder="Type what is said. Words spread evenly over the selected clip."></textarea><button class="btn sm block" data-a="typecap" style="margin-top:6px">Add typed captions</button></div>
    <div class="sec"><h4>Style</h4><div class="grid3">${[['bold', 'Bold box'], ['clean', 'Clean'], ['pill', 'Pills']].map(([id, n]) => `<button class="chip ${st.style === id ? 'on' : ''}" data-capstyle="${id}">${n}</button>`).join('')}</div>
    <div class="row" style="margin-top:8px"><span class="muted" style="font-size:12px">Active word</span><input type="color" data-caphl value="${st.highlight}" style="width:40px;height:28px;padding:0;border:0;background:none"></div></div>
    ${caps.length ? `<div class="sec"><h4>On the timeline</h4><div class="list">${caps.map((c) => `<button class="btn sm ghost" data-sel="${c.id}" style="text-align:left;white-space:normal">${fmt(c.start)} · ${esc(c.text.slice(0, 60))}</button>`).join('')}</div></div>` : ''}`;
}

function looks() {
  const sel = app.selected();
  const target = sel && (sel.clip.type === 'video' || sel.clip.type === 'image') ? sel.clip : null;
  const v = trackOf(app.project, 'video').clips[0];
  const m = (target || v) ? app.getMedia((target || v).mediaId) : null;
  const thumb = m && m.thumb;
  const cur = target ? target.look : null;
  return `<div class="p-title">Looks</div><p class="p-sub">${target ? 'Applies to the selected clip.' : 'Applies to every video and photo. Select a clip to change just one.'}</p>
    <div class="grid3">${LOOKS.map((l) => `<div class="tile look-tile ${cur === l.id ? 'on' : ''}" data-look="${l.id}" title="${l.name}">
      ${thumb ? `<img src="${thumb}" alt="" style="filter:${l.filter || 'none'}">` : `<div style="width:100%;height:100%;background:linear-gradient(135deg,#f0a35a,#4a7ad0,#2b2b35);filter:${l.filter || 'none'}"></div>`}
      ${l.tint ? `<div style="position:absolute;inset:0;background:${l.tint.color};opacity:${l.tint.alpha};mix-blend-mode:${l.tint.op}"></div>` : ''}<span class="cap">${l.name}</span></div>`).join('')}</div>
    ${target ? `<div class="sec"><label class="f">Strength<span class="val">${Math.round((target.lookAmount ?? 1) * 100)}%</span><input type="range" min="0" max="1" step="0.05" value="${target.lookAmount ?? 1}" data-lookamt></label></div>` : ''}`;
}

function music() {
  const items = [...app.media.values()].filter((m) => m.kind === 'audio');
  const sel = app.selected();
  const vid = sel && sel.clip.type === 'video' ? sel.clip : trackOf(app.project, 'video').clips.find((c) => c.type === 'video');
  return `<div class="p-title">Music and sound</div><p class="p-sub">Beats are made on your device, nothing to license. Music dips under speech.</p>
    <div class="list">${MUSIC.map((m) => `<button class="btn" data-gen="${m.style}" style="text-align:left">♪ ${m.name} <span class="muted">${m.bpm} bpm</span></button>`).join('')}</div>
    <div class="sec"><h4>Your tracks</h4>${items.length ? `<div class="list">${items.map((m) => `<button class="btn ghost" data-addmusic="${m.id}" style="text-align:left">♪ ${esc(m.name)} <span class="muted">${fmt(m.duration)}</span></button>`).join('')}</div>` : ''}<button class="btn sm block" data-upload style="margin-top:6px">Upload a track</button></div>
    ${vid ? `<div class="sec"><h4>Find the moment</h4><p class="muted" style="font-size:12px">Listens to "${esc(vid.name)}" and cuts it to the loudest part, the crowd, the drop.</p><div class="row">${[15, 30, 60].map((n) => `<button class="btn sm" data-best="${n}" data-clip="${vid.id}">${n} s</button>`).join('')}</div></div>` : ''}
    <div class="sec"><h4>Voiceover</h4><p class="muted" style="font-size:12px">Record a line over the video.</p><button class="btn sm block" data-a="rec">● Record from the playhead</button><div id="recStatus" class="muted" style="font-size:12px;margin-top:4px"></div></div>`;
}

function brand() {
  const b = app.brand;
  const logo = b && b.logoId ? app.getMedia(b.logoId) : null;
  return `<div class="p-title">Brand kit</div><p class="p-sub">Logo, colours and font, saved once, used on every video.</p>
    <div class="row" style="margin-bottom:10px">${logo ? `<img src="${logo.thumb}" alt="" style="width:64px;height:64px;object-fit:contain;background:#000;border-radius:10px">` : `<div class="tile" style="width:64px;height:64px;aspect-ratio:auto">★</div>`}<div><button class="btn sm" data-a="logo">${logo ? 'Change logo' : 'Add logo'}</button>${logo ? `<button class="btn sm ghost" data-a="putlogo">Put it on this video</button>` : ''}</div></div>
    <label class="f">Brand colour<input type="color" data-b="color" value="${b?.color || '#FF7A1A'}"></label>
    <label class="f">Second colour<input type="color" data-b="color2" value="${b?.color2 || '#7B2CFF'}"></label>
    <label class="f">Font<select data-b="font">${FONTS.map((f) => `<option value="${f.id}" ${b?.font === f.id ? 'selected' : ''}>${f.name}</option>`).join('')}</select></label>
    <label class="f">Handle<input data-b="handle" value="${esc(b?.handle || '')}" placeholder="@yourhandle"></label>
    <label class="f">Name<input data-b="name" value="${esc(b?.name || '')}" placeholder="Your act or business"></label>
    <div class="row" style="margin-top:6px"><button class="btn sm" data-a="outro">Add outro card</button><button class="btn sm" data-a="handlepill">Add handle</button></div>
    <input type="file" id="logoInput" accept="image/*" hidden>`;
}

function project() {
  const p = app.project;
  return `<div class="p-title">Project</div>
    <div class="list">
      <button class="btn" data-a="newfrom">Save a copy</button>
      <a class="btn" href="/clip" style="text-align:center">Make clips from a set</a>
      <a class="btn ghost" href="/" style="text-align:center">All projects</a>
      <button class="btn ghost" data-a="delete" style="color:var(--bad)">Delete this project</button>
    </div>
    <div class="sec"><h4>Canvas</h4><div class="grid2">${Object.values(SIZES).map((s) => `<button class="btn sm ${s.w === p.w && s.h === p.h ? 'accent' : ''}" data-size="${s.id}">${s.label}<br><small class="muted">${s.name}</small></button>`).join('')}</div></div>
    <div class="sec"><h4>About</h4><p class="muted" style="font-size:12px">Topier runs on your device. Projects and media live in this browser. Clear the site data and they are gone, so export what you want to keep.</p></div>`;
}

const fmt = (t) => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = Math.round(t % 60); return `${m}:${String(s).padStart(2, '0')}`; };

function wire(box) {
  box.querySelectorAll('[data-add]').forEach((el) => el.onclick = (e) => { if (e.target.closest('[data-del]')) return; const m = app.getMedia(el.dataset.add); if (m) app.addToTimeline(m, { at: m.kind === 'audio' ? 0 : app.time }); });
  box.querySelectorAll('[data-del]').forEach((el) => el.onclick = async (e) => { e.stopPropagation(); const id = el.dataset.del; const used = app.project.tracks.some((t) => t.clips.some((c) => c.mediaId === id)); if (used && !confirm('This file is on the timeline. Remove it anyway?')) return; app.set('Remove media', (p) => p.tracks.forEach((t) => { t.clips = t.clips.filter((c) => c.mediaId !== id); })); await mediaStore.del(id); app.media.delete(id); render(); });
  box.querySelectorAll('[data-text]').forEach((el) => el.onclick = () => app.commands.add_text({ preset: el.dataset.text }));
  box.querySelectorAll('[data-look]').forEach((el) => el.onclick = () => app.commands.apply_look({ look: el.dataset.look, clipId: app.selected() && app.selected().clip.type !== 'text' ? app.selection : null }));
  const amt = box.querySelector('[data-lookamt]'); if (amt) amt.oninput = () => { const f = app.selected(); if (!f) return; amt.previousElementSibling.textContent = `${Math.round(amt.value * 100)}%`; app.set('Strength', () => { f.clip.lookAmount = +amt.value; }, { merge: 'amt', silent: true }); app.player.draw(); };
  box.querySelectorAll('[data-gen]').forEach((el) => el.onclick = () => app.commands.add_music({ style: el.dataset.gen }));
  box.querySelectorAll('[data-addmusic]').forEach((el) => el.onclick = () => app.commands.add_music({ mediaId: el.dataset.addmusic }));
  box.querySelectorAll('[data-best]').forEach((el) => el.onclick = () => app.commands.best_moment({ clipId: el.dataset.clip, length: +el.dataset.best }));
  box.querySelectorAll('[data-size]').forEach((el) => el.onclick = () => app.commands.resize({ size: el.dataset.size }));
  box.querySelectorAll('[data-sel]').forEach((el) => el.onclick = () => { app.select(el.dataset.sel); const f = app.selected(); f && app.seek(f.clip.start); });
  box.querySelectorAll('[data-capstyle]').forEach((el) => el.onclick = () => app.set('Caption style', (p) => { p.captions.style = el.dataset.capstyle; }));
  const hl = box.querySelector('[data-caphl]'); if (hl) hl.onchange = () => app.set('Caption colour', (p) => { p.captions.highlight = hl.value; });
  const a = (name) => box.querySelector(`[data-a=${name}]`);
  if (a('autocap')) a('autocap').onclick = () => app.commands.add_captions({ lang: $('capLang').value });
  if (a('capsel')) a('capsel').onclick = () => { const f = app.selected(); if (!f || f.clip.type !== 'video') return app.toast('Select a video clip first.'); app.commands.add_captions({ clipId: f.clip.id, lang: $('capLang').value }); };
  if (a('typecap')) a('typecap').onclick = () => { const t = $('capText').value.trim(); if (!t) return; app.commands.captions_from_text({ text: t }); };
  if (a('brandtext')) a('brandtext').onclick = () => app.set('Brand text', (p) => { trackOf(p, 'text').clips.forEach((c) => { if (c.type === 'text') { c.font = app.brand.font || c.font; if (c.bg && c.bg !== 'transparent') c.bg = app.brand.color; else c.color = c.color === '#ffffff' ? '#ffffff' : app.brand.color; } }); ensureFont(app.brand.font); });
  if (a('rec')) a('rec').onclick = () => record(box);
  if (a('newfrom')) a('newfrom').onclick = async () => { const p = JSON.parse(JSON.stringify(app.project)); p.id = uid(); p.name += ' copy'; p.created = Date.now(); await projects.put(p); app.toast('Copy saved. Find it on the home page.'); };
  if (a('delete')) a('delete').onclick = async () => { if (!confirm('Delete this project? Media stays in your library.')) return; await projects.del(app.project.id); location.href = '/'; };
  // brand
  box.querySelectorAll('[data-b]').forEach((el) => el.onchange = async () => { app.brand ??= { id: uid(), color: '#FF7A1A', color2: '#7B2CFF', font: 'Inter' }; app.brand[el.dataset.b] = el.value; await brands.put(app.brand); app.toast('Brand saved'); });
  if (a('logo')) a('logo').onclick = () => $('logoInput').click();
  const li = box.querySelector('#logoInput'); if (li) li.onchange = async () => { const [m] = await app.importFiles(li.files); if (!m) return; m.hidden = true; await mediaStore.put(m); app.brand ??= { id: uid(), color: '#FF7A1A', color2: '#7B2CFF', font: 'Inter' }; app.brand.logoId = m.id; await brands.put(app.brand); render(); };
  if (a('putlogo')) a('putlogo').onclick = () => app.commands.add_logo();
  if (a('outro')) a('outro').onclick = () => { const b = app.brand || {}; const end = projectDuration(app.project); const c = app.commands.add_text({ preset: 'title', text: (b.name || 'YOUR NAME').toUpperCase() }); app.set('Outro', () => { c.start = Math.max(0, end - 3); c.duration = 3; c.y = 0.45; c.font = b.font || 'Anton'; }); if (b.handle) { const h = app.commands.add_text({ preset: 'handle', text: b.handle }); app.set('Outro', () => { h.start = Math.max(0, end - 3); h.duration = 3; h.y = 0.56; h.bg = b.color || h.bg; }); } };
  if (a('handlepill')) a('handlepill').onclick = () => { const b = app.brand || {}; const h = app.commands.add_text({ preset: 'handle', text: b.handle || '@yourhandle' }); app.set('Handle', () => { h.start = 0; h.duration = Math.max(3, projectDuration(app.project)); h.bg = b.color || h.bg; }); };
}

// Voiceover: record from the mic, drop on the Voice track at the playhead.
async function record(box) {
  const st = box.querySelector('#recStatus'), btn = box.querySelector('[data-a=rec]');
  if (app._rec) { app._rec.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); const parts = []; const at = app.time;
    rec.ondataavailable = (e) => parts.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop()); app._rec = null; btn.textContent = '● Record from the playhead'; st.textContent = 'Saving...';
      const file = new File(parts, `voice-${Date.now()}.${mime.includes('mp4') ? 'm4a' : 'webm'}`, { type: mime || 'audio/webm' });
      const [m] = await app.importFiles([file]); if (!m) return;
      m.name = 'Voiceover'; await mediaStore.put(m);
      app.addToTimeline(m, { at, kind: 'voice' }); st.textContent = 'Added to the Voice track.'; app.player.pause();
    };
    rec.start(); app._rec = rec; btn.textContent = '■ Stop'; st.textContent = 'Recording... the video plays along.';
    app.player.seek(at); app.player.play();
    app.player.onEnd = () => { rec.state === 'recording' && rec.stop(); };
  } catch (e) { st.textContent = 'Microphone not available: ' + (e.message || ''); }
}
