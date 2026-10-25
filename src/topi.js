// Topi: the assistant. Reads the project as data, suggests one next move shaped by what this
// person usually does, and on request applies it through the editor's command list. Questions go
// to Claude via /api/topi, with a local rule-based fallback so Topi always answers something useful.
import { summarize, projectDuration, trackOf } from './model.js';
import * as H from './habits.js';
import { lookById, LOOKS } from './looks.js';
import { openTrial, NO_SERVER } from './trial.js';

export const LIMITS = { free: { guide: 15, copilot: 0 }, creator: { guide: 100, copilot: 30 }, pro: { guide: 300, copilot: 1e9 }, studio: { guide: 300, copilot: 1e9 } };

const dayKey = () => 'topi-' + new Date().toISOString().slice(0, 10);
export function usedToday() { try { return JSON.parse(localStorage.getItem(dayKey()) || '{"guide":0,"copilot":0}'); } catch { return { guide: 0, copilot: 0 }; } }
function bump(kind) { const u = usedToday(); u[kind] = (u[kind] || 0) + 1; try { localStorage.setItem(dayKey(), JSON.stringify(u)); } catch {} return u; }
export function plan() { if (openTrial()) return 'studio'; try { const p = localStorage.getItem('topier-plan'); if (p) return p; const ts = Number(localStorage.getItem('topier-trial') || 0); return ts && Date.now() - ts < 7 * 864e5 ? 'pro' : 'free'; } catch { return 'free'; } }
export function leftToday(kind) { return Math.max(0, (LIMITS[plan()] || LIMITS.free)[kind] - (usedToday()[kind] || 0)); }

export const INTRO = {
  text: 'Hi, I am Topi, your editing buddy inside Topier. I can find the best moment in a long video, write captions, pick a look, add a beat, fix the size for each app, and answer any how-to. I learn how you like to edit, so my suggestions get more like you over time, and I keep them small. Ask me anything, or tap a starter.',
  starters: [['Make my first clip', 'How do I make my first clip from a video?'], ['Add captions', 'Add captions to my video'], ['Pick a look', 'Which look would suit this?'], ['How do I export?', 'How do I export for TikTok?']],
};

// ---------- local guide: rules over the project, shaped by the person's habits ----------
export function suggest(project, ctx = {}) {
  const out = [];
  const v = trackOf(project, 'video'), tx = trackOf(project, 'text'), mu = trackOf(project, 'audio');
  const dur = projectDuration(project);
  const clips = v.clips, texts = tx.clips.filter((c) => c.type === 'text'), caps = tx.clips.filter((c) => c.type === 'caption');
  const favLook = H.favourite('look'), favMusic = H.favourite('music'), favTrans = H.favourite('trans'), favText = H.favourite('text'), typical = H.typicalLength();
  if (!clips.length) return [{ id: 'first', text: H.get().sessions > 1 ? 'Ready when you are. Drop in a video or photos and I will take it from there.' : 'Start by adding a video or some photos. Tap Upload, or drop files anywhere on this page.', action: { type: 'open_upload' } }];
  const push = (s) => { if (!H.declined(s.id)) out.push(s); };
  const long = clips.find((c) => c.duration > 45);
  const target = typical && typical < 90 ? typical : 30;
  if (long && clips.length === 1) push({ id: 'trim', text: typical ? `Your clips usually run about ${typical} seconds. Want me to cut this one to its loudest ${target}?` : `Your clip is ${Math.round(long.duration)} seconds. Short videos get watched to the end. I can cut it to the loudest 30 seconds.`, action: { type: 'best_moment', clipId: long.id, length: target } });
  if (!texts.length) push({ id: 'name', text: favText ? 'No title yet. Your usual style?' : 'There is no name on it yet. Add a big title so people know who this is.', action: { type: 'add_text', preset: favText || 'title', text: ctx.name ? ctx.name.toUpperCase() : 'YOUR NAME' } });
  const speech = clips.some((c) => c.type === 'video' && !c.muted && c.volume > 0);
  if (speech && !caps.length) push({ id: 'captions', text: H.used('add_captions') ? 'Captions like last time?' : 'Most people watch with the sound off. Want captions? I can write them from the audio.', action: { type: 'add_captions' } });
  if (!mu.clips.length && !speech) push({ id: 'music', text: favMusic ? `It is silent. Your usual ${favMusic} beat?` : 'It is silent. Add a beat under it, I have a few that fit.', action: { type: 'add_music', style: favMusic || (ctx.makes && ctx.makes.includes('music') ? 'hype' : 'chill') } });
  if (clips.every((c) => !c.look || c.look === 'none')) push({ id: 'look', text: favLook ? `You usually go with ${lookById(favLook).name}. Same here?` : 'One tap of a look makes phone footage feel finished. Try Golden hour.', action: { type: 'apply_look', look: favLook || 'golden' } });
  if (clips.length > 1 && clips.slice(1).every((c) => !c.transIn || c.transIn.type === 'none')) push({ id: 'trans', text: favTrans ? `Add your usual ${favTrans} between clips?` : 'Your cuts are hard cuts. A quick dissolve between clips feels smoother.', action: { type: 'set_transitions', trans: favTrans || 'dissolve' } });
  if (dur > 90) push({ id: 'long', text: `At ${Math.round(dur)} seconds this is long for Reels and TikTok. Aim for under 60.`, action: null });
  if (project.w > project.h && ctx.posts && ctx.posts.some((p) => ['instagram', 'tiktok', 'whatsapp'].includes(p))) push({ id: 'vertical', text: 'This is landscape, but you post on vertical apps. Switch to 9:16 and I will refit everything.', action: { type: 'resize', size: 'reels' } });
  // one small growth nudge toward something they have not tried yet, only once they are settled in
  if (!out.length && H.get().sessions > 2) {
    if (!H.used('add_captions') && speech) push({ id: 'try-captions', text: 'Small idea: captions tend to keep people watching longer. Want to try them once?', action: { type: 'add_captions' } });
    else if (!H.used('set_transitions') && clips.length > 1) push({ id: 'try-trans', text: 'Small idea: a soft dissolve between scenes. Undo is one tap if you do not like it.', action: { type: 'set_transitions', trans: 'dissolve' } });
  }
  if (!out.length) out.push({ id: 'export', text: 'Looks ready to me. Export it for the app you post on most.', action: { type: 'open_export' } });
  return out;
}

const FAQ = [
  [/add (a )?text|title|name/i, 'Tap Text in the toolbar, pick a style, then type. Drag it on the preview to place it. Double tap to edit.'],
  [/caption|subtitle/i, 'Select a clip with speech, then Captions. Topier listens on your device and writes word by word captions you can edit.'],
  [/music|beat|song/i, 'Tap Music. Pick a generated beat or upload your own track. Music dips automatically under speech.'],
  [/trim|cut|shorter|split|first clip/i, 'Drop in your video, then I can cut it to its loudest stretch. Or drag the ends of a clip on the timeline to trim, and tap Split to cut it in two.'],
  [/look|filter|colou?r|grade/i, 'Select a clip, open Looks, tap one. The slider sets how strong it is. The same look applies at export.'],
  [/transition|dissolve|fade/i, 'Select the second clip of a pair and choose a transition in the panel. It plays across the cut.'],
  [/export|download|save|post|tiktok|reels/i, 'Tap Export, pick the app you are posting to, and wait. The file is made on your device and never uploaded.'],
  [/size|aspect|vertical|square|reframe/i, 'Change the canvas under Project. Clips refit; drag any clip on the preview to reposition.'],
  [/speed|slow|fast/i, 'Select a clip and set Speed in the panel. 0.5 is slow motion, 2 is double speed.'],
  [/logo|brand|watermark/i, 'Brand kit holds your logo, colours and fonts. Add it once, then one tap puts your logo on any video.'],
  [/keyframe|animate|zoom in/i, 'In Pro mode, select a clip, move the playhead and tap the diamond next to Scale or Position to set a keyframe. Move the playhead and set another.'],
  [/undo/i, 'Ctrl+Z undoes, Ctrl+Shift+Z redoes. Every Topi change can be undone too.'],
];

export async function ask(message, project, history, profile = {}) {
  if (leftToday('guide') <= 0) return { reply: 'Topi is resting for today. Your messages reset at midnight.', actions: [], limited: true };
  bump('guide');
  if (!NO_SERVER) try {
    let tok = null; try { const a = await import('./auth.js'); tok = await a.token(); } catch {}
    const res = await fetch('/api/topi', {
      method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) },
      body: JSON.stringify({ message, project: summarize(project), history: history.slice(-8), profile, habits: H.summary(), mode: 'ask' }),
    });
    if (res.ok) { const j = await res.json(); if (j && j.reply) return { reply: j.reply, actions: j.actions || [], remote: true }; }
  } catch {}
  // Local fallback
  const hit = FAQ.find(([re]) => re.test(message));
  if (hit) return { reply: hit[1], actions: [] };
  const s = suggest(project, profile)[0];
  return { reply: `Here is what I would do next: ${s.text}`, actions: s.action ? [s.action] : [] };
}

// ---------- Autopilot (Pro and Studio): the whole edit from one prompt ----------
// Asks Claude for the full, ordered list of commands. If the server cannot answer, a local planner
// reads the prompt for the obvious asks and fills the rest from the same rules the tips use.
export async function autopilot(message, project, profile = {}) {
  if (!NO_SERVER) try {
    let tok = null; try { const a = await import('./auth.js'); tok = await a.token(); } catch {}
    const res = await fetch('/api/topi', {
      method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) },
      body: JSON.stringify({ message, project: summarize(project), history: [], profile, habits: H.summary(), mode: 'autopilot' }),
    });
    const j = await res.json().catch(() => null);
    if (res.status === 429 && j) return { reply: j.error, actions: [], limited: true };
    if (res.ok && j && Array.isArray(j.actions) && j.actions.length) return { reply: j.reply || 'Done.', actions: j.actions, remote: true };
  } catch {}
  return localPlan(message, project, profile);
}

export function localPlan(message, project, profile = {}) {
  const q = String(message || '').toLowerCase(), acts = [], did = [];
  const v = trackOf(project, 'video'), first = v.clips.find((c) => c.type === 'video');
  if (!v.clips.length) return { reply: 'Add a video or some photos first, then tell me what to make of them.', actions: [{ type: 'open_upload' }] };
  const size = /square|1:1/.test(q) ? 'square' : /4:5|feed post|portrait/.test(q) ? 'portrait' : /youtube(?! short)|landscape|16:9|wide/.test(q) ? 'landscape' : /reel|tiktok|short|vertical|9:16|status|story/.test(q) ? 'reels' : null;
  if (size) { acts.push({ type: 'resize', size }); did.push('set the size'); }
  const secs = q.match(/(\d{1,3})\s*(?:s\b|sec|second)/);
  if (secs && first && first.duration > +secs[1]) { acts.push({ type: 'best_moment', clipId: first.id, length: Math.max(5, Math.min(180, +secs[1])) }); did.push(`cut to the loudest ${secs[1]} seconds`); }
  const look = LOOKS.find((l) => l.id !== 'none' && (q.includes(l.name.toLowerCase()) || q.includes(l.id)));
  if (look) { acts.push({ type: 'apply_look', look: look.id }); did.push(`applied ${look.name}`); }
  if (/caption|subtitle/.test(q)) { acts.push({ type: 'add_captions' }); did.push('wrote captions'); }
  const style = ['hype', 'chill', 'amapiano', 'cinematic'].find((s) => q.includes(s));
  if (style || /music|beat|song|sound ?track/.test(q)) { acts.push({ type: 'add_music', style: style || H.favourite('music') || 'chill' }); did.push('added a beat'); }
  if (/transition|dissolve|smooth|fade/.test(q) && v.clips.length > 1) { acts.push({ type: 'set_transitions', trans: /fade/.test(q) ? 'fade' : 'dissolve' }); did.push('smoothed the cuts'); }
  if (/logo|brand/.test(q)) { acts.push({ type: 'add_logo' }); did.push('added your logo'); }
  // then whatever the project still lacks, the same way the tips would suggest it
  const have = new Set(acts.map((a) => a.type));
  for (const s of suggest(project, profile)) if (s.action && !['open_export', 'open_upload', 'add_captions'].includes(s.action.type) && !have.has(s.action.type)) { acts.push(s.action); have.add(s.action.type); }
  if (!acts.length) return { reply: 'This already looks finished to me. Export it when you are ready.', actions: [] };
  return { reply: did.length ? `Done: ${did.join(', ')}, plus the finishing touches it was missing.` : 'Done. I gave it the finishing touches it was missing.', actions: acts.slice(0, 12) };
}

export const PERSONA = 'Topi';
