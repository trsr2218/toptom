// Sign in with a wallet (EIP-4361, "Sign-In with Ethereum") on Base.
// POST { action: 'nonce', address }                -> { message } to sign
// POST { action: 'verify', message, signature }    -> { access_token, refresh_token } for Supabase
// The signature is checked on Base, which also covers smart wallets such as Coinbase Smart Wallet.
// Signing proves the person controls the address. It moves nothing and costs nothing.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createPublicClient, http, getAddress, isAddress } from 'viem';
import { base } from 'viem/chains';
import { db, readBody } from './_chain.js';

const DOMAINS = ['www.topier.store', 'topier.store', 'localhost:5173'];
const TTL = 10 * 60 * 1000;
const secret = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const sign = (s) => createHmac('sha256', secret()).update(s).digest('hex').slice(0, 32);

function hostOf(req) { return String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase(); }

export function buildMessage({ domain, address, uri, nonce, issuedAt, expiresAt }) {
  return `${domain} wants you to sign in with your Ethereum account:
${address}

Sign in to Topier. This proves the wallet is yours. It does not move any funds or cost anything.

URI: ${uri}
Version: 1
Chain ID: 8453
Nonce: ${nonce}
Issued At: ${issuedAt}
Expiration Time: ${expiresAt}`;
}

export function parseMessage(m) {
  const get = (k) => { const r = new RegExp(`^${k}: (.+)$`, 'm').exec(m); return r ? r[1].trim() : ''; };
  const head = /^(\S+) wants you to sign in with your Ethereum account:\n(0x[0-9a-fA-F]{40})\n/.exec(m);
  if (!head) return null;
  return { domain: head[1], address: head[2], uri: get('URI'), chainId: get('Chain ID'), nonce: get('Nonce'), issuedAt: get('Issued At'), expiresAt: get('Expiration Time') };
}

// nonce = <random>.<expiry ms>.<hmac>: the server can tell it made it without storing it first
function makeNonce(address) { const r = randomBytes(9).toString('hex'), exp = Date.now() + TTL; return `${r}${exp.toString(36)}${sign(`${r}.${exp}.${address.toLowerCase()}`)}`; }
function checkNonce(nonce, address) {
  const r = nonce.slice(0, 18), mac = nonce.slice(-32), expStr = nonce.slice(18, -32);
  const exp = parseInt(expStr, 36);
  if (!r || !mac || !exp || Date.now() > exp) return false;
  const want = Buffer.from(sign(`${r}.${exp}.${address.toLowerCase()}`)), got = Buffer.from(mac);
  return want.length === got.length && timingSafeEqual(want, got);
}

const client = () => createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org') });

async function sessionFor(address) {
  const url = process.env.SUPABASE_URL, service = secret(), anon = process.env.SUPABASE_ANON_KEY;
  const email = `${address.toLowerCase()}@wallet.topier.store`;
  const admin = { apikey: service, authorization: `Bearer ${service}`, 'content-type': 'application/json' };
  // create the account the first time; an existing one answers 422, which is fine
  await fetch(`${url}/auth/v1/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ email, email_confirm: true, user_metadata: { app: 'topier', wallet: getAddress(address), name: '' } }) });
  const link = await fetch(`${url}/auth/v1/admin/generate_link`, { method: 'POST', headers: admin, body: JSON.stringify({ type: 'magiclink', email }) });
  const lj = await link.json();
  const tokenHash = lj.hashed_token || (lj.properties && lj.properties.hashed_token);
  if (!tokenHash) throw new Error('Could not start the session.');
  const v = await fetch(`${url}/auth/v1/verify`, { method: 'POST', headers: { apikey: anon, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }) });
  const s = await v.json();
  if (!v.ok || !s.access_token) throw new Error((s && (s.msg || s.error_description)) || 'Could not start the session.');
  return { access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in };
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!secret()) return res.status(503).json({ error: 'Wallet sign-in is not set up on this server.' });
  const body = readBody(req);
  const host = hostOf(req);
  if (!DOMAINS.includes(host)) return res.status(400).json({ error: 'Unknown site.' });
  try {
    if (body.action === 'nonce') {
      if (!isAddress(String(body.address || ''))) return res.status(400).json({ error: 'That is not a wallet address.' });
      const address = getAddress(body.address), now = new Date();
      const proto = host.startsWith('localhost') ? 'http' : 'https';
      return res.status(200).json({ message: buildMessage({ domain: host, address, uri: `${proto}://${host}`, nonce: makeNonce(address), issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + TTL).toISOString() }) });
    }
    if (body.action === 'verify') {
      const message = String(body.message || ''), signature = String(body.signature || '');
      const m = parseMessage(message);
      if (!m) return res.status(400).json({ error: 'That sign-in message is not valid.' });
      if (m.domain !== host) return res.status(400).json({ error: 'That message was made for another site.' });
      if (m.chainId !== '8453') return res.status(400).json({ error: 'Sign in on Base.' });
      if (!checkNonce(m.nonce, m.address) || Date.parse(m.expiresAt) < Date.now()) return res.status(400).json({ error: 'That sign-in request expired. Try again.' });
      const ok = await client().verifyMessage({ address: m.address, message, signature });
      if (!ok) return res.status(401).json({ error: 'The signature does not match that wallet.' });
      try { await db('topier_nonces', { method: 'POST', body: { nonce: m.nonce, address: m.address.toLowerCase() } }); }
      catch (e) { if (e.code === '23505') return res.status(400).json({ error: 'That sign-in was already used. Try again.' }); throw e; }
      const session = await sessionFor(m.address);
      return res.status(200).json({ ...session, address: getAddress(m.address) });
    }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    console.error('siwe', e);
    return res.status(500).json({ error: e.message || 'Wallet sign-in failed.' });
  }
}
