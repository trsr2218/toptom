// Plans and wallet checkout. Pay in USDC on Base, straight to Topier's wallet. No cards, no custody.
import * as auth from '../auth.js';
import * as W from '../wallet.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PLANS = [
  { id: 'creator', name: 'Creator', month: 8, perks: ['No watermark', 'Topi Co-pilot applies changes for you', 'Brand kit and all templates', 'Projects saved to your account'] },
  { id: 'pro', name: 'Pro', month: 18, perks: ['Everything in Creator', 'Topi Autopilot and the smartest Topi', '4K export, custom bitrate', '3 brand kits, premium looks'] },
  { id: 'studio', name: 'Studio', month: 45, perks: ['Everything in Pro', 'Unlimited brand kits', 'Whole-event mode', 'Priority help'] },
];

let cfg = null;
async function config() { if (!cfg) { try { cfg = await (await fetch('/api/config')).json(); } catch { cfg = {}; } } return cfg; }
async function api(body) {
  const tok = await auth.token();
  const r = await fetch('/api/pay', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Payment service error.');
  return j;
}

/** open({ sheet, closeSheet, toast, signIn }) */
export async function open(ui, preselect = 'creator') {
  const c = await config();
  let period = 'month';
  const render = () => {
    const s = ui.sheet(`<h3>Choose your plan</h3>
      <p class="muted">Pay from your crypto wallet in USDC on Base. No card, no bank, no subscription that renews by itself. You pay for a month or a year, and you choose when to pay again.</p>
      <div class="seg"><button data-p="month" class="${period === 'month' ? 'on' : ''}">Monthly</button><button data-p="year" class="${period === 'year' ? 'on' : ''}">Yearly, 2 months free</button></div>
      <div class="plan-pick">${PLANS.map((p) => `<button class="pp ${p.id === preselect ? 'on' : ''}" data-plan="${p.id}"><strong>${p.name}</strong><span class="price">${period === 'year' ? `$${p.month * 10}<small>/year</small>` : `$${p.month}<small>/month</small>`}</span><ul>${p.perks.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></button>`).join('')}</div>
      <div class="trust">
        <div><strong>Wallet to wallet.</strong> Your USDC goes straight to Topier's public wallet on Base. Topier never holds your funds or your keys.</div>
        <div><strong>One exact transfer.</strong> We only ever ask your wallet for a plain transfer of the amount shown. Never an approval, never a signature on a message.</div>
        <div><strong>Checked on chain.</strong> Your plan switches on once Base confirms the payment, usually within a minute.</div>
      </div>
      ${c.payTo ? `<button class="btn big block" id="ckGo">Continue to payment</button>` : `<p class="tiny muted">Wallet payments are being switched on. Your 7 day trial has everything open meanwhile.</p>`}`);
    s.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { period = b.dataset.p; render(); });
    s.querySelectorAll('[data-plan]').forEach((b) => b.onclick = () => { preselect = b.dataset.plan; s.querySelectorAll('[data-plan]').forEach((x) => x.classList.toggle('on', x === b)); });
    const go = s.querySelector('#ckGo');
    if (go) go.onclick = async () => {
      if (!auth.currentUser()) { ui.toast('Sign in first, so the plan lands on your account.'); ui.signIn && ui.signIn(); return; }
      go.disabled = true; go.textContent = 'Preparing...';
      try { const { order } = await api({ action: 'create', plan: preselect, period }); pay(ui, order); }
      catch (e) { go.disabled = false; go.textContent = 'Continue to payment'; ui.toast(e.message, true); }
    };
  };
  render();
}

function pay(ui, order) {
  const plan = PLANS.find((p) => p.id === order.plan);
  const ws = W.wallets();
  const s = ui.sheet(`<h3>Pay ${order.amount.replace(/0+$/, '').replace(/\.$/, '')} USDC</h3>
    <p class="muted">${plan.name}, ${order.period === 'year' ? 'one year' : 'one month'}. The odd cents identify your payment, please send this exact amount.</p>
    <div class="paybox">
      <div class="row between"><span class="muted">Amount</span><strong class="mono">${order.amount} USDC</strong></div>
      <div class="row between"><span class="muted">Network</span><strong>Base</strong></div>
      <div class="row between"><span class="muted">To</span><a class="mono" href="${W.BASE.explorer}/address/${order.payTo}" target="_blank" rel="noopener">${W.short(order.payTo)}</a></div>
    </div>
    ${ws.length ? `<div class="list">${ws.map((w) => `<button class="btn block wbtn" data-w="${w.id}">${w.icon ? `<img src="${w.icon}" alt="" width="20" height="20">` : ''} Pay with ${esc(w.name)}</button>`).join('')}</div>` : `<p class="tiny muted">No wallet in this browser. Use a phone wallet below, or open this page in your wallet's browser.</p>`}
    <details class="manual"><summary>Pay from another wallet or your phone</summary>
      <p class="tiny muted">Send exactly <strong class="mono">${order.amount} USDC</strong> on <strong>Base</strong> to:</p>
      <div class="copyrow"><code class="mono" id="ckAddr">${order.payTo}</code><button class="btn sm" data-copy="${order.payTo}">Copy</button></div>
      <div class="copyrow"><code class="mono">${order.amount}</code><button class="btn sm" data-copy="${order.amount}">Copy amount</button></div>
      <a class="btn sm" href="${W.payLink(order.payTo, order.amountUnits)}">Open in phone wallet</a>
      <label class="f" style="margin-top:10px">Then paste the transaction hash<input id="ckHash" placeholder="0x..." autocomplete="off"></label>
      <button class="btn sm" id="ckCheck">Check my payment</button>
    </details>
    <p class="tiny" id="ckMsg" aria-live="polite"></p>
    <p class="tiny muted">This price is held for 2 hours. Topier will never ask you to approve spending or sign a message.</p>`);
  const msg = (t, kind) => { const m = s.querySelector('#ckMsg'); m.textContent = t; m.style.color = kind === 'err' ? 'var(--bad)' : kind === 'ok' ? '#16a34a' : ''; };
  s.querySelectorAll('[data-copy]').forEach((b) => b.onclick = () => { navigator.clipboard.writeText(b.dataset.copy).then(() => { b.textContent = 'Copied'; }); });
  s.querySelectorAll('[data-w]').forEach((b) => b.onclick = async () => {
    const w = ws.find((x) => x.id === b.dataset.w);
    try {
      msg('Open your wallet to approve the transfer...');
      const from = await W.connect(w.provider);
      const bal = await W.usdcBalance(w.provider, from).catch(() => null);
      if (bal !== null && bal * 1e6 < Number(order.amountUnits)) { await W.toBase(w.provider).catch(() => {}); }
      const hash = await W.sendUSDC(w.provider, from, order.payTo, order.amountUnits);
      msg('Sent. Waiting for Base to confirm...');
      watch(hash);
    } catch (e) { msg(W.friendlyError(e), 'err'); }
  });
  s.querySelector('#ckCheck').onclick = () => { const h = s.querySelector('#ckHash').value.trim(); if (!/^0x[0-9a-fA-F]{64}$/.test(h)) return msg('Paste the full transaction hash, it starts with 0x and has 64 characters after it.', 'err'); msg('Checking...'); watch(h); };
  let stop = false;
  async function watch(hash) {
    for (let i = 0; i < 60 && !stop; i++) {
      try {
        const r = await api({ action: 'verify', orderId: order.id, txHash: hash });
        if (r.status === 'paid') {
          msg(r.message, 'ok');
          await auth.refreshPlan();
          setTimeout(() => { ui.closeSheet(); ui.toast(`${plan.name} is on. Thank you.`); }, 1400);
          return;
        }
        if (r.status === 'failed') { msg(r.message, 'err'); return; }
        msg(r.message + ` View it on Basescan: ${hash.slice(0, 10)}…`);
      } catch (e) { msg(e.message, 'err'); }
      await new Promise((r) => setTimeout(r, 4000));
    }
    if (!stop) msg('Still waiting. If you sent it, keep this page open or paste the hash again later. Your payment is safe on chain.', 'err');
  }
  const obs = new MutationObserver(() => { if (s.hidden) { stop = true; obs.disconnect(); } });
  obs.observe(s, { attributes: true });
}
