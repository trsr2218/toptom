// Topier emblem: a sheared "T" that reads as an up-right arrow, drawn as pure geometry
// so it stays crisp at 16 px and 2048 px. Traced from the source logo, 9 Oct 2026.
// Built on a 30 degree axis: d runs along the bar, n runs across it (down-right).

export const COLORS = {
  orangeHi: '#FFC25A',   // arrow tip
  orange: '#FF7A1A',     // main accent, also the UI accent
  orangeDeep: '#FF5E0A',
  magenta: '#E23C96',
  violet: '#7B2CFF',     // bottom of the stem, UI secondary
  ink: '#0D0D10',
  white: '#FFFFFF',
};

const TH = Math.PI / 6;                       // 30 degrees
const d = [Math.cos(TH), -Math.sin(TH)];      // along the bar, up-right
const n = [Math.sin(TH), Math.cos(TH)];       // across the bar, down-right
const A = [40, 290];                          // top-left corner of the bar
const P = (u, v) => [A[0] + u * d[0] + v * n[0], A[1] + u * d[1] + v * n[1]];
const T = 70;                                 // bar thickness

// point on the bottom edge of the bar at page x
function onBar(x) { const u = (x - P(0, T)[0]) / d[0]; return P(u, T); }

// Raw shapes in the traced frame. Stems hang straight down the page with a slight italic lean.
function raw() {
  const tip = P(505, 0);
  const bar = [A, tip, [tip[0] - 14, tip[1] + 150], P(372, T), P(0, T)];   // bar + head, one piece
  const wing = [P(10, -66), P(290, -66), P(312, -20), P(38, -20)];
  const sL = 218, sR = 310;                   // long stem, x of its edges at the bar
  const stem = [onBar(sL), onBar(sR), [sR - 4, 414], [sL - 6, 494]];
  const pL = 322, pR = 398;                   // short prong, parallel to the stem
  const prong = [onBar(pL), onBar(pR), [pR - 2, 300], [pL - 2, 374]];
  const barHi = [A, tip, [tip[0] - 5, tip[1] + 11], P(0, 11)];
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const stemHi = [stem[0], mid(stem[0], stem[1]), mid(stem[3], stem[2]), stem[3]];
  return { bar, wing, stem, prong, barHi, stemHi };
}

function bbox(shapes) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const s of [shapes.bar, shapes.wing, shapes.stem, shapes.prong]) for (const [x, y] of s) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

// Shapes normalised to fit a 512 box with the given padding, centred.
export function shapes(pad = 28) {
  const r = raw(), b = bbox(r);
  const k = (512 - pad * 2) / Math.max(b.w, b.h);
  const ox = (512 - b.w * k) / 2 - b.x0 * k, oy = (512 - b.h * k) / 2 - b.y0 * k;
  const m = (s) => s.map(([x, y]) => [x * k + ox, y * k + oy]);
  return { bar: m(r.bar), wing: m(r.wing), stem: m(r.stem), prong: m(r.prong), barHi: m(r.barHi), stemHi: m(r.stemHi), k };
}
export const pts = (list) => list.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

/**
 * Inner SVG markup for the emblem in a 512 x 512 box.
 * style: 'gradient' | 'mono'; mono: colour for mono; glow: soft glow for large sizes.
 */
export function emblemInner({ style = 'gradient', mono = '#fff', glow = false, pad = 28, id = 'tp' } = {}) {
  const s = shapes(pad);
  const fill = (g) => (style === 'mono' ? mono : `url(#${id}-${g})`);
  const tipX = s.bar[1][0], tipY = s.bar[1][1], tailX = s.bar[4][0], tailY = s.bar[4][1];
  const stemTop = s.stem[0], stemBot = s.stem[3];
  const grads = style === 'mono' ? '' : `
    <linearGradient id="${id}-bar" gradientUnits="userSpaceOnUse" x1="${tailX}" y1="${tailY}" x2="${tipX}" y2="${tipY}">
      <stop offset="0" stop-color="${COLORS.orangeDeep}"/>
      <stop offset="0.55" stop-color="${COLORS.orange}"/>
      <stop offset="1" stop-color="${COLORS.orangeHi}"/>
    </linearGradient>
    <linearGradient id="${id}-wing" gradientUnits="userSpaceOnUse" x1="${s.wing[0][0]}" y1="${s.wing[0][1]}" x2="${s.wing[1][0]}" y2="${s.wing[1][1]}">
      <stop offset="0" stop-color="${COLORS.orangeDeep}"/>
      <stop offset="1" stop-color="#FFA23A"/>
    </linearGradient>
    <linearGradient id="${id}-stem" gradientUnits="userSpaceOnUse" x1="${stemTop[0]}" y1="${stemTop[1]}" x2="${stemBot[0]}" y2="${stemBot[1]}">
      <stop offset="0" stop-color="${COLORS.orange}"/>
      <stop offset="0.42" stop-color="${COLORS.magenta}"/>
      <stop offset="1" stop-color="${COLORS.violet}"/>
    </linearGradient>
    <linearGradient id="${id}-prong" gradientUnits="userSpaceOnUse" x1="${s.prong[0][0]}" y1="${s.prong[0][1]}" x2="${s.prong[3][0]}" y2="${s.prong[3][1]}">
      <stop offset="0" stop-color="${COLORS.orange}"/>
      <stop offset="0.5" stop-color="${COLORS.magenta}"/>
      <stop offset="1" stop-color="${COLORS.violet}"/>
    </linearGradient>`;
  const glowDef = glow ? `<filter id="${id}-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${(16 * s.k).toFixed(1)}"/></filter>` : '';
  const glowG = glow ? `<g filter="url(#${id}-glow)" opacity="0.5">
    <polygon points="${pts(s.stem)}" fill="${COLORS.violet}"/>
    <polygon points="${pts(s.prong)}" fill="${COLORS.magenta}"/>
    <polygon points="${pts(s.bar)}" fill="${COLORS.orange}"/>
    <polygon points="${pts(s.wing)}" fill="${COLORS.orange}"/>
  </g>` : '';
  return `
  <defs>${grads}${glowDef}</defs>
  ${glowG}
  <polygon points="${pts(s.stem)}" fill="${fill('stem')}"/>
  <polygon points="${pts(s.prong)}" fill="${fill('prong')}"/>
  <polygon points="${pts(s.wing)}" fill="${fill('wing')}"/>
  <polygon points="${pts(s.bar)}" fill="${fill('bar')}"/>
  ${style === 'mono' ? '' : `<polygon points="${pts(s.stemHi)}" fill="#fff" opacity="0.14"/>
  <polygon points="${pts(s.barHi)}" fill="#FFE2B0" opacity="0.55"/>`}`;
}

export function emblemSVG(o = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${emblemInner(o)}\n</svg>\n`;
}
