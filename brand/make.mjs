// Generates every Topier brand asset into assets/brand/ and the PWA icons into the site root.
// Run: npm run brand
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { emblemInner, emblemSVG, COLORS } from './emblem.mjs';
import { wordmarkPath } from './wordmark.mjs';

const OUT = 'assets/brand';
const ROOT = '.';
mkdirSync(OUT, { recursive: true });
const INK = COLORS.ink;
const inkRGB = { r: 13, g: 13, b: 16, alpha: 1 };
const clear = { r: 0, g: 0, b: 0, alpha: 0 };

const W = wordmarkPath(100);
const WSTROKE = 2.8; // emboldens Michroma to match the source weight

function wordmarkSVG({ color = '#fff', width = 1200 } = {}) {
  const pad = 8;
  const vb = `${W.x0 - pad} ${W.y0 - pad} ${W.w + pad * 2} ${W.h + pad * 2}`;
  const h = Math.round(width * (W.h + pad * 2) / (W.w + pad * 2));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${width}" height="${h}" role="img" aria-label="Topier">
<path d="${W.d}" fill="${color}" stroke="${color}" stroke-width="${WSTROKE}" stroke-linejoin="round"/>
</svg>
`;
}

// Horizontal lockup: emblem on the left, wordmark on the right, baseline aligned to the emblem centre.
function logoSVG({ style = 'gradient', mono = '#fff', text = '#fff', glow = false, bg = null, width = 1600 } = {}) {
  const em = 220;                      // emblem box height in lockup units
  const gap = 34;
  const ws = em * 0.62 / W.h;          // wordmark scale so its height is 62% of the emblem box
  const ww = W.w * ws, wh = W.h * ws;
  const padX = 40, padY = 36;
  const totalW = padX * 2 + em + gap + ww, totalH = padY * 2 + em;
  const wx = padX + em + gap - W.x0 * ws, wy = padY + em / 2 - wh / 2 - W.y0 * ws;
  const h = Math.round(width * totalH / totalW);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW.toFixed(1)} ${totalH.toFixed(1)}" width="${width}" height="${h}" role="img" aria-label="Topier">
${bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : ''}
<g transform="translate(${padX} ${padY}) scale(${em / 512})">${emblemInner({ style, mono, glow, pad: 10, id: 'lh' })}</g>
<g transform="translate(${wx.toFixed(2)} ${wy.toFixed(2)}) scale(${ws.toFixed(5)})"><path d="${W.d}" fill="${text}" stroke="${text}" stroke-width="${WSTROKE}" stroke-linejoin="round"/></g>
</svg>
`;
}

// Stacked lockup: emblem above the wordmark, centred (the splash and social layout).
function stackedSVG({ style = 'gradient', mono = '#fff', text = '#fff', glow = false, bg = null, width = 1200 } = {}) {
  const em = 400, gap = 36;
  const ws = em * 0.9 / W.w;           // wordmark width is 90% of the emblem box
  const ww = W.w * ws, wh = W.h * ws;
  const padX = 60, padY = 50;
  const totalW = padX * 2 + Math.max(em, ww), totalH = padY * 2 + em + gap + wh;
  const ex = (totalW - em) / 2, wx = (totalW - ww) / 2 - W.x0 * ws, wy = padY + em + gap - W.y0 * ws;
  const h = Math.round(width * totalH / totalW);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW.toFixed(1)} ${totalH.toFixed(1)}" width="${width}" height="${h}" role="img" aria-label="Topier">
${bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : ''}
<g transform="translate(${ex.toFixed(2)} ${padY}) scale(${em / 512})">${emblemInner({ style, mono, glow, pad: 10, id: 'ls' })}</g>
<g transform="translate(${wx.toFixed(2)} ${wy.toFixed(2)}) scale(${ws.toFixed(5)})"><path d="${W.d}" fill="${text}" stroke="${text}" stroke-width="${WSTROKE}" stroke-linejoin="round"/></g>
</svg>
`;
}

// App icon: dark rounded tile with the emblem and a faint brand glow. `safe` shrinks the emblem for maskable icons.
function tileSVG({ size = 512, radius = 0.22, safe = false, glow = true } = {}) {
  const r = size * radius;
  const pad = safe ? 0.21 : 0.14;      // maskable safe zone is the inner 80%
  const es = size * (1 - pad * 2);
  const ex = (size - es) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
<defs>
  <radialGradient id="tile-bg" cx="0.72" cy="0.2" r="0.95">
    <stop offset="0" stop-color="#2A1A24"/><stop offset="0.5" stop-color="#15121A"/><stop offset="1" stop-color="${INK}"/>
  </radialGradient>
</defs>
<rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="url(#tile-bg)"/>
<g transform="translate(${ex} ${ex}) scale(${es / 512})">${emblemInner({ glow, pad: 8, id: 'ti' })}</g>
</svg>
`;
}

// Social card and splash: dark field with soft brand light and the stacked lockup.
function fieldSVG(w, h, { lockup = 'stacked', scale = 0.5, tagline = true } = {}) {
  const lk = lockup === 'stacked' ? stackedSVG({ glow: true, width: 1000 }) : logoSVG({ glow: true, width: 1000 });
  const vb = /viewBox="([^"]+)"/.exec(lk)[1].split(' ').map(Number);
  const lw = vb[2], lh = vb[3];
  const k = Math.min((w * scale) / lw, (h * 0.5) / lh);
  const lx = (w - lw * k) / 2, ly = (h - lh * k) / 2 - (tagline ? h * 0.03 : 0);
  const inner = lk.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<defs>
  <radialGradient id="f1" cx="0.85" cy="0.1" r="0.7"><stop offset="0" stop-color="${COLORS.orange}" stop-opacity="0.42"/><stop offset="1" stop-color="${COLORS.orange}" stop-opacity="0"/></radialGradient>
  <radialGradient id="f2" cx="0.1" cy="0.95" r="0.7"><stop offset="0" stop-color="${COLORS.violet}" stop-opacity="0.38"/><stop offset="1" stop-color="${COLORS.violet}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${w}" height="${h}" fill="${INK}"/>
<rect width="${w}" height="${h}" fill="url(#f1)"/>
<rect width="${w}" height="${h}" fill="url(#f2)"/>
<g transform="translate(${lx.toFixed(1)} ${ly.toFixed(1)}) scale(${k.toFixed(4)})">${inner}</g>
${tagline ? `<text x="${w / 2}" y="${(h * 0.5 + lh * k / 2 + h * 0.07).toFixed(0)}" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="${Math.round(h * 0.036)}" font-weight="600" fill="#A7A3B0">Turn a full set into a clip you can post. Free for artists.</text>` : ''}
</svg>
`;
}

// Minimal ICO container with PNG entries (16, 32, 48).
function ico(pngs) {
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let off = 6 + dir.length;
  pngs.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o); dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3); dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(buf.length, o + 8); dir.writeUInt32LE(off, o + 12);
    off += buf.length;
  });
  return Buffer.concat([head, dir, ...pngs.map((p) => p.buf)]);
}

const png = (svg, w, h, bg = clear) => sharp(Buffer.from(svg), { density: 300 }).resize(w, h, { fit: 'contain', background: bg }).png().toBuffer();
const save = (name, data) => { writeFileSync(join(OUT, name), data); console.log('  ' + name); };
const saveRoot = (name, data) => { writeFileSync(join(ROOT, name), data); console.log('  ' + name); };

console.log('SVG masters');
save('topier-mark.svg', emblemSVG({ pad: 24 }));
save('topier-mark-glow.svg', emblemSVG({ pad: 40, glow: true }));
save('topier-mark-white.svg', emblemSVG({ style: 'mono', mono: '#fff', pad: 24 }));
save('topier-mark-black.svg', emblemSVG({ style: 'mono', mono: '#000', pad: 24 }));
save('topier-wordmark-white.svg', wordmarkSVG({ color: '#fff' }));
save('topier-wordmark-black.svg', wordmarkSVG({ color: '#000' }));
save('topier-logo.svg', logoSVG({}));
save('topier-logo-on-dark.svg', logoSVG({ bg: INK, glow: true }));
save('topier-logo-white.svg', logoSVG({ style: 'mono', mono: '#fff', text: '#fff' }));
save('topier-logo-black.svg', logoSVG({ style: 'mono', mono: '#000', text: '#000' }));
save('topier-logo-stacked.svg', stackedSVG({}));
save('topier-logo-stacked-on-dark.svg', stackedSVG({ bg: INK, glow: true }));
save('topier-logo-stacked-white.svg', stackedSVG({ style: 'mono', mono: '#fff', text: '#fff' }));
save('topier-app-icon.svg', tileSVG({}));

console.log('PNG exports');
for (const s of [256, 512, 1024, 2048]) save(`topier-mark-${s}.png`, await png(emblemSVG({ pad: 24 }), s, s));
save('topier-mark-white-1024.png', await png(emblemSVG({ style: 'mono', mono: '#fff', pad: 24 }), 1024, 1024));
save('topier-mark-black-1024.png', await png(emblemSVG({ style: 'mono', mono: '#000', pad: 24 }), 1024, 1024));
const lh = (svg, w) => { const vb = /viewBox="([^"]+)"/.exec(svg)[1].split(' ').map(Number); return Math.round(w * vb[3] / vb[2]); };
let s;
s = logoSVG({}); save('topier-logo-2048.png', await png(s, 2048, lh(s, 2048)));
s = logoSVG({ bg: INK, glow: true }); save('topier-logo-on-dark-2048.png', await png(s, 2048, lh(s, 2048)));
s = logoSVG({ style: 'mono', mono: '#fff', text: '#fff' }); save('topier-logo-white-2048.png', await png(s, 2048, lh(s, 2048)));
s = logoSVG({ style: 'mono', mono: '#000', text: '#000' }); save('topier-logo-black-2048.png', await png(s, 2048, lh(s, 2048)));
s = stackedSVG({}); save('topier-logo-stacked-2048.png', await png(s, 2048, lh(s, 2048)));
s = stackedSVG({ bg: INK, glow: true }); save('topier-logo-stacked-on-dark-2048.png', await png(s, 2048, lh(s, 2048)));
s = wordmarkSVG({ color: '#fff' }); save('topier-wordmark-white-2048.png', await png(s, 2048, lh(s, 2048)));
s = wordmarkSVG({ color: '#000' }); save('topier-wordmark-black-2048.png', await png(s, 2048, lh(s, 2048)));

console.log('App icons');
save('topier-app-icon-1024.png', await png(tileSVG({ size: 1024 }), 1024, 1024));
save('topier-app-icon-square-1024.png', await png(tileSVG({ size: 1024, radius: 0 }), 1024, 1024));

console.log('Site icons (root)');
saveRoot('favicon.svg', emblemSVG({ pad: 10 }));
const fav = [];
for (const sz of [16, 32, 48]) { const b = await png(emblemSVG({ pad: 6 }), sz, sz); fav.push({ size: sz, buf: b }); saveRoot(`favicon-${sz}.png`, b); }
saveRoot('favicon.ico', ico(fav));
saveRoot('apple-touch-icon.png', await png(tileSVG({ size: 180, radius: 0 }), 180, 180));
saveRoot('icon-192.png', await png(tileSVG({ size: 192 }), 192, 192));
saveRoot('icon-512.png', await png(tileSVG({ size: 512 }), 512, 512));
saveRoot('icon-maskable-192.png', await png(tileSVG({ size: 192, radius: 0, safe: true }), 192, 192));
saveRoot('icon-maskable-512.png', await png(tileSVG({ size: 512, radius: 0, safe: true }), 512, 512));
saveRoot('icon-mono-512.png', await png(emblemSVG({ style: 'mono', mono: '#fff', pad: 60 }), 512, 512));

console.log('Social and splash');
saveRoot('og-image.png', await png(fieldSVG(1200, 630, { lockup: 'horizontal', scale: 0.62 }), 1200, 630));
save('topier-social-square-1080.png', await png(fieldSVG(1080, 1080, { scale: 0.6 }), 1080, 1080));
save('topier-splash-1080x1920.png', await png(fieldSVG(1080, 1920, { scale: 0.62, tagline: false }), 1080, 1920));
save('topier-splash-1170x2532.png', await png(fieldSVG(1170, 2532, { scale: 0.62, tagline: false }), 1170, 2532));
save('topier-splash-1920x1080.png', await png(fieldSVG(1920, 1080, { lockup: 'horizontal', scale: 0.5, tagline: false }), 1920, 1080));
save('topier-cover-1500x500.png', await png(fieldSVG(1500, 500, { lockup: 'horizontal', scale: 0.5, tagline: false }), 1500, 500));

writeFileSync(join(OUT, 'README.md'), `# Topier brand assets

Generated by \`npm run brand\` from \`brand/emblem.mjs\` (the emblem as geometry) and \`brand/wordmark.mjs\`
(the wordmark as outlines: a custom T plus Michroma, SIL Open Font License). Edit the source, not these files.

## Colours

| Token | Hex | Use |
| --- | --- | --- |
| Orange | \`${COLORS.orange}\` | Primary accent, buttons, the arrow |
| Orange highlight | \`${COLORS.orangeHi}\` | Arrow tip, hover |
| Magenta | \`${COLORS.magenta}\` | Gradient midpoint |
| Violet | \`${COLORS.violet}\` | Secondary accent, the stem |
| Ink | \`${INK}\` | Background |

Brand gradient: orange to magenta to violet, top-right to bottom-left.

## Files

- \`topier-mark*.svg|png\`: the emblem alone (gradient, white, black). Use at any size; the SVG is the master.
- \`topier-wordmark-*\`: the word alone.
- \`topier-logo*\`: horizontal lockup, emblem left of the word. Default for headers and documents.
- \`topier-logo-stacked*\`: emblem above the word. Default for splash screens, social avatars, print.
- \`topier-app-icon*\`: the dark tile for app stores.
- \`topier-social-square-1080.png\`, \`topier-cover-1500x500.png\`: profile and cover images.
- \`topier-splash-*\`: splash screens, portrait phone, iPhone, and landscape.

Site icons live in the site root: \`favicon.ico\`, \`favicon.svg\`, \`favicon-16/32/48.png\`, \`apple-touch-icon.png\`,
\`icon-192.png\`, \`icon-512.png\`, \`icon-maskable-*.png\`, \`icon-mono-512.png\`, \`og-image.png\`.

## Rules

- Keep the emblem's clear space at least the width of its stem on every side.
- Do not recolour the gradient. On light backgrounds use the black mono version, on photos use the white mono version.
- Do not add the old tagline line (edit, create, sound) under the word. The lockup is emblem and word only.
- Minimum size: the emblem at 16 px, the horizontal lockup at 96 px wide.
`);
console.log('done');
