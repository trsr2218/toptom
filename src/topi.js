// Topi: the assistant. Reads the project as data, suggests one next move, and on request applies it
// through the editor's command list. Guide answers come from Claude via /api/topi when the server is
// configured, with a local rule-based fallback so Topi always answers something useful.
import { summarize, projectDuration, trackOf } from './model.js';

export const LIMITS = { free: { guide: 15, copilot: 0 }, creator: { guide: 100, copilot: 30 }, pro: { guide: 300, copilot: 1e9 }, studio: { guide: 300, copilot: 1e9 } };

const dayKey = () => 'topi-' + new Date().toISOString().slice(0, 10);
export function usedToday() { try { return JSON.parse(localStorage.getItem(dayKey()) || '{"guide":0,"copilot":0}'); } catch { return { guide: 0, copilot: 0 }; } }
function bump(kind) { const u = usedToday(); u[kind] = (u[kind] || 0) + 1; try { localStorage.setItem(dayKey(), JSON.stringify(u)); } catch {} return u; }
export function plan() { try { return localStorage.getItem('topier-plan') || 'free'; } catch { return 'free'; } }
export function leftToday(kind) { return Math.max(0, (LIMITS[plan()] || LIMITS.free)[kind] - (usedToday()[kind] || 0)); }

// ---------- local guide: rules over the project ----------
export function suggest(project, ctx = {}) {
  const out = [];
  const v = trackOf(project, 'video'), tx = trackOf(project, 'text'), mu = trackOf(project, 'audio');
  const dur = projectDuration(project);
  const clips = v.clips, texts = tx.clips.filter((c) => c.type === 'text'), caps = tx.clips.filter((c) => c.type === 'caption');
  if (!clips.length) return [{ id: 'first', text: 'Start by adding a video or some photos. Tap Upload, or drop files anywhere on this page.', action: { type: 'open_upload' } }];
  const long = clips.find((c) => c.duration > 45);
  if (long && clips.length === 1) out.push({ id: 'trim', text: `Your clip is ${Math.round(long.duration)} seconds. Short videos get watched to the end. I can cut it to the loudest 30 seconds.`, action: { type: 'best_moment', clipId: long.id, length: 30 } });
  if (!texts.length) out.push({ id: 'name', text: 'There is no name on it yet. Add a big title so people know who this is.', action: { type: 'add_text', preset: 'title', text: ctx.name ? ctx.name.toUpperCase() : 'YOUR NAME' } });
  const speech = clips.some((c) => c.type === 'video' && !c.muted && c.volume > 0);
  if (speech && !caps.length) out.push({ id: 'captions', text: 'Most people watch with the sound off. Want captions? I can write them from the audio.', action: { type: 'add_captions' } });
  if (!mu.clips.length && !speech) out.push({ id: 'music', text: 'It is silent. Add a beat under it, I have a few that fit.', action: { type: 'add_music', style: ctx.makes && ctx.makes.includes('music') ? 'hype' : 'chill' } });
  if (clips.every((c) => !c.look || c.look === 'none')) out.push({ id: 'look', text: 'One tap of a look makes phone footage feel finished. Try Golden hour.', action: { type: 'apply_look', look: 'golden' } });
  if (clips.length > 1 && clips.slice(1).every((c) => !c.transIn || c.transIn.type === 'none')) out.push({ id: 'trans', text: 'Your cuts are hard cuts. A quick dissolve between clips feels smoother.', action: { type: 'set_transitions', trans: 'dissolve' } });
  if (dur > 90) out.push({ id: 'long', text: `At ${Math.round(dur)} seconds this is long for Reels and TikTok. Aim for under 60.`, action: null });
  if (project.w > project.h && ctx.posts && ctx.posts.some((p) => ['instagram', 'tiktok', 'whatsapp'].includes(p))) out.push({ id: 'vertical', text: 'This is landscape, but you post on vertical apps. Switch to 9:16 and I will refit everything.', action: { type: 'resize', size: 'reels' } });
  if (!out.length) out.push({ id: 'export', text: 'Looks ready to me. Export it for the app you post on most.', action: { type: 'open_export' } });
  return out;
}

const FAQ = [
  [/add (a )?text|title|name/i, 'Tap Text in the toolbar, pick a style, then type. Drag it on the preview to place it. Double tap to edit.'],
  [/caption|subtitle/i, 'Select a clip with speech, then Captions. Topier listens on your device and writes word by word captions you can edit.'],
  [/music|beat|song/i, 'Tap Music. Pick a generated beat or upload your own track. Music dips automatically under speech.'],
  [/trim|cut|shorter|split/i, 'Drag the ends of a clip on the timeline to trim. Put the playhead where you want and tap Split to cut it in two.'],
  [/look|filter|colou?r|grade/i, 'Select a clip, open Looks, tap one. The slider sets how strong it is. The same look applies at export.'],
  [/transition|dissolve|fade/i, 'Select the second clip of a pair and choose a transition in the panel. It plays across the cut.'],
  [/export|download|save|post/i, 'Tap Export, pick the app you are posting to, and wait. The file is made on your device and never uploaded.'],
  [/size|aspect|vertical|square|reframe/i, 'Change the canvas under Project. Clips refit; drag any clip on the preview to reposition.'],
  [/speed|slow|fast/i, 'Select a clip and set Speed in the panel. 0.5 is slow motion, 2 is double speed.'],
  [/logo|brand|watermark/i, 'Brand kit holds your logo, colours and fonts. Add it once, then one tap puts your logo on any video.'],
  [/keyframe|animate|zoom in/i, 'In Pro mode, select a clip, move the playhead and tap the diamond next to Scale or Position to set a keyframe. Move the playhead and set another.'],
  [/undo/i, 'Ctrl+Z undoes, Ctrl+Shift+Z redoes. Every Topi change can be undone too.'],
];

export async function ask(message, project, history, profile = {}) {
  if (leftToday('guide') <= 0) return { reply: 'Topi is resting for today. Your Guide messages reset at midnight. Upgrade for more.', actions: [], limited: true };
  bump('guide');
  try {
    const res = await fetch('/api/topi', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, project: summarize(project), history: history.slice(-8), profile }),
    });
    if (res.ok) { const j = await res.json(); if (j && j.reply) return { reply: j.reply, actions: j.actions || [], remote: true }; }
  } catch {}
  // Local fallback
  const hit = FAQ.find(([re]) => re.test(message));
  if (hit) return { reply: hit[1], actions: [] };
  const s = suggest(project, profile)[0];
  return { reply: `Here is what I would do next: ${s.text}`, actions: s.action ? [s.action] : [] };
}

export const PERSONA = 'Topi';
