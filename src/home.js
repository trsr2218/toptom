// Home: onboarding, quick starts, your projects, templates.
import { SIZES, newProject } from './model.js';
import { projects, media as mediaStore, settings, usage, persist } from './store.js';
import { importFile } from './media.js';
import { TEMPLATES, ONBOARD } from './presets.js';
import { hydrate } from './icons.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let profile = {};

async function boot() {
  hydrate();
  profile = (await settings.get('profile', null)) || null;
  renderTemplates(); await renderProjects();
  $('startBtn').onclick = () => profile ? go(newUrl(profile.size || 'reels')) : onboarding(() => go(newUrl(profile.size || 'reels')));
  $('uploadBtn').onclick = () => $('fileInput').click();
  $('quick').querySelectorAll('[data-size]').forEach((b) => b.onclick = () => go(newUrl(b.dataset.size)));
  $('fileInput').onchange = async (e) => {
    const files = [...e.target.files]; if (!files.length) return;
    const s = sheet(`<h3>Adding your files</h3><p class="muted" id="upMsg">Reading...</p>`);
    const ids = [];
    for (const f of files) { try { s.querySelector('#upMsg').textContent = `Reading ${f.name}...`; const m = await importFile(f); ids.push(m.id); } catch (err) { s.querySelector('#upMsg').textContent = err.message; await new Promise((r) => setTimeout(r, 1200)); } }
    await persist();
    const first = ids.length ? await mediaStore.get(ids[0]) : null;
    const size = first && first.w && first.h ? (first.w > first.h ? 'landscape' : first.w === first.h ? 'square' : 'reels') : (profile && profile.size) || 'reels';
    const p = newProject({ size, name: first ? first.name : 'Untitled video' });
    await projects.put(p);
    go(`/editor?id=${p.id}&add=${ids.join(',')}`);
  };
  $('profileBtn').onclick = () => onboarding(() => location.reload());
  const topiLines = ['Your first 3 seconds are quiet. Start on the chorus instead?', 'Most people watch on mute. Want captions on this?', 'Golden hour would suit this light. Try it?', 'The crowd goes up at 12:40. Cut there?'];
  let i = 0; setInterval(() => { i = (i + 1) % topiLines.length; $('topiLine').textContent = topiLines[i]; }, 4200);
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('install').hidden = false; });
  $('install').onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('install').hidden = true; };
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('/sw.js').catch(() => {});
  const splash = $('splash'); splash.classList.add('gone'); setTimeout(() => splash.remove(), 400);
  if (!profile && !location.hash) setTimeout(() => onboarding(), 600);
}
const go = (u) => { location.href = u; };
const newUrl = (size) => `/editor?size=${size}${profile && profile.level ? `&mode=${profile.level}` : ''}`;

function renderTemplates() {
  const makes = (profile && profile.makes) || [];
  const list = [...TEMPLATES].sort((a, b) => (b.tags.some((t) => makes.includes(t)) ? 1 : 0) - (a.tags.some((t) => makes.includes(t)) ? 1 : 0));
  $('tplGrid').innerHTML = list.map((t, i) => `<button class="tpl" data-tpl="${t.id}"><div class="art w${i % 8}">${esc(t.name.toUpperCase())}</div><strong>${esc(t.name)}</strong><small>${esc(t.desc)} ${SIZES[t.size].label}</small></button>`).join('');
  $('tplGrid').querySelectorAll('button').forEach((b) => b.onclick = () => go(`/editor?template=${b.dataset.tpl}${profile && profile.level ? `&mode=${profile.level}` : ''}`));
}

async function renderProjects() {
  const list = await projects.list();
  $('recentSection').hidden = !list.length;
  if (!list.length) return;
  const u = await usage(); if (u.quota) $('storageNote').textContent = `${(u.used / 1048576).toFixed(0)} MB used on this device`;
  const allMedia = new Map((await mediaStore.list()).map((m) => [m.id, m]));
  $('projects').innerHTML = list.map((p) => {
    const first = p.tracks.flatMap((t) => t.clips).map((c) => allMedia.get(c.mediaId)).find((m) => m && m.thumb);
    const dur = Math.max(0, ...p.tracks.flatMap((t) => t.clips.map((c) => c.start + c.duration)));
    return `<div class="proj" data-id="${p.id}" tabindex="0"><div class="th" style="${first ? `background-image:url(${first.thumb})` : ''}">${first ? '' : '<i data-icon="video" data-size="28"></i>'}</div><div class="meta"><strong>${esc(p.name)}</strong><small>${p.w}×${p.h} · ${Math.round(dur)} s · ${ago(p.updated)}</small></div><div class="menu"><button data-dup="${p.id}">Copy</button><button data-del="${p.id}">Delete</button></div></div>`;
  }).join('');
  hydrate($('projects'));
  $('projects').querySelectorAll('.proj').forEach((el) => { el.onclick = (e) => { if (e.target.closest('button')) return; go(`/editor?id=${el.dataset.id}`); }; el.onkeydown = (e) => { if (e.key === 'Enter') go(`/editor?id=${el.dataset.id}`); }; });
  $('projects').querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (confirm('Delete this project?')) { await projects.del(b.dataset.del); renderProjects(); } });
  $('projects').querySelectorAll('[data-dup]').forEach((b) => b.onclick = async () => { const p = await projects.get(b.dataset.dup); p.id = Math.random().toString(36).slice(2, 10); p.name += ' copy'; p.created = Date.now(); await projects.put(p); renderProjects(); });
}
const ago = (t) => { const d = (Date.now() - t) / 1000; return d < 60 ? 'just now' : d < 3600 ? `${Math.floor(d / 60)} min ago` : d < 86400 ? `${Math.floor(d / 3600)} h ago` : `${Math.floor(d / 86400)} d ago`; };

function sheet(html) { const s = $('sheet'); s.innerHTML = `<button class="close" aria-label="Close">×</button>${html}`; s.hidden = false; $('backdrop').hidden = false; s.querySelector('.close').onclick = closeSheet; $('backdrop').onclick = closeSheet; return s; }
function closeSheet() { $('sheet').hidden = true; $('backdrop').hidden = true; }

// Four screens: name, what you make, where you post, how you edit. Then terms.
function onboarding(done) {
  const p = { name: '', makes: [], posts: [], level: 'standard', ...(profile || {}) };
  let step = 0;
  const steps = [
    () => `<h3>What should Topi call you?</h3><p class="muted">Topi is the assistant inside Topier.</p><input type="text" id="obName" value="${esc(p.name)}" placeholder="Your name or act" maxlength="40" style="margin:14px 0 4px">`,
    () => `<h3>What do you make?</h3><p class="muted">Pick everything that fits. Templates and tips follow it.</p><div class="ob-grid">${ONBOARD.makes.map((m) => `<button data-m="${m.id}" class="${p.makes.includes(m.id) ? 'on' : ''}"><span class="em">${m.emoji}</span>${m.name}</button>`).join('')}</div>`,
    () => `<h3>Where do you post?</h3><p class="muted">Sets the default size and export presets.</p><div class="ob-grid">${ONBOARD.posts.map((m) => `<button data-p="${m.id}" class="${p.posts.includes(m.id) ? 'on' : ''}">${m.name}<small>${SIZES[m.size].label}</small></button>`).join('')}</div>`,
    () => `<h3>How do you like to edit?</h3><div class="ob-grid" style="grid-template-columns:1fr">${ONBOARD.levels.map((l) => `<button data-l="${l.id}" class="${p.level === l.id ? 'on' : ''}">${l.name}<small>${l.desc}</small></button>`).join('')}</div>
      <label class="check"><input type="checkbox" id="obTerms"> I am 13 or older (16 in the EU) and I accept the <a href="/terms" style="color:var(--accent-2)">Terms</a> and <a href="/privacy" style="color:var(--accent-2)">Privacy Policy</a>. Topi is AI and can be wrong; nothing is applied without my tap.</label>
      <label class="check"><input type="checkbox" id="obMail"> Email me product news. Optional.</label>`,
  ];
  const render = () => {
    const s = sheet(`${steps[step]()}<div class="acts">${step > 0 ? '<button class="btn ghost" id="obBack">Back</button>' : ''}${step >= 2 ? '<button class="link" id="obSkip">Skip</button>' : ''}<button class="btn big" id="obNext" style="padding:12px 22px;font-size:15px">${step === steps.length - 1 ? 'Start editing' : 'Next'}</button></div>`);
    s.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { const id = b.dataset.m; p.makes = p.makes.includes(id) ? p.makes.filter((x) => x !== id) : [...p.makes, id]; b.classList.toggle('on'); });
    s.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { const id = b.dataset.p; p.posts = p.posts.includes(id) ? p.posts.filter((x) => x !== id) : [...p.posts, id]; b.classList.toggle('on'); });
    s.querySelectorAll('[data-l]').forEach((b) => b.onclick = () => { p.level = b.dataset.l; s.querySelectorAll('[data-l]').forEach((x) => x.classList.toggle('on', x === b)); });
    const back = s.querySelector('#obBack'); if (back) back.onclick = () => { step--; render(); };
    const skip = s.querySelector('#obSkip'); if (skip) skip.onclick = finish;
    s.querySelector('#obNext').onclick = () => {
      if (step === 0) { p.name = s.querySelector('#obName').value.trim(); }
      if (step === steps.length - 1) { if (!s.querySelector('#obTerms').checked) { s.querySelector('#obTerms').focus(); s.querySelector('.check').style.color = 'var(--bad)'; return; } p.mail = s.querySelector('#obMail').checked; return finish(); }
      step++; render();
    };
    const nameIn = s.querySelector('#obName'); if (nameIn) { nameIn.focus(); nameIn.onkeydown = (e) => { if (e.key === 'Enter') s.querySelector('#obNext').click(); }; }
  };
  async function finish() {
    const post = ONBOARD.posts.find((x) => p.posts.includes(x.id));
    p.size = post ? post.size : 'reels'; p.acceptedAt = p.acceptedAt || Date.now();
    profile = p; await settings.set('profile', p); closeSheet();
    renderTemplates();
    if (done) done();
  }
  render();
}

boot();
