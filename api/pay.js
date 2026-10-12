// Checkout: create an order with a unique amount, then verify the on-chain transfer and unlock the plan.
// POST { action: 'create', plan, period }      -> order
// POST { action: 'verify', orderId, txHash }   -> { status: 'paid' | 'pending' | 'failed', message }
// POST { action: 'orders' }                    -> the caller's recent orders
import { CHAIN_ID, USDC, PRICES, payTo, checkTransfer, userFrom, db, readBody } from './_chain.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const to = payTo();
  if (!to) return res.status(503).json({ error: 'Wallet payments are not switched on yet.' });
  const user = await userFrom(req).catch(() => null);
  if (!user) return res.status(401).json({ error: 'Sign in first.' });
  const body = readBody(req);

  try {
    if (body.action === 'create') {
      const plan = String(body.plan || ''), period = body.period === 'year' ? 'year' : 'month';
      if (!PRICES[plan]) return res.status(400).json({ error: 'Pick a plan.' });
      // expire this user's stale open orders first
      await db(`topier_orders?user_id=eq.${user.id}&status=eq.open&expires_at=lt.${new Date().toISOString()}`, { method: 'PATCH', body: { status: 'expired' } });
      const base = BigInt(PRICES[plan] * (period === 'year' ? 10 : 1)) * 1000000n;
      for (let i = 0; i < 6; i++) {
        // a tag of 0.000001 to 0.009999 USDC makes every open order's amount unique
        const tag = BigInt(1 + Math.floor(Math.random() * 9999));
        try {
          const [order] = await db('topier_orders', {
            method: 'POST', prefer: 'return=representation',
            body: { user_id: user.id, plan, period, amount_units: String(base + tag), chain_id: CHAIN_ID, token: USDC, pay_to: to },
          });
          return res.status(200).json({ order: shape(order) });
        } catch (e) { if (e.code !== '23505') throw e; }
      }
      return res.status(503).json({ error: 'Busy, try again in a moment.' });
    }

    if (body.action === 'verify') {
      const [order] = await db(`topier_orders?id=eq.${encodeURIComponent(body.orderId)}&user_id=eq.${user.id}&select=*`);
      if (!order) return res.status(404).json({ error: 'Order not found.' });
      if (order.status === 'paid') return res.status(200).json({ status: 'paid', message: 'Already paid. Enjoy.' });
      const txHash = String(body.txHash || '').trim().toLowerCase();
      const used = await db(`topier_orders?tx_hash=eq.${txHash}&select=id`);
      if (used.length) return res.status(200).json({ status: 'failed', message: 'That transaction already paid for an order.' });
      const r = await checkTransfer(txHash, order.pay_to, order.amount_units);
      if (r.pending) return res.status(200).json({ status: 'pending', message: r.reason });
      if (!r.ok) return res.status(200).json({ status: 'failed', message: r.reason });
      if (r.blockTime < Date.parse(order.created_at) - 120000) return res.status(200).json({ status: 'failed', message: 'That payment was made before this order existed.' });
      // mark paid only if still open: two racing calls cannot both win
      const paid = await db(`topier_orders?id=eq.${order.id}&status=in.(open,expired)`, { method: 'PATCH', prefer: 'return=representation', body: { status: 'paid', tx_hash: txHash, payer: r.from, paid_at: new Date().toISOString() } });
      if (!paid.length) return res.status(200).json({ status: 'paid', message: 'Already paid. Enjoy.' });
      const [sub] = await db(`topier_subscriptions?user_id=eq.${user.id}&select=*`);
      const start = sub && Date.parse(sub.paid_until) > Date.now() ? Date.parse(sub.paid_until) : Date.now();
      const until = new Date(start + (order.period === 'year' ? 365 : 30) * 864e5).toISOString();
      await db('topier_subscriptions', { method: 'POST', prefer: 'resolution=merge-duplicates', body: { user_id: user.id, plan: order.plan, paid_until: until, updated_at: new Date().toISOString() } });
      return res.status(200).json({ status: 'paid', plan: order.plan, paidUntil: until, message: 'Payment confirmed on Base. Your plan is on.' });
    }

    if (body.action === 'orders') {
      const rows = await db(`topier_orders?user_id=eq.${user.id}&select=*&order=created_at.desc&limit=20`);
      return res.status(200).json({ orders: rows.map(shape) });
    }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    console.error('pay', e);
    return res.status(500).json({ error: e.message || 'Payment check failed. Try again.' });
  }
}

function shape(o) {
  return { id: o.id, plan: o.plan, period: o.period, amountUnits: String(o.amount_units), amount: (Number(o.amount_units) / 1e6).toFixed(6), chainId: o.chain_id, token: o.token, payTo: o.pay_to, status: o.status, txHash: o.tx_hash, expiresAt: o.expires_at, createdAt: o.created_at };
}
