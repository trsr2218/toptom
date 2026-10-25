// The account button and sheet, shared by the home page and the editor.
import * as auth from '../auth.js';
import { icon } from '../icons.js';
import * as checkout from './checkout.js';
import * as W from '../wallet.js';
import * as G from '../google.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * mount(button, { sheet, closeSheet, toast, compact })
 * button: the element to render the sign-in button or avatar into.
 * sheet(html) must return the sheet element; closeSheet() hides it.
 */
export function mount(button, { sheet, closeSheet, toast = () => {}, compact = false, oneTap = false, onChange = () => {} }) {
  const render = (user, plan) => {
    if (!auth.available()) { button.hidden = true; return; }
    button.hidden = false;
    if (user) {
      button.innerHTML = user.avatar ? `<img src="${esc(user.avatar)}" alt="" referrerpolicy="no-referrer">` : `<span>${esc(auth.initial(user))}</span>`;
      button.className = 'avatar'; button.title = user.email;
      button.onclick = () => accountSheet(user, plan);
    } else {
      button.innerHTML = compact ? icon('lock', 16) : 'Sign in';
      button.className = compact ? 'ib' : 'pill'; button.title = 'Sign in';
      button.onclick = () => signInSheet();
    }
    onChange(user, plan);
  };
  const ui = { sheet, closeSheet, toast, signIn: () => signInSheet() };
  document.addEventListener('topier-open-plans', (e) => checkout.open(ui, (e.detail && e.detail.plan) || 'creator'));
  auth.onChange(render);
  auth.init().then(() => { render(auth.currentUser(), auth.currentPlan()); if (oneTap && !auth.currentUser()) G.oneTap(); });
  // One Tap can answer with no sheet open, so the welcome is said from here.
  G.listen({ done: () => toast('Signed in with Google') });

  // Google on top when it is switched on in Supabase, then any wallet on Base. Email stays as a quiet fallback.
  // Google's own button signs in on this page. If it has not drawn in a few seconds, ours takes over and goes through Supabase.
  const googleSlot = () => `<div class="g-slot" hidden><div class="g-host"></div><button class="btn google" id="auGoogle" type="button" hidden>${googleMark()} Continue with Google</button><p class="tiny muted" id="auInApp" hidden>Google sign-in does not work inside this app's browser. Open topier.store in Chrome or Safari, or use another way below.</p><p class="tiny muted" id="auNoG" hidden>Google sign-in could not load in this browser. Reload to try again, or use another way below.</p><div class="or"><span>or use a wallet</span></div></div>`;
  function wireGoogle(s, msg) {
    const g = s.querySelector('.g-slot'), lead = s.querySelector('#auLead'), host = s.querySelector('.g-host'), own = s.querySelector('#auGoogle');
    const redirect = async () => {
      own.disabled = true; msg('Opening Google...');
      try { await auth.signInGoogle(); } catch (err) { msg(err.message, true); own.disabled = false; }
    };
    own.onclick = redirect;
    const stop = G.listen({
      busy: (on) => { if (!g.isConnected) return stop(); if (on) msg('Signing you in with Google...'); },
      done: () => { if (g.isConnected) closeSheet(); stop(); },
      // Google said yes and our check said no: the redirect asks Google again.
      fail: (e) => { if (!g.isConnected) return stop(); if (!auth.googleRedirectOk()) return msg((e && e.message) || 'Google sign-in did not finish. Try again.', true); host.classList.add('late'); own.hidden = false; redirect(); },
    });
    auth.googleEnabled().then(async (on) => {
      if (!on || !g.isConnected) return;
      g.hidden = false;
      if (lead) lead.textContent = 'Use your Google account or your wallet on Base. No password needed. Your account is created the first time you sign in.';
      if (G.inAppBrowser()) { host.hidden = true; s.querySelector('#auInApp').hidden = false; return; }
      if ((await G.button(host)) || !g.isConnected) return;
      // Not drawn in time. Show the stand-in, but keep watching: on a slow connection the Google button can still arrive.
      const note = s.querySelector('#auNoG'), standIn = auth.googleRedirectOk() ? own : note;
      host.classList.add('late'); standIn.hidden = false;
      const late = setInterval(() => {
        if (!g.isConnected) return clearInterval(late);
        const f = host.querySelector('iframe'); if (!f || f.offsetHeight < 20) return;
        clearInterval(late); host.classList.remove('late'); standIn.hidden = true;
      }, 500);
      setTimeout(() => clearInterval(late), 60000);
    });
  }
  function walletBlock() {
    const ws = W.wallets();
    if (ws.length) return `<div class="list">${ws.map((w) => `<button class="btn big block wbtn" data-w="${w.id}">${w.icon ? `<img src="${w.icon}" alt="" width="22" height="22">` : ''} Continue with ${esc(w.name)}</button>`).join('')}</div>`;
    const here = encodeURIComponent(location.href), host = location.host + location.pathname;
    return `<p class="tiny muted">No wallet in this browser. Open Topier inside your wallet app:</p>
      <div class="list"><a class="btn big block" href="https://go.cb-w.com/dapp?cb_url=${here}">Open in Coinbase Wallet</a><a class="btn block" href="https://metamask.app.link/dapp/${host}">Open in MetaMask</a></div>`;
  }
  function wireWallet(s, msg) {
    s.querySelectorAll('[data-w]').forEach((b) => b.onclick = async () => {
      const w = W.wallets().find((x) => x.id === b.dataset.w); if (!w) return;
      b.disabled = true; msg('Approve the sign-in in your wallet. It is a signature only, it costs nothing.');
      try { await auth.signInWallet(w.provider); closeSheet(); toast('Signed in with your wallet'); }
      catch (e) { msg(W.friendlyError(e), true); } finally { b.disabled = false; }
    });
  }

  function signInSheet(mode = 'link') {
    const s = sheet(`<h3>Sign in to Topier</h3><p class="muted" id="auLead">Use your wallet on Base. No password, no email needed. Your account is created the first time you sign in.</p>
      ${googleSlot()}
      ${walletBlock()}
      <ul class="facts tiny" style="margin:12px 0"><li>You sign a short message that proves the wallet is yours.</li><li>Signing moves no funds and costs no gas.</li></ul>
      <details class="manual" ${mode === 'password' ? 'open' : ''}><summary>Use email instead</summary>
      <form id="auForm">
        <label class="f">Email<input type="email" id="auEmail" required autocomplete="email" placeholder="you@example.com"></label>
        ${mode === 'password' ? `<label class="f">Password<input type="password" id="auPass" required minlength="6" autocomplete="current-password" placeholder="At least 6 characters"></label>` : ''}
        <button class="btn big block" id="auGo" type="submit">${mode === 'password' ? 'Sign in' : 'Email me a sign-in link'}</button>
      </form>
      <p class="tiny muted" style="margin-top:10px">${mode === 'password' ? '<button class="link" id="auLink" type="button">Use a sign-in link instead</button> · <button class="link" id="auSignup" type="button">Create an account</button>' : 'No password to remember. <button class="link" id="auPwd" type="button">Use a password instead</button>'}</p>
      </details>
      <p class="tiny" id="auMsg" aria-live="polite"></p>
      <p class="tiny muted">By continuing you accept the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>`);
    const msg = (t, err) => { const m = s.querySelector('#auMsg'); m.textContent = t; m.style.color = err ? 'var(--bad)' : ''; };
    wireGoogle(s, msg); wireWallet(s, msg);
    s.querySelector('#auForm').onsubmit = async (e) => {
      e.preventDefault(); const email = s.querySelector('#auEmail').value.trim(); const go = s.querySelector('#auGo'); go.disabled = true;
      try {
        if (mode === 'password') { await auth.signInPassword(email, s.querySelector('#auPass').value); closeSheet(); toast('Signed in'); }
        else { await auth.signInEmail(email); msg(`Check ${email} for your sign-in link. It works on this device.`); }
      } catch (err) { msg(err.message, true); } finally { go.disabled = false; }
    };
    const pwd = s.querySelector('#auPwd'); if (pwd) pwd.onclick = () => signInSheet('password');
    const link = s.querySelector('#auLink'); if (link) link.onclick = () => signInSheet('link');
    const su = s.querySelector('#auSignup'); if (su) su.onclick = () => signUpSheet();
  }

  function signUpSheet() {
    const s = sheet(`<h3>Create your account</h3><p class="muted">Or <button class="link" id="auBack" type="button">sign in</button> if you already have one.</p>
      ${googleSlot()}
      ${walletBlock()}
      <div class="or"><span>or with email</span></div>
      <form id="auForm">
        <label class="f">Name<input id="auName" maxlength="60" placeholder="Your name or act" autocomplete="name"></label>
        <label class="f">Email<input type="email" id="auEmail" required autocomplete="email"></label>
        <label class="f">Password<input type="password" id="auPass" required minlength="6" autocomplete="new-password" placeholder="At least 6 characters"></label>
        <button class="btn big block" id="auGo" type="submit">Create account</button>
      </form>
      <p class="tiny muted" id="auMsg" aria-live="polite"></p>
      <p class="tiny muted">By continuing you accept the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>. You must be 13 or older, 16 in the EU.</p>`);
    const msg = (t, err) => { const m = s.querySelector('#auMsg'); m.textContent = t; m.style.color = err ? 'var(--bad)' : ''; };
    s.querySelector('#auBack').onclick = () => signInSheet('password');
    wireGoogle(s, msg); wireWallet(s, msg);
    s.querySelector('#auForm').onsubmit = async (e) => {
      e.preventDefault(); const go = s.querySelector('#auGo'); go.disabled = true;
      try {
        const done = await auth.signUpPassword(s.querySelector('#auEmail').value.trim(), s.querySelector('#auPass').value, s.querySelector('#auName').value.trim());
        if (done) { closeSheet(); toast('Welcome to Topier'); } else msg('Almost there. Check your inbox and tap the link to confirm your email.');
      } catch (err) { msg(err.message, true); } finally { go.disabled = false; }
    };
  }

  function accountSheet(user, plan) {
    const s = sheet(`<h3>Your account</h3>
      <div class="acct"><div class="avatar big">${user.avatar ? `<img src="${esc(user.avatar)}" alt="" referrerpolicy="no-referrer">` : esc(auth.initial(user))}</div><div><strong>${esc(user.name || user.email)}</strong><br><span class="muted ${user.wallet ? 'mono' : ''}">${esc(user.wallet || user.email)}</span><br><span class="chip on">${auth.planName(plan)} plan</span></div></div>
      <ul class="facts" style="margin:14px 0">
        <li><strong>Projects</strong> save to the cloud as you edit. Media stays on the device it was added on.</li>
        <li><strong>Topi</strong> ${plan === 'free' ? 'guides you, 15 messages a day.' : 'guides and applies changes for you.'}</li>
        <li><strong>Exports</strong> ${plan === 'free' ? 'carry a small Topier mark.' : plan === 'creator' ? 'have no watermark.' : 'have no watermark, and go up to 4K at the bitrate you choose.'}</li>
        ${plan === 'pro' || plan === 'studio' ? `<li><strong>Autopilot</strong> edits a whole video from one prompt. Premium looks and ${plan === 'studio' ? 'unlimited' : '3'} brand kits are on.</li>` : ''}
        ${plan === 'studio' ? '<li><strong>Whole-event mode</strong> is under Project in the editor. <strong>Priority help:</strong> <a href="mailto:getitdonerapid@gmail.com?subject=Topier%20Studio%20priority%20help">email us</a> and you go to the front of the queue.</li>' : ''}
      </ul>
      <p class="tiny muted" id="auSub"></p>
      <div class="row" style="gap:8px;flex-wrap:wrap">${plan === 'studio' ? '' : '<button class="btn big" id="auUp">' + (plan === 'free' ? 'Upgrade' : 'Change or extend plan') + '</button>'}<a class="btn" href="/">Your projects</a><button class="btn" id="auSetup">Your setup</button><a class="btn" id="auWallet" href="/wallet" hidden>Topier wallet</a><button class="btn ghost" id="auOut">Sign out</button></div>
      <p class="tiny muted" style="margin-top:14px"><button class="link" id="auDelete" type="button" style="color:var(--bad)">Delete my account and data</button></p>`);
    s.querySelector('#auOut').onclick = async () => { await auth.signOut(); closeSheet(); toast('Signed out'); };
    s.querySelector('#auSetup').onclick = () => { closeSheet(); document.dispatchEvent(new CustomEvent('topier-open-setup')); };
    const up = s.querySelector('#auUp'); if (up) up.onclick = () => checkout.open(ui, plan === 'free' ? 'creator' : plan);
    auth.subscription().then((sub) => { const el = s.querySelector('#auSub'); if (el && sub && sub.paid_until) el.textContent = (Date.parse(sub.paid_until) > Date.now() ? 'Paid until ' : 'Expired on ') + new Date(sub.paid_until).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) + '. Pay again any time to extend.'; });
    auth.isOwner().then((o) => { const w = s.querySelector('#auWallet'); if (w && o) w.hidden = false; });
    s.querySelector('#auDelete').onclick = async () => {
      if (!confirm('Delete your account and every project saved to it? Projects on this device stay here. This cannot be undone.')) return;
      try { await auth.deleteAccount(); closeSheet(); toast('Account deleted'); } catch (e) { toast(e.message, true); }
    };
  }
}

function googleMark() {
  return '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.7 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7z"/><path fill="#34A853" d="M24 48c6.3 0 11.7-2.1 15.6-5.7l-7.7-6c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';
}
