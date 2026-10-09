// Topi's brain: a Vercel serverless function. Holds the Anthropic key, counts usage, calls Claude.
// Set ANTHROPIC_API_KEY in the Vercel project. Optional: TOPI_MODEL (default claude-haiku-5-5),
// TOPI_DAILY_PER_IP (default 60).

const MODEL = process.env.TOPI_MODEL || 'claude-haiku-5-5';
const DAILY = Number(process.env.TOPI_DAILY_PER_IP || 60);
const counts = new Map(); // best effort per instance; a KV store takes over when accounts land

const ACTIONS = `add_text{preset,text} | apply_look{look,clipId?} | add_captions{} | add_music{style} | best_moment{clipId,length} |
set_transitions{trans} | split_at{t} | remove_clip{clipId} | set_speed{clipId,speed} | mute_clip{clipId} | resize{size} |
set_mode{mode} | open_export{} | open_upload{} | set_duration{clipId,duration} | duck{on}`;

const SYSTEM = `You are Topi, the assistant inside Topier, a browser video editor for artists, creators and small businesses.
Personality: warm, short, practical, like a friend who edits. Never lecture. One suggestion at a time. Plain words. No em dashes.
You receive the user's project as JSON (tracks, clips, times) and their profile (what they make, where they post, level).
Answer the question or propose the single best next move for THIS project. Keep replies under 60 words.
If an action would help, include it in "actions" using only these commands: ${ACTIONS}
Looks: none clean warm golden moody film kodak tealorange noir neon vintage crisp. Transitions: none fade dissolve slide-left slide-up zoom wipe blur flash.
Text presets: title subtitle lower handle outline caption script serif marker date. Sizes: reels square portrait landscape. Music styles: chill hype amapiano cinematic.
Reply ONLY with JSON: {"reply": string, "actions": [{"type": string, ...params}]}`;

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'Topi is not configured on this server.' });
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'x';
  const day = new Date().toISOString().slice(0, 10);
  const k = `${day}:${ip}`;
  const n = (counts.get(k) || 0) + 1;
  counts.set(k, n);
  if (counts.size > 5000) counts.clear();
  if (n > DAILY) return res.status(429).json({ error: 'Topi is resting. Back tomorrow.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { message = '', project = {}, history = [], profile = {} } = body || {};
  if (!message || message.length > 1000) return res.status(400).json({ error: 'Say something, under 1000 characters.' });

  const messages = [];
  for (const h of history.slice(-8)) if (h && (h.role === 'user' || h.role === 'assistant') && h.text) messages.push({ role: h.role, content: String(h.text).slice(0, 800) });
  messages.push({ role: 'user', content: `Profile: ${JSON.stringify(profile).slice(0, 600)}\nProject: ${JSON.stringify(project).slice(0, 6000)}\n\nUser: ${message}` });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 400, temperature: 0.4,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages,
      }),
    });
    if (!r.ok) { const t = await r.text(); console.error('anthropic', r.status, t.slice(0, 300)); return res.status(502).json({ error: 'Topi could not think right now.' }); }
    const j = await r.json();
    const text = (j.content || []).map((c) => c.text || '').join('').trim();
    let out;
    try { out = JSON.parse(text.replace(/^```json\s*|```$/g, '')); } catch { out = { reply: text, actions: [] }; }
    if (!out || typeof out.reply !== 'string') out = { reply: text || 'Try that again?', actions: [] };
    out.actions = Array.isArray(out.actions) ? out.actions.filter((a) => a && typeof a.type === 'string').slice(0, 3) : [];
    out.reply = out.reply.replace(/—/g, ',').slice(0, 600);
    return res.status(200).json(out);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Topi could not think right now.' });
  }
}
