// Topi's brain: a Vercel serverless function. Holds the Anthropic key, counts usage, calls Claude.
// Set ANTHROPIC_API_KEY in the Vercel project. Optional: TOPI_MODEL (default claude-haiku-5-5),
// TOPI_DAILY_PER_IP (default 60). With SUPABASE_URL and SUPABASE_ANON_KEY set, a signed-in user's
// token is verified and their daily limit comes from their plan, counted in topier_usage.

const MODEL = process.env.TOPI_MODEL || 'claude-haiku-5-5';
// When someone asks Topi for help directly on a paid plan, the stronger model does the work.
const SMART = process.env.TOPI_MODEL_SMART || 'claude-sonnet-5-5';
const DAILY = Number(process.env.TOPI_DAILY_PER_IP || 60);
const PLAN_LIMITS = { free: 15, creator: 100, pro: 300, studio: 300 };
const counts = new Map(); // best effort per instance, for anonymous callers

const ACTIONS = `add_text{preset,text} | apply_look{look,clipId?} | add_captions{} | add_music{style} | best_moment{clipId,length} |
set_transitions{trans} | split_at{t} | remove_clip{clipId} | set_speed{clipId,speed} | mute_clip{clipId} | resize{size} |
set_mode{mode} | open_export{} | open_upload{} | set_duration{clipId,duration} | duck{on} | add_logo{}`;

const SYSTEM = `You are Topi, the assistant inside Topier, a browser video editor for artists, creators and small businesses.
Personality: warm, short, practical, like a friend who edits. Never lecture. One suggestion at a time. Plain words. No em dashes.
You receive the user's project as JSON (tracks, clips, times) and their profile (what they make, where they post, level).
You also receive their habits: what they reach for most (looks, text styles, beats, transitions, export targets, typical length) and tips they turned down.
Follow their style: prefer what they usually choose, never re-offer a declined tip, and add at most one small improvement idea, phrased lightly.
When they ask for help, help fully: answer the real question, then give every action needed to get it done, in order.
Keep replies under 70 words unless they ask for detail.
If an action would help, include it in "actions" using only these commands: ${ACTIONS}
Looks: none clean warm golden moody film kodak tealorange noir neon vintage crisp. Transitions: none fade dissolve slide-left slide-up zoom wipe blur flash.
Text presets: title subtitle lower handle outline caption script serif marker date. Sizes: reels square portrait landscape. Music styles: chill hype amapiano cinematic.
Reply ONLY with JSON: {"reply": string, "actions": [{"type": string, ...params}]}`;

// Who is calling, from the Supabase token the client sends. Returns { id, email, plan, used } or null.
async function identify(req) {
  const url = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY;
  const auth = req.headers.authorization || '';
  if (!url || !anon || !auth.startsWith('Bearer ')) return null;
  const headers = { apikey: anon, authorization: auth, 'content-type': 'application/json' };
  try {
    const u = await fetch(`${url}/auth/v1/user`, { headers });
    if (!u.ok) return null;
    const user = await u.json();
    const p = await fetch(`${url}/rest/v1/rpc/topier_my_plan`, { method: 'POST', headers, body: '{}' });
    const plan = p.ok ? String(await p.json()).replace(/"/g, '') : 'free';
    const c = await fetch(`${url}/rest/v1/rpc/topier_count_usage`, { method: 'POST', headers, body: JSON.stringify({ kind: 'guide' }) });
    const used = c.ok ? Number(await c.json()) : 0;
    return { id: user.id, email: user.email, plan: PLAN_LIMITS[plan] ? plan : 'free', used };
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'Topi is not configured on this server.' });

  const who = await identify(req);
  if (who) {
    if (who.used > PLAN_LIMITS[who.plan]) return res.status(429).json({ error: 'Topi is resting for today. Your Guide messages reset at midnight.', limited: true });
  } else {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'x';
    const k = `${new Date().toISOString().slice(0, 10)}:${ip}`;
    const n = (counts.get(k) || 0) + 1; counts.set(k, n);
    if (counts.size > 5000) counts.clear();
    if (n > DAILY) return res.status(429).json({ error: 'Topi is resting. Back tomorrow.', limited: true });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { message = '', project = {}, history = [], profile = {}, habits = {}, mode = '' } = body || {};
  const paid = who && who.plan !== 'free';
  const model = mode === 'ask' && paid ? SMART : MODEL;
  if (!message || message.length > 1000) return res.status(400).json({ error: 'Say something, under 1000 characters.' });

  const messages = [];
  for (const h of history.slice(-8)) if (h && (h.role === 'user' || h.role === 'assistant') && h.text) messages.push({ role: h.role, content: String(h.text).slice(0, 800) });
  messages.push({ role: 'user', content: `Profile: ${JSON.stringify({ ...profile, plan: who ? who.plan : 'free' }).slice(0, 600)}\nHabits: ${JSON.stringify(habits).slice(0, 900)}\nProject: ${JSON.stringify(project).slice(0, 6000)}\n\nUser: ${message}` });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model, max_tokens: model === SMART ? 900 : 400,
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
    out.actions = Array.isArray(out.actions) ? out.actions.filter((a) => a && typeof a.type === 'string').slice(0, model === SMART ? 6 : 3) : [];
    out.reply = out.reply.replace(/—/g, ',').slice(0, 600);
    if (who) out.left = Math.max(0, PLAN_LIMITS[who.plan] - who.used);
    return res.status(200).json(out);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Topi could not think right now.' });
  }
}
