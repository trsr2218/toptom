// Shared on-chain and database helpers for the payment functions. Files starting with _ are not routes.

export const CHAIN_ID = 8453;                                        // Base mainnet
export const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';    // native USDC on Base
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const MIN_CONFIRMATIONS = 3;
export const PRICES = { creator: 8, pro: 18, studio: 45 };            // USD a month; a year is 10 months
export const isAddress = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ''));
export const payTo = () => (isAddress(process.env.TOPIER_PAY_TO) ? process.env.TOPIER_PAY_TO.toLowerCase() : '');
const RPCS = () => [process.env.BASE_RPC_URL, 'https://mainnet.base.org', 'https://base.llamarpc.com', 'https://base-rpc.publicnode.com'].filter(Boolean);

export async function rpc(method, params) {
  let last;
  for (const url of RPCS()) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || 'rpc error');
      return j.result;
    } catch (e) { last = e; }
  }
  throw last || new Error('no rpc');
}

const pad = (addr) => '0x' + addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');

/**
 * Check that txHash moved exactly `units` USDC to `to` on Base.
 * Returns { ok, pending, reason, from, blockTime }.
 */
export async function checkTransfer(txHash, to, units) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(txHash || ''))) return { ok: false, reason: 'That does not look like a transaction hash.' };
  const receipt = await rpc('eth_getTransactionReceipt', [txHash]);
  if (!receipt) return { ok: false, pending: true, reason: 'Waiting for the network to include your payment.' };
  if (receipt.status !== '0x1') return { ok: false, reason: 'That transaction failed on chain, so nothing was paid.' };
  const hit = (receipt.logs || []).find((l) => l.address.toLowerCase() === USDC && l.topics[0] === TRANSFER_TOPIC && l.topics[2] && l.topics[2].toLowerCase() === pad(to) && BigInt(l.data) === BigInt(units));
  if (!hit) return { ok: false, reason: 'That transaction did not send the exact USDC amount to the Topier wallet.' };
  const head = BigInt(await rpc('eth_blockNumber', []));
  const conf = Number(head - BigInt(receipt.blockNumber)) + 1;
  if (conf < MIN_CONFIRMATIONS) return { ok: false, pending: true, reason: `Confirming on Base, ${conf} of ${MIN_CONFIRMATIONS}.` };
  const block = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
  return { ok: true, from: '0x' + hit.topics[1].slice(26), blockTime: Number(BigInt(block.timestamp)) * 1000 };
}

// ---------- Supabase ----------
const SB = () => ({ url: process.env.SUPABASE_URL, anon: process.env.SUPABASE_ANON_KEY, service: process.env.SUPABASE_SERVICE_ROLE_KEY });

export async function userFrom(req) {
  const { url, anon } = SB();
  const auth = req.headers.authorization || '';
  if (!url || !anon || !auth.startsWith('Bearer ')) return null;
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return { id: u.id, email: (u.email || '').toLowerCase(), token: auth.slice(7) };
}

export async function db(path, { method = 'GET', body, prefer } = {}) {
  const { url, service } = SB();
  if (!url || !service) throw new Error('Payments are not configured on this server.');
  const r = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: { apikey: service, authorization: `Bearer ${service}`, 'content-type': 'application/json', ...(prefer ? { prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) { const e = new Error((data && (data.message || data.hint)) || `db ${r.status}`); e.code = data && data.code; throw e; }
  return data;
}

export async function isOwner(email) {
  const rows = await db(`topier_owner_emails?select=email&email=eq.${encodeURIComponent(email)}`);
  return rows.length > 0;
}

export function readBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b || {};
}
