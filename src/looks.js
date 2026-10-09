// One-tap looks. Each is a canvas filter plus optional tint, vignette and grain, so the preview and
// the export are the same pixels.
export const LOOKS = [
  { id: 'none', name: 'Original', filter: '' },
  { id: 'clean', name: 'Clean', filter: 'contrast(1.08) saturate(1.12) brightness(1.02)' },
  { id: 'warm', name: 'Warm', filter: 'sepia(0.18) saturate(1.25) brightness(1.03)', tint: { color: '#ff8a3a', alpha: 0.08, op: 'soft-light' } },
  { id: 'golden', name: 'Golden hour', filter: 'sepia(0.3) saturate(1.35) contrast(1.05) hue-rotate(-6deg)', tint: { color: '#ffb547', alpha: 0.14, op: 'soft-light' }, vignette: 0.25 },
  { id: 'moody', name: 'Moody', filter: 'contrast(1.2) saturate(0.78) brightness(0.9)', tint: { color: '#1b2a4a', alpha: 0.22, op: 'multiply' }, vignette: 0.45 },
  { id: 'film', name: 'Film', filter: 'contrast(1.1) saturate(0.85) sepia(0.12) brightness(1.02)', grain: 0.12, vignette: 0.2 },
  { id: 'kodak', name: 'Kodak', filter: 'contrast(1.12) saturate(1.2) sepia(0.1) hue-rotate(-4deg)', tint: { color: '#ffd27a', alpha: 0.1, op: 'overlay' }, grain: 0.08 },
  { id: 'tealorange', name: 'Teal and orange', filter: 'contrast(1.12) saturate(1.15)', tint: { color: '#0b6b7a', alpha: 0.18, op: 'multiply' }, tint2: { color: '#ff8a3a', alpha: 0.14, op: 'screen' } },
  { id: 'noir', name: 'Noir', filter: 'grayscale(1) contrast(1.28) brightness(0.96)', vignette: 0.4, grain: 0.1 },
  { id: 'neon', name: 'Neon', filter: 'saturate(1.7) contrast(1.15) hue-rotate(8deg)', tint: { color: '#c026d3', alpha: 0.12, op: 'screen' } },
  { id: 'vintage', name: 'Vintage', filter: 'sepia(0.4) contrast(0.95) brightness(1.06) saturate(0.9)', vignette: 0.35, grain: 0.18 },
  { id: 'crisp', name: 'Crisp', filter: 'contrast(1.18) saturate(1.05) brightness(1.04)' },
];
export const lookById = (id) => LOOKS.find((l) => l.id === id) || LOOKS[0];

// Scale a filter string towards identity by amount (0..1): parses each function and lerps its value.
export function scaledFilter(filter, amount) {
  if (!filter || amount >= 1) return filter || '';
  return filter.replace(/(\w[\w-]*)\(([-\d.]+)(deg)?\)/g, (m, fn, v, unit) => {
    const ident = /sepia|grayscale|hue-rotate|invert|blur/.test(fn) ? 0 : 1;
    const nv = ident + (parseFloat(v) - ident) * amount;
    return `${fn}(${nv.toFixed(3)}${unit || ''})`;
  });
}

let grainCanvas;
export function grainPattern(ctx, size = 256) {
  if (!grainCanvas) {
    grainCanvas = document.createElement('canvas'); grainCanvas.width = grainCanvas.height = size;
    const g = grainCanvas.getContext('2d'), img = g.createImageData(size, size), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = 110 + Math.random() * 90; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    g.putImageData(img, 0, 0);
  }
  return ctx.createPattern(grainCanvas, 'repeat');
}

// Apply a look's post layers (tint, vignette, grain) over a region already drawn with the filter.
export function applyLookLayers(ctx, look, amount, x, y, w, h, t = 0) {
  if (!look || look.id === 'none') return;
  const tints = [look.tint, look.tint2].filter(Boolean);
  for (const tn of tints) {
    ctx.save(); ctx.globalCompositeOperation = tn.op; ctx.globalAlpha = tn.alpha * amount; ctx.fillStyle = tn.color; ctx.fillRect(x, y, w, h); ctx.restore();
  }
  if (look.vignette) {
    ctx.save();
    const g = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.35, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${(look.vignette * amount).toFixed(3)})`);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h); ctx.restore();
  }
  if (look.grain) {
    ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = look.grain * amount;
    ctx.translate((t * 977) % 256, (t * 613) % 256);
    ctx.fillStyle = grainPattern(ctx); ctx.fillRect(x - 256, y - 256, w + 512, h + 512); ctx.restore();
  }
}
