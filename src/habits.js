// What Topi has learned about how this person edits. Stays on the device (and only a short
// summary goes to Topi's brain with a question). Counts, not recordings.
const KEY = 'topier-habits';
const blank = () => ({ v: 1, firstSeen: Date.now(), lastSeen: Date.now(), sessions: 0, introSeen: false, cmd: {}, look: {}, text: {}, music: {}, trans: {}, size: {}, export: {}, mode: {}, font: {}, accepted: {}, dismissed: {}, lengths: [], hour: {} });
let h = null;
function load() { if (!h) { try { h = { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { h = blank(); } } return h; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(h)); } catch {} }

export const get = () => load();
export function bump(kind, value, by = 1) { if (!value) return; const s = load(); s[kind] = s[kind] || {}; s[kind][value] = (s[kind][value] || 0) + by; s.lastSeen = Date.now(); save(); }
export function session() { const s = load(); s.sessions += 1; s.lastSeen = Date.now(); const hr = new Date().getHours(); s.hour[hr] = (s.hour[hr] || 0) + 1; save(); }
export function length(sec) { const s = load(); s.lengths = [...s.lengths, Math.round(sec)].slice(-20); save(); }
export function markIntro() { const s = load(); s.introSeen = true; save(); }
export const introSeen = () => load().introSeen;

// Most used value of a kind, with how sure we are (it has to be a real pattern, not one click).
export function favourite(kind, min = 2) {
  const m = load()[kind] || {};
  const top = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= min ? top[0] : null;
}
export const count = (kind, value) => ((load()[kind] || {})[value] || 0);
export const used = (cmd) => count('cmd', cmd) > 0;
// Sort a list so the person's favourites come first, otherwise keep the given order.
export function rank(kind, list, key = (x) => x.id) { const m = load()[kind] || {}; return [...list].map((x, i) => [x, i]).sort((a, b) => ((m[key(b[0])] || 0) - (m[key(a[0])] || 0)) || a[1] - b[1]).map((p) => p[0]); }

// A suggestion they turned down twice is not offered again.
export const declined = (id) => count('dismissed', id) >= 2;
export const accept = (id) => bump('accepted', id);
export const dismiss = (id) => bump('dismissed', id);

export function typicalLength() { const l = load().lengths; if (l.length < 2) return null; const s = [...l].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }

// The short summary Topi's brain sees.
export function summary() {
  const s = load();
  const top = (k) => Object.entries(s[k] || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v, n]) => `${v}(${n})`).join(', ');
  return { sessions: s.sessions, favouriteLooks: top('look'), favouriteText: top('text'), favouriteMusic: top('music'), favouriteTransitions: top('trans'), exportsTo: top('export'), modes: top('mode'), toolsUsed: top('cmd'), typicalLengthSec: typicalLength(), declinedTips: Object.keys(s.dismissed || {}).filter((k) => s.dismissed[k] >= 2) };
}
