// Topi's panel: one suggestion at a time, a chat, and Apply buttons that run editor commands.
import { suggest, ask, leftToday, plan } from '../topi.js';

let app, history = [], lastSuggestId = null, quiet = false;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function mount(a) {
  app = a;
  $('topiBubble').onclick = () => toggle(true);
  $('topiBtn').onclick = () => toggle();
  $('topiClose').onclick = () => toggle(false);
  $('topiForm').onsubmit = async (e) => { e.preventDefault(); const q = $('topiInput').value.trim(); if (!q) return; $('topiInput').value = ''; await send(q); };
  app.on('mode', (m) => { quiet = m === 'pro'; if (!quiet) tip(); });
  let t = 0; app.on('change', () => { clearTimeout(t); t = setTimeout(tip, 1500); });
  setTimeout(() => { if (!quiet) { tip(); if (!app.project.tracks.some((tr) => tr.clips.length)) toggle(true); } }, 800);
}

function toggle(force) {
  const open = force == null ? $('topi').hidden : force;
  $('topi').hidden = !open; $('topiBtn').setAttribute('aria-pressed', String(open)); $('topiDot').hidden = true;
  if (open) { $('topiLeft').textContent = `${leftToday('guide')} today`; if (!history.length) tip(true); $('topiInput').focus(); }
}

// A fresh suggestion for the current project state, only when it changed.
function tip(force = false) {
  const s = suggest(app.project, app.profile)[0];
  if (!s || (s.id === lastSuggestId && !force)) return;
  lastSuggestId = s.id;
  add('topi', s.text, s.action ? [s.action] : []);
  if ($('topi').hidden) $('topiDot').hidden = false;
}

function add(role, text, actions = []) {
  history.push({ role: role === 'me' ? 'user' : 'assistant', text });
  const log = $('topiLog');
  const el = document.createElement('div'); el.className = `msg ${role}`;
  el.innerHTML = esc(text);
  if (actions.length) {
    const acts = document.createElement('div'); acts.className = 'acts';
    for (const a of actions) {
      const b = document.createElement('button'); b.className = 'btn sm primary'; b.textContent = label(a);
      b.onclick = async () => {
        if (plan() === 'free' && !['open_upload', 'open_export', 'set_mode'].includes(a.type)) { add('topi', 'On the free plan I show you the way. Co-pilot, where I do it for you, comes with Creator. Your 7 day trial has it on.'); }
        b.disabled = true; b.textContent = 'Done';
        try { await app.run(a); } catch (e) { app.toast(e.message || 'That did not work', true); }
      };
      acts.appendChild(b);
    }
    el.appendChild(acts);
  }
  log.appendChild(el); log.scrollTop = log.scrollHeight;
  while (log.children.length > 40) log.firstChild.remove();
}

function label(a) {
  return { add_text: 'Add the title', apply_look: 'Apply the look', add_captions: 'Write captions', add_music: 'Add a beat', best_moment: 'Cut to the best part', set_transitions: 'Add dissolves', resize: 'Switch to 9:16', open_export: 'Export', open_upload: 'Upload', split_at: 'Split here', remove_clip: 'Remove it', set_speed: 'Change speed', mute_clip: 'Mute it', duck: 'Dip music under speech', set_mode: 'Switch mode', set_duration: 'Change length', add_logo: 'Add my logo', captions_from_text: 'Add captions' }[a.type] || 'Do it';
}

async function send(q) {
  add('me', q);
  const log = $('topiLog'); const th = document.createElement('div'); th.className = 'msg topi thinking'; th.textContent = 'Topi is looking at your project...'; log.appendChild(th); log.scrollTop = log.scrollHeight;
  const r = await ask(q, app.project, history, app.profile);
  th.remove();
  add('topi', r.reply, r.actions || []);
  $('topiLeft').textContent = `${leftToday('guide')} today`;
}
