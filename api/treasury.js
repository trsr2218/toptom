// Owner-only view of the receiving wallet: balances and confirmed payments. Read only: it moves nothing.
import { USDC, payTo, rpc, userFrom, db, isOwner } from './_chain.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const user = await userFrom(req).catch(() => null);
  if (!user) return res.status(401).json({ error: 'Sign in first.' });
  try {
    if (!(await isOwner(user.email))) return res.status(403).json({ error: 'This page is for the Topier owner.' });
    const to = payTo();
    let usdc = null, eth = null, isContract = false;
    if (to) {
      const data = '0x70a08231' + to.replace(/^0x/, '').padStart(64, '0'); // balanceOf(address)
      const [b, e, code] = await Promise.all([rpc('eth_call', [{ to: USDC, data }, 'latest']), rpc('eth_getBalance', [to, 'latest']), rpc('eth_getCode', [to, 'latest'])]);
      usdc = (Number(BigInt(b)) / 1e6).toFixed(2);
      eth = (Number(BigInt(e)) / 1e18).toFixed(6);
      // A normal wallet with an EIP-7702 delegation carries code starting 0xef0100: still a wallet its owner signs for, not a Safe.
      isContract = !!code && code !== '0x' && !code.toLowerCase().startsWith('0xef0100');
    }
    const paid = await db('topier_orders?status=eq.paid&select=id,plan,period,amount_units,payer,tx_hash,paid_at&order=paid_at.desc&limit=200');
    const total = paid.reduce((s, o) => s + Number(o.amount_units), 0) / 1e6;
    const subs = await db(`topier_subscriptions?paid_until=gt.${new Date().toISOString()}&select=plan`);
    return res.status(200).json({ payTo: to, usdc, eth, isContract, totalReceived: total.toFixed(2), activeSubscriptions: subs.length, payments: paid.map((o) => ({ ...o, amount: (Number(o.amount_units) / 1e6).toFixed(2) })) });
  } catch (e) {
    console.error('treasury', e);
    return res.status(500).json({ error: e.message || 'Could not load the wallet.' });
  }
}
