// Browser wallet helpers: find a wallet, switch to Base, send a plain USDC transfer.
// Topier only ever asks for a transfer of an exact amount. It never asks for an approval,
// a signature on a message, or access to anything else in the wallet.

export const BASE = { chainId: 8453, hex: '0x2105', name: 'Base', usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', explorer: 'https://basescan.org' };
export const isAddress = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ''));
export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

// EIP-6963: let every installed wallet announce itself, fall back to window.ethereum.
const found = new Map();
if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (e) => { const d = e.detail; if (d && d.info && d.provider) found.set(d.info.uuid, d); });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}
export function wallets() {
  const list = [...found.values()].map((d) => ({ id: d.info.uuid, name: d.info.name, icon: d.info.icon, provider: d.provider }));
  if (!list.length && window.ethereum) list.push({ id: 'injected', name: window.ethereum.isCoinbaseWallet ? 'Coinbase Wallet' : window.ethereum.isRabby ? 'Rabby' : window.ethereum.isMetaMask ? 'MetaMask' : 'Browser wallet', icon: '', provider: window.ethereum });
  return list;
}

export async function connect(provider) {
  const [account] = await provider.request({ method: 'eth_requestAccounts' });
  if (!account) throw new Error('No account was shared.');
  return account;
}

export async function toBase(provider) {
  const current = await provider.request({ method: 'eth_chainId' });
  if (String(current).toLowerCase() === BASE.hex) return;
  try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE.hex }] }); }
  catch (e) {
    if (e && (e.code === 4902 || /Unrecognized chain/i.test(e.message || ''))) {
      await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: BASE.hex, chainName: 'Base', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: [BASE.explorer] }] });
    } else throw e;
  }
}

const word = (hex) => hex.replace(/^0x/, '').toLowerCase().padStart(64, '0');
export function transferData(to, units) { return '0xa9059cbb' + word(to) + word(BigInt(units).toString(16)); }

/** Send `units` (6 decimals) of USDC on Base from the connected account to `to`. Returns the tx hash. */
export async function sendUSDC(provider, from, to, units) {
  if (!isAddress(to)) throw new Error('That receiving address is not valid.');
  await toBase(provider);
  return provider.request({ method: 'eth_sendTransaction', params: [{ from, to: BASE.usdc, data: transferData(to, units), value: '0x0' }] });
}

export async function usdcBalance(provider, account) {
  const data = '0x70a08231' + word(account);
  const r = await provider.request({ method: 'eth_call', params: [{ to: BASE.usdc, data }, 'latest'] });
  return Number(BigInt(r)) / 1e6;
}

// A link phone wallets understand (EIP-681): opens a USDC transfer of the exact amount on Base.
export const payLink = (to, units) => `ethereum:${BASE.usdc}@${BASE.chainId}/transfer?address=${to}&uint256=${units}`;

export function friendlyError(e) {
  const m = (e && (e.message || e.toString())) || '';
  if (e && (e.code === 4001 || /reject|denied|cancel/i.test(m))) return 'You cancelled in your wallet. Nothing was sent.';
  if (/insufficient/i.test(m)) return 'Not enough in that wallet. You need the USDC amount plus a little ETH on Base for the network fee.';
  return m.slice(0, 200) || 'The wallet did not finish. Nothing was sent.';
}
