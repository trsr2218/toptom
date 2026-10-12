// Accounts: Google one tap or an email link, on the shared Diyama Supabase project.
// Without configuration Topier stays local-only and every call here is a harmless no-op.
import { settings } from './store.js';

let sbCfg = null, googleOn = null;
let client = null, user = null, plan = 'free', profile = null, ready = null;
const listeners = new Set();
const PLAN_KEY = 'topier-plan';

async function loadConfig() {
  if (window.TOPIER_CONFIG && window.TOPIER_CONFIG.supabaseUrl) return window.TOPIER_CONFIG;
  try { const r = await fetch('/api/config', { cache: 'force-cache' }); if (r.ok) return await r.json(); } catch {}
  return {};
}
function loadLib() {
  if (window.supabase) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/vendor/sbjs/supabase.js'; s.onload = res; s.onerror = () => rej(new Error('supabase-js failed to load')); document.head.appendChild(s); });
}

export function init() {
  ready ??= (async () => {
    const cfg = await loadConfig();
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return false;
    sbCfg = cfg;
    await loadLib();
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    const { data } = await client.auth.getSession();
    await setSession(data.session);
    client.auth.onAuthStateChange((_evt, session) => { setSession(session); });
    return true;
  })().catch((e) => { console.warn('auth unavailable', e); return false; });
  return ready;
}

async function setSession(session) {
  const md = (session && session.user && session.user.user_metadata) || {};
  const wallet = md.wallet || '';
  const u = session && session.user ? { id: session.user.id, email: wallet ? '' : session.user.email || '', wallet, name: md.full_name || md.name || (wallet ? wallet.slice(0, 6) + '…' + wallet.slice(-4) : ''), avatar: md.avatar_url || '' } : null;
  const changed = (u && u.id) !== (user && user.id);
  user = u;
  if (user) {
    try { const { data } = await client.rpc('topier_my_plan'); plan = typeof data === 'string' && data ? data : 'free'; } catch { plan = 'free'; }
    try { localStorage.setItem(PLAN_KEY, plan); } catch {}
    await syncProfile();
  } else {
    plan = 'free';
    try { localStorage.removeItem(PLAN_KEY); } catch {}
    profile = null;
  }
  for (const fn of listeners) { try { fn(user, plan); } catch (e) { console.error(e); } }
  if (changed) document.dispatchEvent(new CustomEvent('topier-auth', { detail: { user, plan } }));
}

// Local onboarding answers and the cloud profile meet here: the newer wins, both get the result.
async function syncProfile() {
  const local = (await settings.get('profile', null)) || null;
  try {
    const { data } = await client.from('topier_profiles').select('*').eq('user_id', user.id).maybeSingle();
    profile = data || null;
  } catch { profile = null; }
  if (!profile) {
    const row = { user_id: user.id, email: user.email, name: (local && local.name) || user.name || '', makes: (local && local.makes) || [], posts: (local && local.posts) || [], level: (local && local.level) || 'standard', mail: !!(local && local.mail), accepted_at: local && local.acceptedAt ? new Date(local.acceptedAt).toISOString() : null };
    try { const { data } = await client.from('topier_profiles').upsert(row).select().maybeSingle(); profile = data || row; } catch { profile = row; }
  } else if (!local) {
    await settings.set('profile', { name: profile.name || '', makes: profile.makes || [], posts: profile.posts || [], level: profile.level || 'standard', mail: !!profile.mail, acceptedAt: profile.accepted_at ? Date.parse(profile.accepted_at) : Date.now(), size: 'reels' });
  }
}

export async function saveProfile(p) {
  if (!client || !user) return;
  try { await client.from('topier_profiles').upsert({ user_id: user.id, email: user.email, name: p.name || '', makes: p.makes || [], posts: p.posts || [], level: p.level || 'standard', mail: !!p.mail, accepted_at: p.acceptedAt ? new Date(p.acceptedAt).toISOString() : null }); } catch (e) { console.warn(e); }
}

export const available = () => !!client;
// Is Google sign-in switched on in Supabase? Asked once, so the button never leads nowhere.
export async function googleEnabled() {
  if (googleOn !== null) return googleOn;
  try { const r = await fetch(`${sbCfg.supabaseUrl}/auth/v1/settings`, { headers: { apikey: sbCfg.supabaseAnonKey } }); const j = await r.json(); googleOn = !!(j.external && j.external.google); } catch { googleOn = false; }
  return googleOn;
}
export const currentUser = () => user;
export const currentPlan = () => plan;
// Re-read the plan after a payment, and tell everyone listening.
export async function refreshPlan() {
  if (!client || !user) return plan;
  try { const { data } = await client.rpc('topier_my_plan'); plan = typeof data === 'string' && data ? data : 'free'; } catch {}
  try { localStorage.setItem(PLAN_KEY, plan); } catch {}
  for (const fn of listeners) { try { fn(user, plan); } catch {} }
  return plan;
}
export async function subscription() { if (!client || !user) return null; try { const { data } = await client.rpc('topier_my_subscription'); return (data && data[0]) || null; } catch { return null; } }
export async function isOwner() { if (!client || !user) return false; try { const { data } = await client.rpc('topier_is_owner'); return data === true; } catch { return false; } }
export function onChange(fn) { listeners.add(fn); if (ready) ready.then(() => fn(user, plan)); return () => listeners.delete(fn); }
export async function token() { if (!client) return null; const { data } = await client.auth.getSession(); return data.session ? data.session.access_token : null; }

export async function signInGoogle() {
  if (!client) throw new Error('Accounts are not set up on this server yet.');
  const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/', queryParams: { prompt: 'select_account' } } });
  if (error) throw new Error(friendly(error.message));
}
// Sign in with a wallet on Base: the wallet signs a one-time message, the server checks it on chain
// and hands back a session. Signing moves nothing and costs nothing.
export async function signInWallet(provider) {
  if (!client) throw new Error('Accounts are not set up on this server yet.');
  const [address] = await provider.request({ method: 'eth_requestAccounts' });
  if (!address) throw new Error('No account was shared.');
  const post = (body) => fetch('/api/siwe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Wallet sign-in failed.'); return j; });
  const { message } = await post({ action: 'nonce', address });
  const hex = '0x' + Array.from(new TextEncoder().encode(message)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const signature = await provider.request({ method: 'personal_sign', params: [hex, address] });
  const s = await post({ action: 'verify', message, signature });
  const { error } = await client.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
  if (error) throw new Error(friendly(error.message));
  return s.address;
}
export async function signInEmail(email) {
  if (!client) throw new Error('Accounts are not set up on this server yet.');
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + '/', data: { app: 'topier' } } });
  if (error) throw new Error(friendly(error.message));
}
export async function signUpPassword(email, password, name) {
  if (!client) throw new Error('Accounts are not set up on this server yet.');
  const { data, error } = await client.auth.signUp({ email, password, options: { data: { app: 'topier', name }, emailRedirectTo: location.origin + '/' } });
  if (error) throw new Error(friendly(error.message));
  return !!(data.session); // false means "confirm your email first"
}
export async function signInPassword(email, password) {
  if (!client) throw new Error('Accounts are not set up on this server yet.');
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendly(error.message));
}
export async function signOut() { if (client) await client.auth.signOut(); }
export async function deleteAccount() {
  if (!client || !user) return;
  const { error } = await client.rpc('topier_delete_me');
  if (error) throw new Error(friendly(error.message));
  await client.auth.signOut();
}

// ---------- cloud projects ----------
export async function pushProject(p) {
  if (!client || !user) return;
  const data = JSON.parse(JSON.stringify(p, (k, v) => (k === '_phrases' || k === 'history' ? undefined : v)));
  const duration = Math.max(0, ...p.tracks.flatMap((t) => t.clips.map((c) => c.start + c.duration)));
  try { await client.from('topier_projects').upsert({ id: p.id, user_id: user.id, name: p.name, w: p.w, h: p.h, duration, data, updated_at: new Date(p.updated || Date.now()).toISOString() }); } catch (e) { console.warn('cloud save failed', e); }
}
export async function pullProjects() {
  if (!client || !user) return [];
  try { const { data } = await client.from('topier_projects').select('id,name,w,h,duration,data,updated_at').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(200); return (data || []).map((r) => ({ ...r.data, id: r.id, updated: Date.parse(r.updated_at) })); } catch { return []; }
}
export async function deleteCloudProject(id) { if (client && user) { try { await client.from('topier_projects').delete().eq('id', id); } catch {} } }

function friendly(m) {
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Could not reach the sign-in service. Check your connection and try again.';
  if (/rate limit|too many/i.test(m)) return 'Too many tries. Wait a minute and try again.';
  if (/Invalid login/i.test(m)) return 'Wrong email or password.';
  if (/already registered/i.test(m)) return 'That email already has an account. Sign in instead.';
  if (/Password should be/i.test(m)) return 'Use a password of at least 6 characters.';
  if (/not enabled|provider/i.test(m)) return 'That sign-in method is not switched on yet.';
  return m;
}

export const initial = (u) => (u && u.wallet ? u.wallet.slice(2, 3).toUpperCase() : ((u && (u.name || u.email)) || '?').trim().charAt(0).toUpperCase());
export const planName = (p) => ({ free: 'Free', creator: 'Creator', pro: 'Pro', studio: 'Studio' }[p] || 'Free');
