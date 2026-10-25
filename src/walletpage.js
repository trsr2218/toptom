// Owner wallet page. Reads balances and payments; prepares transfers that the owner signs in their own wallet.
import * as auth from './auth.js';
import * as account from './ui/account.js';
import * as W from './wallet.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BOOK_KEY = 'topier-address-book';
const book = () => { try { return JSON.parse(localStorage.getItem(BOOK_KEY) || '[]'); } catch { return []; } };
const saveBook = (b) => { try { localStorage.setItem(BOOK_KEY, JSON.stringify(b)); } catch {} };

function sheet(html) { const s = $('sheet'); s.innerHTML = `<button class="close" aria-label="Close">×</button>${html}`; s.hidden = false; $('backdrop').hidden = false; s.querySelector('.close').onclick = closeSheet; $('backdrop').onclick = closeSheet; return s; }
function closeSheet() { $('sheet').hidden = true; $('backdrop').hidden = true; }
const toast = (m) => { const g = $('gate'); g.hidden = false; g.textContent = m; setTimeout(() => { if (!$('body').hidden) g.hidden = true; }, 4000); };

let data = null;
account.mount($('accountBtn'), { sheet, closeSheet, toast, onChange: (u) => load(u) });

async function load(user) {
  const gate = $('gate'), body = $('body');
  if (!user) { gate.hidden = false; body.hidden = true; gate.innerHTML = '<h2>Sign in</h2><p class="muted">Sign in with the owner account to see the wallet.</p>'; return; }
  const tok = await auth.token();
  const r = await fetch('/api/treasury', { headers: { authorization: `Bearer ${tok}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { gate.hidden = false; body.hidden = true; gate.innerHTML = `<h2>Not available</h2><p class="muted">${esc(j.error || 'Could not load.')}</p>`; return; }
  data = j; gate.hidden = true; body.hidden = false;
  if (!j.payTo) { $('stats').innerHTML = '<div class="stat"><span>Receiving wallet</span><strong>Not set</strong></div>'; $('addrLine').textContent = 'Set TOPIER_PAY_TO in Vercel to switch on wallet payments.'; $('sendCard').hidden = true; return; }
  $('stats').innerHTML = `
    <div class="stat"><span>USDC on Base</span><strong>$${esc(j.usdc)}</strong></div>
    <div class="stat"><span>ETH for fees</span><strong>${esc(j.eth)}</strong></div>
    <div class="stat"><span>Received through Topier</span><strong>$${esc(j.totalReceived)}</strong></div>
    <div class="stat"><span>Active subscriptions</span><strong>${esc(j.activeSubscriptions)}</strong></div>`;
  $('addrLine').innerHTML = `Receiving wallet <a class="mono" href="${W.BASE.explorer}/address/${j.payTo}" target="_blank" rel="noopener">${j.payTo}</a>${j.isContract ? ' · a smart contract wallet (Safe)' : ''}`;
  $('payCount').textContent = `${j.payments.length} confirmed`;
  $('payments').innerHTML = j.payments.length ? `<div class="tr th"><span>Date</span><span>Plan</span><span>Amount</span><span>From</span><span>Transaction</span></div>` + j.payments.map((p) => `<div class="tr"><span>${new Date(p.paid_at).toLocaleDateString()}</span><span>${esc(p.plan)}, ${esc(p.period)}</span><span>$${esc(p.amount)}</span><span class="mono">${W.short(p.payer)}</span><span><a class="mono" target="_blank" rel="noopener" href="${W.BASE.explorer}/tx/${p.tx_hash}">${W.short(p.tx_hash)}</a></span></div>`).join('') : '<p class="muted">No payments yet.</p>';
  renderSend();
}

function renderSend() {
  const j = data;
  if (j.isContract) {
    $('sendHelp').textContent = 'This wallet is a Safe, so transfers are proposed and signed in the Safe app by its owners.';
    $('sendBody').innerHTML = `<a class="btn big" target="_blank" rel="noopener" href="https://app.safe.global/home?safe=base:${j.payTo}">Open the Safe on Base</a>`;
    return;
  }
  $('sendHelp').textContent = 'Connect the wallet that owns the receiving address. Topier fills in the transfer, your wallet asks you to confirm it. Nothing moves without your approval in the wallet.';
  const b = book();
  $('sendBody').innerHTML = `
    <label class="f">To<select id="sdTo"><option value="">Choose a saved wallet, or type below</option>${b.map((x) => `<option value="${x.address}">${esc(x.label)} · ${W.short(x.address)}</option>`).join('')}</select></label>
    <label class="f">Or paste an address<input id="sdAddr" placeholder="0x..." autocomplete="off"></label>
    <label class="f">Amount in USDC<input id="sdAmt" inputmode="decimal" placeholder="0.00"></label>
    <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn big" id="sdGo">Review transfer</button><button class="btn" id="sdSave">Save address</button></div>
    <p class="tiny" id="sdMsg"></p>`;
  const msg = (t, err) => { const m = $('sdMsg'); m.textContent = t; m.style.color = err ? 'var(--bad)' : ''; };
  $('sdTo').onchange = () => { $('sdAddr').value = $('sdTo').value; };
  $('sdSave').onclick = () => { const a = $('sdAddr').value.trim(); if (!W.isAddress(a)) return msg('That is not a valid address.', true); const label = prompt('Name this wallet, for example "Main savings"'); if (!label) return; const nb = book().filter((x) => x.address.toLowerCase() !== a.toLowerCase()); nb.push({ label: label.slice(0, 40), address: a }); saveBook(nb); renderSend(); };
  $('sdGo').onclick = () => {
    const to = $('sdAddr').value.trim(), amt = Number($('sdAmt').value);
    if (!W.isAddress(to)) return msg('That is not a valid address.', true);
    if (to.toLowerCase() === j.payTo.toLowerCase()) return msg('That is the receiving wallet itself.', true);
    if (!(amt > 0)) return msg('Enter an amount above zero.', true);
    if (amt > Number(j.usdc)) return msg(`The wallet holds $${j.usdc} USDC.`, true);
    const saved = book().find((x) => x.address.toLowerCase() === to.toLowerCase());
    const units = BigInt(Math.round(amt * 1e6));
    const s = sheet(`<h3>Check before you send</h3>
      <div class="paybox">
        <div class="row between"><span class="muted">Send</span><strong>${amt.toFixed(2)} USDC on Base</strong></div>
        <div class="row between"><span class="muted">From</span><span class="mono">${W.short(j.payTo)}</span></div>
        <div class="row between"><span class="muted">To</span><strong>${saved ? esc(saved.label) : 'Unsaved address'}</strong></div>
      </div>
      <p class="mono big-addr">${to.slice(0, 6)}<span>${to.slice(6, -6)}</span>${to.slice(-6)}</p>
      <p class="tiny muted">Compare the first and last six characters with the wallet you mean. Transfers on chain cannot be reversed.</p>
      ${saved ? '' : '<label class="check"><input type="checkbox" id="sdSure"> I checked this address character by character.</label>'}
      <button class="btn big block" id="sdSign">Confirm in my wallet</button><p class="tiny" id="sdState"></p>`);
    s.querySelector('#sdSign').onclick = async () => {
      const st = (t, err) => { const e = s.querySelector('#sdState'); e.textContent = t; e.style.color = err ? 'var(--bad)' : ''; };
      if (!saved && !s.querySelector('#sdSure').checked) return st('Tick the box once you have checked the address.', true);
      const ws = W.wallets(); if (!ws.length) return st('No wallet in this browser. Install or open your wallet extension.', true);
      try {
        const from = await W.connect(ws[0].provider);
        if (from.toLowerCase() !== j.payTo.toLowerCase()) return st(`The connected wallet is ${W.short(from)}. Switch to ${W.short(j.payTo)}, the receiving wallet, then try again.`, true);
        st('Confirm in your wallet...');
        const hash = await W.sendUSDC(ws[0].provider, from, to, units);
        st(''); s.querySelector('#sdState').innerHTML = `Sent. <a target="_blank" rel="noopener" href="${W.BASE.explorer}/tx/${hash}">View on Basescan</a>`;
        setTimeout(() => load(auth.currentUser()), 8000);
      } catch (e) { st(W.friendlyError(e), true); }
    };
  };
}
