// The editor controller: project state, undo, commands, autosave, shortcuts. UI modules mount on `app`.
import { newProject, newMediaClip, newTextClip, newCaptionClip, projectDuration, findClip, trackOf, tidyTrack, ripple, splitClip, resizeProject, clipEnd, SIZES, uid } from './model.js';
import { projects, media as mediaStore, settings, brands, persist } from './store.js';
import { importFile, loudestWindows, mediaURL } from './media.js';
import { Player } from './engine/playback.js';
import { generateBed } from './engine/music.js';
import { TEXT_PRESETS, TEMPLATES, fromTemplate, ensureFont, MUSIC } from './presets.js';
import { transcribeClip, captionsAvailable, wordsFromText } from './captions.js';
import { lookById } from './looks.js';
import * as timeline from './ui/timeline.js';
import * as preview from './ui/preview.js';
import * as inspector from './ui/inspector.js';
import * as panels from './ui/panels.js';
import * as topiUI from './ui/topi.js';
import * as exportUI from './ui/export.js';
import * as simple from './ui/simple.js';
import { hydrate, icon } from './icons.js';
import * as H from './habits.js';
import * as auth from './auth.js';
import * as account from './ui/account.js';

const $ = (id) => document.getElementById(id);
const listeners = new Map();

export const app = {
  project: null, media: new Map(), player: null, selection: null, mode: 'standard', profile: {}, brand: null,
  undo: [], redo: [], _lastMerge: null, _dirty: false,
  $,
  on(evt, fn) { (listeners.get(evt) || listeners.set(evt, []).get(evt)).push(fn); },
  emit(evt, data) { for (const fn of listeners.get(evt) || []) { try { fn(data); } catch (e) { console.error(evt, e); } } },
  get time() { return this.player ? this.player.time : 0; },
  seek(t) { this.player.seek(t); },
  getMedia(id) { return app.media.get(id) || null; },

  // Mutate the project with an undo entry. merge: a key; repeated sets with the same key within 1.2 s share one entry.
  set(label, fn, { merge = null, silent = false } = {}) {
    const now = Date.now();
    if (!(merge && app._lastMerge && app._lastMerge.key === merge && now - app._lastMerge.at < 1200)) {
      app.undo.push(snapshot(app.project)); if (app.undo.length > 80) app.undo.shift();
      app.redo.length = 0;
    }
    app._lastMerge = merge ? { key: merge, at: now } : null;
    fn(app.project);
    app.project.tracks.forEach((t) => t.clips.forEach((c) => { delete c._phrases; }));
    app.project.updated = now;
    app.touch(silent);
  },
  touch(silent) {
    app._dirty = true; $('saved').textContent = 'Saving...';
    if (app.player) { app.player.refresh(); }
    if (!silent) app.emit('change');
    scheduleSave();
  },
  doUndo() { if (!app.undo.length) return; app.redo.push(snapshot(app.project)); restore(app.undo.pop()); app.toast('Undone'); },
  doRedo() { if (!app.redo.length) return; app.undo.push(snapshot(app.project)); restore(app.redo.pop()); },

  select(id) { if (app.selection === id) return; app.selection = id; app.player.selected = id; app.player.draw(); app.emit('select', id); },
  selected() { return app.selection ? findClip(app.project, app.selection) : null; },

  setMode(mode) {
    app.mode = mode; app.project.mode = mode;
    document.body.classList.remove('mode-simple', 'mode-standard', 'mode-pro'); document.body.classList.add('mode-' + mode);
    document.querySelectorAll('.tb-modes button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
    $('simpleView').hidden = mode !== 'simple';
    app.emit('mode', mode); app.touch(true); H.bump('mode', mode);
    setTimeout(() => preview.resize(), 50);
  },

  toast(msg, err = false) {
    const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
    $('toasts').appendChild(t); setTimeout(() => t.remove(), err ? 5000 : 2600);
  },
  sheet(html, { wide = false } = {}) {
    const s = $('sheet'); s.innerHTML = `<button class="ib close" aria-label="Close">×</button>${html}`; s.hidden = false; $('backdrop').hidden = false;
    s.style.width = wide ? 'min(900px, calc(100vw - 32px))' : '';
    s.querySelector('.close').onclick = app.closeSheet;
    return s;
  },
  closeSheet() { $('sheet').hidden = true; $('backdrop').hidden = true; $('sheet').innerHTML = ''; app._sheetAbort && app._sheetAbort.abort(); app._sheetAbort = null; },
  // Phones: one bottom sheet at a time, closed by its bar, by tapping outside, or by picking something.
  showSheet(which) { if (innerWidth > 900) return; $('panel').classList.toggle('open', which === 'panel'); $('inspector').classList.toggle('open', which === 'inspector'); $('phoneScrim').hidden = !which; document.body.classList.toggle('sheet-open', !!which); if (!which) document.querySelectorAll('.rail button').forEach((b) => b.classList.remove('on')); },
  openPanel(name) { document.querySelectorAll('.rail button').forEach((b) => b.classList.toggle('on', b.dataset.panel === name)); app.emit('panel', name); if (innerWidth <= 900) app.showSheet('panel'); else { $('panel').classList.add('open'); $('inspector').classList.remove('open'); } },

  // ---------- media ----------
  async importFiles(files) {
    const list = [...files]; if (!list.length) return [];
    const out = [];
    for (const f of list) {
      try {
        app.toast(`Adding ${f.name}...`);
        const m = await importFile(f, () => {});
        app.media.set(m.id, m); out.push(m);
      } catch (e) { app.toast(e.message || `Could not add ${f.name}`, true); }
    }
    app.emit('media');
    if (out.length) persist();
    return out;
  },
  addToTimeline(m, { at = null, kind = null } = {}) {
    const p = app.project;
    const track = kind ? trackOf(p, kind) : m.kind === 'audio' ? trackOf(p, 'audio') : trackOf(p, 'video');
    const c = newMediaClip(m, at == null ? (track.kind === 'video' ? projectDuration(p) === 0 ? 0 : endOf(track) : app.time) : at);
    if (track.kind === 'audio') { c.duration = Math.min(c.duration, Math.max(5, projectDuration(p) - c.start) || c.duration); }
    if (track.kind === 'overlay') { c.scale = 0.4; c.fit = 'contain'; c.x = 0.5; c.y = 0.5; }
    app.set('Add ' + m.name, (pr) => { track.clips.push(c); tidyTrack(track); });
    app.select(c.id);
    return c;
  },

  // ---------- commands: the fixed list Topi and the UI share ----------
  commands: {
    open_upload() { $('fileInput').click(); },
    open_export() { exportUI.open(app); },
    set_mode({ mode }) { if (['simple', 'standard', 'pro'].includes(mode)) app.setMode(mode); },
    add_text({ preset = 'title', text } = {}) {
      const pr = TEXT_PRESETS.find((t) => t.id === preset) || TEXT_PRESETS[0];
      const d = Math.max(3, Math.min(6, projectDuration(app.project) || 4));
      const c = newTextClip(pr, app.time, text || pr.text); c.duration = Math.min(d, Math.max(1, projectDuration(app.project) - app.time) || d);
      if (app.brand && app.brand.font) c.font = app.brand.font;
      ensureFont(c.font);
      app.set('Add text', (p) => { const tr = trackOf(p, 'text'); tr.clips.push(c); });
      app.select(c.id);
      if (innerWidth <= 900) app.showSheet('inspector'); else app.openPanel('text');
      return c;
    },
    apply_look({ look = 'golden', clipId = null, amount = 1 } = {}) {
      const l = lookById(look);
      app.set('Look: ' + l.name, (p) => {
        const targets = clipId ? [findClip(p, clipId)?.clip] : app.selection && findClip(p, app.selection)?.clip?.type !== 'text' ? [findClip(p, app.selection).clip] : p.tracks.flatMap((t) => t.clips.filter((c) => c.type === 'video' || c.type === 'image'));
        for (const c of targets) if (c) { c.look = l.id; c.lookAmount = amount; }
      });
      app.toast(`${l.name} applied`);
    },
    async add_captions({ clipId = null, lang = 'en' } = {}) {
      const clips = (clipId ? [findClip(app.project, clipId)?.clip] : trackOf(app.project, 'video').clips.filter((c) => c.type === 'video' && !c.muted && c.volume > 0)).filter(Boolean);
      if (!clips.length) return app.toast('Add a video with speech first.', true);
      if (!captionsAvailable()) return app.toast('This browser cannot run captions.', true);
      const s = app.sheet(`<h3>Writing captions</h3><p class="muted" id="capMsg">Listening on your device. The first time downloads the caption model, about 40 MB.</p><div class="bar"><i id="capBar"></i></div><button class="btn ghost" id="capCancel">Cancel</button>`);
      let cancelled = false; s.querySelector('#capCancel').onclick = () => { cancelled = true; app.closeSheet(); };
      try {
        for (const c of clips) {
          if (cancelled) break;
          const m = app.getMedia(c.mediaId); if (!m) continue;
          const words = await transcribeClip(c, m, { lang, onProgress: (pg) => { const el = $('capMsg'), bar = $('capBar'); if (!el) return; el.textContent = pg.stage === 'model' ? `Getting the caption model... ${Math.round((pg.pct || 0) * 100)}%` : pg.stage === 'decode' ? 'Reading the sound...' : `Listening to "${c.name}"...`; bar.style.width = `${Math.round((pg.pct || 0) * 100)}%`; } });
          if (cancelled) break;
          if (!words.length) { app.toast(`No speech found in ${c.name}.`); continue; }
          const cap = newCaptionClip(words, c.start, c.duration);
          app.set('Captions', (p) => { const tr = trackOf(p, 'text'); tr.clips = tr.clips.filter((x) => !(x.type === 'caption' && x.start === c.start)); tr.clips.push(cap); });
        }
        app.closeSheet(); app.toast('Captions added. Tap them to edit.'); app.openPanel('captions');
      } catch (e) {
        console.error(e); app.closeSheet();
        const net = /network|fetch|load/i.test(e.message || '');
        app.toast(net ? 'Could not download the caption model. Check your connection and try again, or type the captions instead.' : 'Captions failed: ' + (e.message || 'try again'), true);
      }
    },
    captions_from_text({ text, clipId = null } = {}) {
      const sel = clipId ? findClip(app.project, clipId)?.clip : app.selected()?.clip;
      const start = sel ? sel.start : app.time, dur = sel ? sel.duration : Math.max(3, projectDuration(app.project) - app.time);
      const words = wordsFromText(text || '', dur); if (!words.length) return;
      const cap = newCaptionClip(words, start, dur);
      app.set('Captions', (p) => trackOf(p, 'text').clips.push(cap)); app.select(cap.id);
    },
    async add_music({ style = 'chill', mediaId = null } = {}) {
      let m = mediaId ? app.getMedia(mediaId) : null;
      if (!m) {
        const def = MUSIC.find((x) => x.style === style) || MUSIC[0];
        app.toast('Making a beat on your device...');
        const len = Math.max(30, Math.min(120, Math.ceil(projectDuration(app.project)) + 4 || 60));
        const file = await generateBed(def.style, def.bpm, len);
        [m] = await app.importFiles([file]);
        if (!m) return;
        m.name = def.name; await mediaStore.put(m);
      }
      const tr = trackOf(app.project, 'audio');
      app.set('Add music', (p) => { tr.clips = []; const c = newMediaClip(m, 0); c.duration = Math.min(m.duration || c.duration, Math.max(5, projectDuration(p) || c.duration)); c.fadeOut = 1.2; c.volume = 0.8; tr.clips.push(c); });
      app.toast('Music added. It dips under speech automatically.');
    },
    best_moment({ clipId = null, length = 30 } = {}) {
      const f = clipId ? findClip(app.project, clipId) : app.selected(); if (!f) return app.toast('Select a video first.', true);
      const { clip } = f; const m = app.getMedia(clip.mediaId); if (!m || !m.peaks) return app.toast('No sound to listen to in this clip.', true);
      const win = loudestWindows(m.peaks, Math.min(length, clip.duration), 1)[0]; if (!win) return;
      app.set('Best moment', (p) => { clip.in = win.start; clip.duration = Math.min(length, (m.duration || clip.duration) - win.start); f.track.kind === 'video' ? ripple(f.track) : tidyTrack(f.track); });
      app.seek(clip.start); app.toast(`Cut to the loudest ${Math.round(clip.duration)} seconds.`);
    },
    set_transitions({ trans = 'dissolve', dur = 0.5 } = {}) {
      app.set('Transitions', (p) => { const tr = trackOf(p, 'video'); tr.clips.sort((a, b) => a.start - b.start); tr.clips.forEach((c, i) => { if (i > 0) c.transIn = { type: trans, dur }; }); });
    },
    split_at({ t = null, clipId = null } = {}) {
      const time = t == null ? app.time : t;
      const f = clipId ? findClip(app.project, clipId) : app.selected() || under(time);
      if (!f) return app.toast('Put the playhead on a clip to split it.');
      let right;
      app.set('Split', () => { right = splitClip(f.track, f.clip, time); });
      if (right) app.select(right.id); else app.toast('Move the playhead inside the clip to split it.');
    },
    remove_clip({ clipId = null } = {}) {
      const id = clipId || app.selection; if (!id) return;
      app.set('Delete', (p) => { for (const t of p.tracks) { const i = t.clips.findIndex((c) => c.id === id); if (i >= 0) { t.clips.splice(i, 1); if (t.kind === 'video') ripple(t); } } });
      app.select(null);
    },
    set_speed({ clipId = null, speed = 1 } = {}) { const f = clipId ? findClip(app.project, clipId) : app.selected(); if (!f) return; app.set('Speed', (p) => { const c = f.clip; const srcLen = c.duration * c.speed; c.speed = speed; c.duration = srcLen / speed; f.track.kind === 'video' ? ripple(f.track) : tidyTrack(f.track); }); },
    set_duration({ clipId = null, duration = 4 } = {}) { const f = clipId ? findClip(app.project, clipId) : app.selected(); if (!f) return; app.set('Length', (p) => { f.clip.duration = Math.max(0.2, duration); f.track.kind === 'video' ? ripple(f.track) : tidyTrack(f.track); }); },
    mute_clip({ clipId = null, muted = true } = {}) { const f = clipId ? findClip(app.project, clipId) : app.selected(); if (!f) return; app.set('Mute', () => { f.clip.muted = muted; }); },
    resize({ size = 'reels' } = {}) { if (!SIZES[size]) return; app.set('Canvas ' + SIZES[size].label, (p) => resizeProject(p, size)); preview.resize(); app.toast(`Canvas is now ${SIZES[size].label}`); },
    duck({ on = true } = {}) { app.set('Ducking', (p) => { trackOf(p, 'audio').duck = !!on; }); },
    add_logo() {
      if (!app.brand || !app.brand.logoId) return app.toast('Add a logo in Brand first.');
      const m = app.getMedia(app.brand.logoId); if (!m) return;
      app.set('Logo', (p) => { const tr = trackOf(p, 'overlay'); const c = newMediaClip(m, 0); c.duration = Math.max(3, projectDuration(p)); c.fit = 'contain'; c.scale = 0.22; c.x = 0.86; c.y = 0.08; c.name = 'Logo'; tr.clips.push(c); });
    },
    reorder({ clipId, dir }) {
      app.set('Reorder', (p) => { const tr = trackOf(p, 'video'); tr.clips.sort((a, b) => a.start - b.start); const i = tr.clips.findIndex((c) => c.id === clipId); const j = i + dir; if (i < 0 || j < 0 || j >= tr.clips.length) return; [tr.clips[i], tr.clips[j]] = [tr.clips[j], tr.clips[i]]; ripple(tr); });
    },
  },
  // Learn what this person reaches for, so Topi can follow their style.
  _learn(type, a = {}) { H.bump('cmd', type); if (type === 'apply_look') H.bump('look', a.look); if (type === 'add_text') H.bump('text', a.preset); if (type === 'add_music' && a.style && !a.mediaId) H.bump('music', a.style); if (type === 'set_transitions') H.bump('trans', a.trans); if (type === 'resize') H.bump('size', a.size); },
  run(action) {
    const fn = app.commands[action.type];
    if (!fn) return app.toast('Topi tried something this editor cannot do yet.');
    return fn(action);
  },
};

function endOf(track) { return track.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0); }
function under(t) { for (const kind of ['video', 'overlay', 'text', 'audio', 'voice']) { const tr = trackOf(app.project, kind); const c = tr && tr.clips.find((x) => t > x.start && t < clipEnd(x)); if (c) return { clip: c, track: tr }; } return null; }
function snapshot(p) { return JSON.stringify(p, (k, v) => (k === '_phrases' ? undefined : v)); }
function restore(json) { const p = JSON.parse(json); app.project = p; app.player.project = p; app.player.refresh(); app._dirty = true; app.emit('change'); app.emit('select', app.selection); scheduleSave(); }

let saveTimer = 0;
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(app.save = save, 700); }
async function save() {
  if (!app._dirty) return;
  try { await projects.put(app.project); app._dirty = false; $('saved').textContent = auth.currentUser() ? 'Saved to your account' : 'Saved'; auth.pushProject(app.project); } catch (e) { console.error(e); $('saved').textContent = 'Not saved'; }
}

// ---------- boot ----------
async function boot() {
  const q = new URLSearchParams(location.search);
  app.profile = (await settings.get('profile', {})) || {};
  const trial = await settings.get('trialStart', null);
  if (!trial) await settings.set('trialStart', Date.now());
  // media library
  for (const m of await mediaStore.list()) app.media.set(m.id, m);
  // brand
  const bs = await brands.list(); app.brand = bs[0] || null;
  // project
  let p = q.get('id') ? await projects.get(q.get('id')) : null;
  if (!p) {
    const tpl = TEMPLATES.find((t) => t.id === q.get('template'));
    p = tpl ? fromTemplate(tpl) : newProject({ size: q.get('size') || (app.profile.size || 'reels'), name: q.get('name') || 'Untitled video' });
    if (q.get('mode')) p.mode = q.get('mode');
    await projects.put(p);
    history.replaceState(null, '', `/editor?id=${p.id}`);
  }
  app.project = p;
  $('projName').value = p.name;
  document.title = `${p.name} · Topier`;
  // player
  app.player = new Player(p, $('preview'), (id) => app.getMedia(id));
  app.player.onTime = (t) => app.emit('time', t);
  app.player.onEnd = () => { $('playBtn').innerHTML = icon('play', 20); };
  // UI
  hydrate();
  H.session();
  for (const [k, fn] of Object.entries(app.commands)) app.commands[k] = (a = {}) => { app._learn(k, a); return fn(a); };
  document.querySelectorAll('[data-close-sheet]').forEach((b) => b.onclick = () => app.showSheet(null));
  $('phoneScrim').onclick = () => app.showSheet(null);
  preview.mount(app); timeline.mount(app); inspector.mount(app); panels.mount(app); topiUI.mount(app); exportUI.mount(app); simple.mount(app);
  app.setMode(p.mode || app.profile.level || 'standard');
  wireChrome();
  account.mount($('accountBtn'), { sheet: (html) => app.sheet(html), closeSheet: app.closeSheet, toast: app.toast, compact: true, onChange: (u, plan) => { const paid = plan && plan !== 'free'; if (paid && app.project.watermark && !app.project._wmChosen) { app.project.watermark = false; app.touch(true); } app.emit('select', app.selection); } });
  document.addEventListener('topier-open-setup', () => { location.href = '/#setup'; });
  const fonts = new Set(p.tracks.flatMap((t) => t.clips.map((c) => c.font).filter(Boolean))); fonts.add('Inter');
  await Promise.all([...fonts].map(ensureFont));
  // files chosen on the home page
  if (q.get('add')) {
    const ids = q.get('add').split(',').filter((id) => app.media.has(id));
    if (ids.length && !trackOf(p, 'video').clips.length) {
      for (const id of ids) { const m = app.media.get(id); if (m.kind === 'audio') app.commands.add_music({ mediaId: id }); else app.addToTimeline(m); }
      app.undo.length = 0; app.select(null);
    }
    history.replaceState(null, '', `/editor?id=${p.id}`);
  }
  app.player.seek(0);
  app.emit('change'); app.emit('select', null);
  const splash = $('splash'); splash.classList.add('gone'); setTimeout(() => splash.remove(), 400);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

function wireChrome() {
  $('projName').addEventListener('change', (e) => { app.set('Rename', (p) => { p.name = e.target.value.trim() || 'Untitled video'; }); document.title = `${app.project.name} · Topier`; });
  document.querySelectorAll('.tb-modes button').forEach((b) => b.onclick = () => app.setMode(b.dataset.mode));
  $('undo').onclick = app.doUndo; $('redo').onclick = app.doRedo;
  $('exportBtn').onclick = () => exportUI.open(app);
  $('playBtn').onclick = () => { app.player.toggle(); $('playBtn').innerHTML = icon(app.player.playing ? 'pause' : 'play', 20); };
  $('toStart').onclick = () => app.seek(0); $('toEnd').onclick = () => app.seek(projectDuration(app.project));
  $('splitBtn').onclick = () => app.commands.split_at({}); $('delBtn').onclick = () => app.commands.remove_clip({});
  $('guidesBtn').onclick = (e) => { app.player.guides = !app.player.guides; e.currentTarget.setAttribute('aria-pressed', String(app.player.guides)); app.player.draw(); };
  $('loopBtn').onclick = (e) => { app.player.loop = !app.player.loop; e.currentTarget.setAttribute('aria-pressed', String(app.player.loop)); };
  $('fitBtn').onclick = () => timeline.fit();
  document.querySelectorAll('.rail button').forEach((b) => b.onclick = () => { const open = b.classList.contains('on') && $('panel').classList.contains('open') && innerWidth <= 900; if (open) { $('panel').classList.remove('open'); b.classList.remove('on'); } else app.openPanel(b.dataset.panel); });
  app.on('time', (t) => { $('tcNow').textContent = tc(t); });
  app.on('change', () => { $('tcEnd').textContent = tc(projectDuration(app.project)); });
  app.on('select', (id) => { if (innerWidth > 900) return; if (id && app._userSelect) app.showSheet('inspector'); else if (!id && $('inspector').classList.contains('open')) app.showSheet(null); });
  // Only a tap on the timeline or the preview opens the sheet on phones, not programmatic selection.
  ['tlTracks', 'preview', 'simpleView'].forEach((id) => $(id).addEventListener('pointerdown', () => { app._userSelect = true; setTimeout(() => { app._userSelect = false; }, 400); }, true));
  $('backdrop').onclick = app.closeSheet;
  // Phones: the mode switch lives in the transport bar, where there is room.
  const placeModes = () => { const m = document.querySelector('.tb-modes'); const phone = innerWidth <= 900; const target = phone ? document.querySelector('.transport') : document.querySelector('.topbar'); if (m.parentElement !== target) { if (phone) target.insertBefore(m, $('splitBtn')); else target.insertBefore(m, document.querySelector('.tb-actions')); } };
  placeModes(); window.addEventListener('resize', placeModes);
  // file input and drag-drop
  $('fileInput').onchange = async (e) => { const ms = await app.importFiles(e.target.files); e.target.value = ''; if (ms.length && !trackOf(app.project, 'video').clips.length) for (const m of ms) if (m.kind !== 'audio') app.addToTimeline(m); app.openPanel('media'); };
  let dragDepth = 0;
  document.addEventListener('dragenter', (e) => { if ([...e.dataTransfer.types].includes('Files')) { dragDepth++; $('dropzone').hidden = false; } });
  document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('dropzone').hidden = true; } });
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', async (e) => { e.preventDefault(); dragDepth = 0; $('dropzone').hidden = true; if (e.dataTransfer.files.length) { const ms = await app.importFiles(e.dataTransfer.files); for (const m of ms) app.addToTimeline(m); app.openPanel('media'); } });
  // keyboard
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) { if (e.key === 'Escape') e.target.blur(); return; }
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); $('playBtn').click(); }
    else if (k === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.shiftKey ? app.doRedo() : app.doUndo(); }
    else if (k === 'y' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); app.doRedo(); }
    else if (k === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); app.toast('Saved on this device'); }
    else if (k === 's') app.commands.split_at({});
    else if (k === 'delete' || k === 'backspace') app.commands.remove_clip({});
    else if (k === 'home') app.seek(0);
    else if (k === 'end') app.seek(projectDuration(app.project));
    else if (k === 'arrowleft') app.seek(app.time - (e.shiftKey ? 1 : 1 / app.project.fps));
    else if (k === 'arrowright') app.seek(app.time + (e.shiftKey ? 1 : 1 / app.project.fps));
    else if (k === 'escape') { app.select(null); app.closeSheet(); }
    else if (k === 't') app.commands.add_text({});
    else if (k === 'e' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); exportUI.open(app); }
    else if (k === 'd' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); const f = app.selected(); if (f) app.set('Duplicate', () => { const c = JSON.parse(JSON.stringify(f.clip)); c.id = uid(); c.start = clipEnd(f.clip); f.track.clips.push(c); tidyTrack(f.track); app.select(c.id); }); }
    else if (k === '=' || k === '+') timeline.zoom(1.25); else if (k === '-') timeline.zoom(0.8);
  });
  window.addEventListener('beforeunload', (e) => { if (app._dirty) { save(); } if (app._exporting) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
}

export const tc = (t) => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = Math.floor(t % 60), d = Math.floor((t % 1) * 10); return `${m}:${String(s).padStart(2, '0')}.${d}`; };

window.__app = app;
boot().catch((e) => { console.error(e); document.body.innerHTML = `<div style="padding:40px;font-family:Inter,sans-serif"><h2>Topier could not open</h2><p>${e.message}</p><a href="/" style="color:#ff7a1a">Back home</a></div>`; });
