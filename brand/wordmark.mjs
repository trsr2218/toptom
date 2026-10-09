// "Topier" wordmark as outlines so no font needs to load anywhere.
// The "T" is custom (slanted crossbar ends and a pointed stem, echoing the emblem);
// "opier" is set in Michroma (OFL), a Eurostile Extended style face.
import opentype from 'opentype.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
let font;
const f2 = (v) => v.toFixed(2);

/**
 * Returns { d, x0, y0, w, h } for the wordmark at the given size (cap height is about 0.72 x size).
 * The path is already slightly emboldened so it needs no stroke.
 */
export function wordmarkPath(size = 100) {
  font ??= opentype.parse(readFileSync(join(here, 'src/Michroma-Regular.ttf')).buffer);
  const capTop = -font.charToGlyph('T').getBoundingBox().y2 / font.unitsPerEm * size; // negative y is up
  const cap = -capTop;
  // Custom T. Crossbar leans left: both ends cut at the same slant. Stem sits left of centre, pointed bottom.
  const barH = cap * 0.19, slant = cap * 0.16, barW = size * 0.86;
  const stemL = barW * 0.42, stemW = size * 0.19, stemBottomSlant = cap * 0.11;
  const T = [
    [slant, capTop], [barW, capTop], [barW - slant, capTop + barH],
    [stemL + stemW, capTop + barH], [stemL + stemW, -stemBottomSlant], [stemL, 0],
    [stemL, capTop + barH], [0, capTop + barH],
  ];
  const tPath = 'M' + T.map(([x, y]) => `${f2(x)} ${f2(y)}`).join('L') + 'Z';
  const rest = font.getPath('opier', barW - slant * 0.55, 0, size, { kerning: true, letterSpacing: -0.025 });
  const rb = rest.getBoundingBox();
  const d = tPath + rest.toPathData(2);
  const x0 = 0, x1 = rb.x2, y0 = capTop, y1 = Math.max(rb.y2, 0);
  return { d, x0, y0, w: x1 - x0, h: y1 - y0, cap };
}
