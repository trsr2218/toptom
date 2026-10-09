import sharp from 'sharp';
import { emblemSVG } from './emblem.mjs';
import { wordmarkPath } from './wordmark.mjs';
const bg = { r: 13, g: 13, b: 16, alpha: 1 };
const svg = Buffer.from(emblemSVG({ glow: true }));
const em = await sharp({ create: { width: 512, height: 512, channels: 4, background: bg } }).composite([{ input: svg }]).png().toBuffer();
const side = await sharp('brand/src/_emblem-zoom.png').resize(512, 512, { fit: 'contain', background: bg }).toBuffer();
await sharp({ create: { width: 1024, height: 512, channels: 4, background: bg } })
  .composite([{ input: side, left: 0, top: 0 }, { input: em, left: 512, top: 0 }]).png().toFile('brand/src/_compare.png');
const w = wordmarkPath(100);
const wsvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${w.x0 - 6} ${w.y0 - 6} ${w.w + 12} ${w.h + 12}" width="1400" height="${Math.round(1400 * (w.h + 12) / (w.w + 12))}">
<path d="${w.d}" fill="#fff" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/></svg>`;
const wm = await sharp(Buffer.from(wsvg)).flatten({ background: bg }).png().toBuffer();
const src = await sharp('brand/src/_word-zoom.png').toBuffer();
const h1 = (await sharp(wm).metadata()).height, h2 = (await sharp(src).metadata()).height;
await sharp({ create: { width: 1400, height: h1 + h2 + 20, channels: 4, background: bg } })
  .composite([{ input: src, left: 0, top: 0 }, { input: wm, left: 0, top: h2 + 20 }]).png().toFile('brand/src/_compare-word.png');
console.log('ok', w.w, w.h);
