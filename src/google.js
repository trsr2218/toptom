// Google sign-in on our own page: Google's button and its One Tap card hand back an ID token,
// and Supabase checks it against a nonce. Google is set up once per page, however many sheets open.
import * as auth from './auth.js';

const GSI_SRC = 'https://accounts.google.com/gsi/client';
const RENDER_TIMEOUT_MS = 4000; // how long Google's button gets to appear before ours takes its place
const listeners = new Set();
let loader = null, ready = null, prompted = false;

// Google refuses to sign anyone in from inside another app's built-in browser.
export const inAppBrowser = () => /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Twitter|TikTok|BytedanceWebview|Snapchat|; wv\)|WebView/i.test(navigator.userAgent || '');

// listen({ busy(on), done(), fail(error) }): hear what Google answered. Returns the way to stop listening.
export function listen(l) { listeners.add(l); return () => listeners.delete(l); }
const tell = (k, v) => listeners.forEach((l) => { try { l[k] && l[k](v); } catch (e) { console.error(e); } });

function load() {
  if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve();
  loader ??= new Promise((res, rej) => { const s = document.createElement('script'); s.src = GSI_SRC; s.async = true; s.onload = res; s.onerror = () => { loader = null; rej(new Error('Google sign-in failed to load')); }; document.head.appendChild(s); });
  return loader;
}
async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Resolves false when Google cannot be used here: provider off, no client ID, script blocked, in-app browser.
function setUp() {
  ready ??= (async () => {
    await auth.init();
    const id = auth.googleClientId();
    if (!id || inAppBrowser() || !(await auth.googleEnabled())) return false;
    await load();
    if (!(window.google && window.google.accounts && window.google.accounts.id)) return false;
    const raw = crypto.randomUUID().replace(/-/g, ''), hashed = await sha256Hex(raw);
    window.google.accounts.id.initialize({
      client_id: id, nonce: hashed,
      callback: async (r) => {
        if (!r || !r.credential) return;
        tell('busy', true);
        try { await auth.signInGoogleToken(r.credential, raw); tell('done'); } catch (e) { tell('fail', e); } finally { tell('busy', false); }
      },
      use_fedcm_for_prompt: true, use_fedcm_for_button: true, itp_support: true, cancel_on_tap_outside: false, context: 'signin', ux_mode: 'popup',
    });
    return true;
  })().catch(() => { ready = null; return false; });
  return ready;
}

// The One Tap card, once per page load, and only for someone who is signed out.
export async function oneTap() {
  if (prompted || !(await setUp()) || auth.currentUser()) return;
  prompted = true;
  try { window.google.accounts.id.prompt(); } catch {}
}

// Draw Google's own button into host. Resolves true once it is on screen, false if it never came.
export async function button(host) {
  if (!(await setUp()) || !host.isConnected) return false;
  return new Promise((res) => {
    const seen = () => { if (!host.querySelector('iframe')) return; clearTimeout(timer); obs.disconnect(); res(true); };
    const obs = new MutationObserver(seen);
    const timer = setTimeout(() => { obs.disconnect(); res(false); }, RENDER_TIMEOUT_MS);
    obs.observe(host, { childList: true, subtree: true });
    try {
      const width = Math.max(200, Math.min(400, Math.floor(host.getBoundingClientRect().width || 320)));
      window.google.accounts.id.renderButton(host, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', logo_alignment: 'center', width });
      seen();
    } catch { clearTimeout(timer); obs.disconnect(); res(false); }
  });
}
