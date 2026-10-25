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
  // Premium looks, on Pro and Studio: layered grades with two tints, vignette and grain.
  { id: 'cinema', name: 'Cinema', pro: true, filter: 'contrast(1.18) saturate(0.92) brightness(0.96)', tint: { color: '#0d4f5c', alpha: 0.2, op: 'multiply' }, tint2: { color: '#ffb070', alpha: 0.12, op: 'screen' }, vignette: 0.35, grain: 0.06 },
  { id: 'bleach', name: 'Bleach bypass', pro: true, filter: 'saturate(0.45) contrast(1.35) brightness(1.02)', vignette: 0.2, grain: 0.1 },
  { id: 'pastel', name: 'Pastel', pro: true, filter: 'contrast(0.9) saturate(0.85) brightness(1.1)', tint: { color: '#ffc4dd', alpha: 0.2, op: 'soft-light' }, tint2: { color: '#c9d8ff', alpha: 0.08, op: 'screen' } },
  { id: 'sunset', name: 'Sunset', pro: true, filter: 'saturate(1.4) contrast(1.08) hue-rotate(-12deg)', tint: { color: '#ff5e3a', alpha: 0.16, op: 'soft-light' }, tint2: { color: '#7b2cff', alpha: 0.08, op: 'screen' }, vignette: 0.2 },
  { id: 'arctic', name: 'Arctic', pro: true, filter: 'saturate(0.9) contrast(1.1) brightness(1.04) hue-rotate(6deg)', tint: { color: '#6fc3ff', alpha: 0.16, op: 'soft-light' } },
  { id: 'emerald', name: 'Emerald', pro: true, filter: 'contrast(1.12) saturate(1.1)', tint: { color: '#0f6b4f', alpha: 0.16, op: 'multiply' }, tint2: { color: '#ffe08a', alpha: 0.08, op: 'screen' }, vignette: 0.15 },
  { id: 'super8', name: 'Super 8', pro: true, filter: 'sepia(0.28) saturate(1.3) contrast(1.05) brightness(1.05)', tint: { color: '#ff9d5c', alpha: 0.12, op: 'overlay' }, vignette: 0.5, grain: 0.26 },
  { id: 'chrome', name: 'Chrome', pro: true, filter: 'grayscale(1) contrast(1.1) brightness(1.08)', tint: { color: '#9fb4d6', alpha: 0.2, op: 'soft-light' }, grain: 0.05 },
  { id: 'bluehour', name: 'Blue hour', pro: true, filter: 'brightness(0.92) contrast(1.15) saturate(1.05)', tint: { color: '#2b3f8f', alpha: 0.2, op: 'multiply' }, tint2: { color: '#ff8fb1', alpha: 0.1, op: 'screen' }, vignette: 0.3 },
  { id: 'stage', name: 'Stage lights', pro: true, filter: 'saturate(1.5) contrast(1.22) brightness(0.98)', tint: { color: '#7B2CFF', alpha: 0.14, op: 'screen' }, tint2: { color: '#FF7A1A', alpha: 0.14, op: 'soft-light' }, vignette: 0.35 },
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
