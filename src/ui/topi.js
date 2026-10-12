// Topi's panel: introduces itself once, then one suggestion at a time shaped by the person's
// habits, a chat, and buttons that run editor commands. Turned-down tips stop coming back.
import { suggest, ask, autopilot, leftToday, plan, INTRO } from '../topi.js';
import { has, openPlans } from '../plan.js';
import * as H from '../habits.js';

let app, history = [], lastSuggestId = null, quiet = false, lastTipEl = null, calmUntil = 0, auto = false;
const phone = () => innerWidth <= 900;
const tipsOff = () => { try { return localStorage.getItem('topier-topi-tips') === 'off'; } catch { return false; } };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function mount(a) {
  app = a;
  $('topiBubble').onclick = () => toggle(true);
  $('topiBtn').onclick = () => toggle();
  $('topiClose').onclick = () => toggle(false);
  $('topiForm').onsubmit = async (e) => { e.preventDefault(); const q = $('topiInput').value.trim(); if (!q) return; $('topiInput').value = ''; await (auto ? runAuto(q) : send(q)); };
  // Autopilot switch, above the input: on, the next message is carried out as a whole edit.
  const bar = document.createElement('div'); bar.className = 'topi-auto';
  bar.innerHTML = '<button type="button" class="chip" id="topiAuto" aria-pressed="false">Autopilot <span class="pro-tag inline">Pro</span></button><span class="muted" id="topiAutoNote"></span>';
  $('topiForm').before(bar);
  $('topiAuto').onclick = () => {
    if (!has('pro')) { const el = add('topi', 'Autopilot edits the whole video from one prompt, like "make a 30 second reel with captions and a warm look". It comes with Pro.'); const b = document.createElement('button'); b.className = 'btn sm primary'; b.textContent = 'See Pro'; b.onclick = () => openPlans('pro'); const w = document.createElement('div'); w.className = 'acts'; w.appendChild(b); el.appendChild(w); return; }
    auto = !auto; $('topiAuto').classList.toggle('on', auto); $('topiAuto').setAttribute('aria-pressed', String(auto));
    $('topiAutoNote').textContent = auto ? 'Describe the video. I will edit it.' : '';
    $('topiInput').placeholder = auto ? 'Make a 30 second reel with captions' : 'Ask Topi anything about this video';
    if (auto && innerWidth > 900) $('topiInput').focus();
  };
  app.on('mode', (m) => { quiet = m === 'pro'; if (!quiet && H.introSeen()) tip(); });
  let t = 0; app.on('change', () => { clearTimeout(t); t = setTimeout(() => { if (H.introSeen()) tip(); }, 1500); });
  // Tips on or off, from Topi's own header.
  const head = document.querySelector('.topi-head'); const sw = document.createElement('button'); sw.className = 'btn sm ghost'; sw.id = 'topiTips';
  const paint = () => { sw.textContent = tipsOff() ? 'Tips off' : 'Tips on'; sw.title = tipsOff() ? 'Topi only answers when you ask' : 'Topi offers one small idea at a time'; };
  sw.onclick = () => { try { localStorage.setItem('topier-topi-tips', tipsOff() ? 'on' : 'off'); } catch {} paint(); if (!tipsOff()) tip(true); };
  head.insertBefore(sw, $('topiClose')); paint();
  setTimeout(() => {
    if (!H.introSeen()) { intro(); if (phone()) $('topiDot').hidden = false; else toggle(true); return; }
    if (!quiet) { tip(); if (!phone() && !app.project.tracks.some((tr) => tr.clips.length)) toggle(true); }
  }, 800);
}

function intro() {
  const name = app.profile && app.profile.name ? `, ${app.profile.name.split(' ')[0]}` : '';
  add('topi', INTRO.text.replace('Hi,', `Hi${name},`));
  const log = $('topiLog'); const row = document.createElement('div'); row.className = 'starters';
  for (const [label, q] of INTRO.starters) { const b = document.createElement('button'); b.className = 'chip'; b.textContent = label; b.onclick = () => { row.remove(); send(q); }; row.appendChild(b); }
  log.appendChild(row);
  H.markIntro();
  calmUntil = Date.now() + 90000; // after saying hello, give them room before any tip
}

function toggle(force) {
  const open = force == null ? $('topi').hidden : force;
  $('topi').hidden = !open; $('topiBtn').setAttribute('aria-pressed', String(open)); $('topiDot').hidden = true;
  document.body.classList.toggle('topi-open', open);
  if (open && innerWidth <= 900) { $('panel').classList.remove('open'); $('inspector').classList.remove('open'); }
  if (open) { $('topiLeft').textContent = `${leftToday('guide')} today`; if (!history.length) tip(true); if (innerWidth > 900) $('topiInput').focus(); }
}

// A fresh suggestion for the current project state, only when it changed.
function tip(force = false) {
  if (tipsOff() && !force) return;
  if (Date.now() < calmUntil) return;
  const s = suggest(app.project, app.profile)[0];
  if (!s || (s.id === lastSuggestId && !force)) return;
  lastSuggestId = s.id;
  // only one open tip at a time: an unanswered older tip makes way for the new one
  if (lastTipEl && lastTipEl.querySelector('.acts')) lastTipEl.remove();
  lastTipEl = add('topi', s.text, s.action ? [s.action] : [], s.id);
  // A quiet dot, never a pop-up: the person opens Topi when they want.
  if ($('topi').hidden) $('topiDot').hidden = false;
}

function add(role, text, actions = [], tipId = null) {
  history.push({ role: role === 'me' ? 'user' : 'assistant', text });
  const log = $('topiLog');
  const el = document.createElement('div'); el.className = `msg ${role === 'topi' ? 'bot' : role}`;
  el.innerHTML = esc(text);
  if (actions.length) {
    const acts = document.createElement('div'); acts.className = 'acts';
    for (const a of actions) {
      const b = document.createElement('button'); b.className = 'btn sm primary'; b.textContent = label(a);
      b.onclick = async () => {
        if (plan() === 'free' && !['open_upload', 'open_export', 'set_mode'].includes(a.type)) { add('topi', 'On the free plan I show you the way. Co-pilot, where I do it for you, comes with Creator. Your 7 day trial has it on.'); }
        b.disabled = true; b.textContent = 'Done'; if (tipId) H.accept(tipId);
        try { await app.run(a); } catch (e) { app.toast(e.message || 'That did not work', true); }
      };
      acts.appendChild(b);
    }
    if (tipId) {
      const no = document.createElement('button'); no.className = 'btn sm ghost'; no.textContent = 'Not now';
      no.onclick = () => { H.dismiss(tipId); el.classList.add('faded'); acts.remove(); };
      acts.appendChild(no);
    }
    el.appendChild(acts);
  }
  log.appendChild(el); log.scrollTop = log.scrollHeight;
  while (log.children.length > 40) log.firstChild.remove();
  return el;
}

function label(a) {
  return { add_text: 'Add the title', apply_look: 'Apply the look', add_captions: 'Write captions', add_music: 'Add a beat', best_moment: 'Cut to the best part', set_transitions: 'Add transitions', resize: 'Switch to 9:16', open_export: 'Export', open_upload: 'Upload', split_at: 'Split here', remove_clip: 'Remove it', set_speed: 'Change speed', mute_clip: 'Mute it', duck: 'Dip music under speech', set_mode: 'Switch mode', set_duration: 'Change length', add_logo: 'Add my logo', captions_from_text: 'Add captions' }[a.type] || 'Do it';
}

// Autopilot: plan the whole edit, run every step, and offer one undo for all of it.
async function runAuto(q) {
  add('me', q);
  const log = $('topiLog'); const th = document.createElement('div'); th.className = 'msg bot thinking'; th.textContent = 'Topi is planning the edit...'; log.appendChild(th); log.scrollTop = log.scrollHeight;
  const r = await autopilot(q, app.project, app.profile);
  const steps = (r.actions || []).filter((a) => a && a.type !== 'open_export');
  const mark = app.undo.length; let done = 0;
  for (const a of steps) {
    th.textContent = `Editing, step ${done + 1} of ${steps.length}: ${label(a).toLowerCase()}...`;
    try { await app.run(a); done++; } catch (e) { console.warn('autopilot step failed', a, e); }
  }
  th.remove();
  const el = add('topi', r.reply);
  if (app.undo.length > mark) {
    const acts = document.createElement('div'); acts.className = 'acts';
    const un = document.createElement('button'); un.className = 'btn sm'; un.textContent = 'Undo all of it';
    un.onclick = () => { app.undoTo(mark); el.classList.add('faded'); acts.remove(); };
    const ex = document.createElement('button'); ex.className = 'btn sm primary'; ex.textContent = 'Export';
    ex.onclick = () => app.run({ type: 'open_export' });
    acts.append(ex, un); el.appendChild(acts); log.scrollTop = log.scrollHeight;
  }
}

async function send(q) {
  add('me', q);
  const log = $('topiLog'); const th = document.createElement('div'); th.className = 'msg bot thinking'; th.textContent = 'Topi is looking at your project...'; log.appendChild(th); log.scrollTop = log.scrollHeight;
  const r = await ask(q, app.project, history, app.profile);
  th.remove();
  add('topi', r.reply, r.actions || []);
  $('topiLeft').textContent = `${leftToday('guide')} today`;
}
