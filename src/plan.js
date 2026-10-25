// What each plan unlocks, in one place. The plan itself comes from the account (auth.js keeps it in
// localStorage after sign-in), read through topi.js.
import { plan } from './topi.js';

export const RANK = { free: 0, creator: 1, pro: 2, studio: 3 };
export const has = (min) => (RANK[plan()] || 0) >= RANK[min];
export const BRAND_KITS = { free: 1, creator: 1, pro: 3, studio: Infinity };
export const kitLimit = () => BRAND_KITS[plan()] || 1;
export const openPlans = (p) => document.dispatchEvent(new CustomEvent('topier-open-plans', { detail: { plan: p } }));
