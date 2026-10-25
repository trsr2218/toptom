// Preview: fits the canvas to the stage, lets you drag clips and text around on the picture.
import { hitTest } from '../engine/render.js';
import { findClip } from '../model.js';

let app;
const $ = (id) => document.getElementById(id);

export function mount(a) {
  app = a;
  const cv = $('preview');
  new ResizeObserver(resize).observe($('previewWrap'));
  app.on('change', () => { fitCanvas(); app.player.draw(); });
  app.on('mode', () => setTimeout(resize, 30));
  let drag = null;
  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    const ctx = cv.getContext('2d');
    const hit = hitTest(ctx, app.project, app.time, fx, fy, cv.width, cv.height);
    app.select(hit ? hit.id : null);
    if (!hit) return;
    cv.setPointerCapture(e.pointerId); cv.classList.add('grab');
    drag = { c: hit, x0: hit.x, y0: hit.y, fx, fy, moved: false };
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = cv.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    drag.moved = true;
    drag.c.x = Math.max(-0.5, Math.min(1.5, drag.x0 + fx - drag.fx)); drag.c.y = Math.max(-0.5, Math.min(1.5, drag.y0 + fy - drag.fy));
    // snap to centre lines
    if (Math.abs(drag.c.x - 0.5) < 0.015) drag.c.x = 0.5; if (Math.abs(drag.c.y - 0.5) < 0.015) drag.c.y = 0.5;
    app.player.draw();
  });
  const end = () => {
    cv.classList.remove('grab');
    if (!drag) return;
    const { c, x0, y0, moved } = drag; drag = null;
    if (!moved) return;
    const nx = c.x, ny = c.y; c.x = x0; c.y = y0;
    app.set('Move', () => { c.x = nx; c.y = ny; }, { merge: 'pos-' + c.id });
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', (e) => {
    const f = app.selected(); if (!f) return; e.preventDefault();
    const c = f.clip; const s = Math.max(0.05, Math.min(6, c.scale * (e.deltaY < 0 ? 1.05 : 0.95)));
    app.set('Scale', () => { c.scale = s; }, { merge: 'scale-' + c.id });
  }, { passive: false });
  cv.addEventListener('dblclick', () => { const f = app.selected(); if (f && f.clip.type === 'text') { $('inspector').classList.add('open'); const ta = $('inspector').querySelector('textarea'); ta && ta.focus(); } });
  resize();
}

function fitCanvas() {
  const p = app.project, cv = $('preview');
  const long = Math.max(p.w, p.h), k = Math.min(1, 1080 / long);  // preview resolution cap
  const w = Math.round(p.w * k), h = Math.round(p.h * k);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
}

export function resize() {
  if (!app) return;
  fitCanvas();
  const wrap = $('previewWrap'), cv = $('preview'), p = app.project;
  const pad = 32, simple = app.mode === 'simple' && innerWidth > 900;
  const phoneSimple = app.mode === 'simple' && innerWidth <= 900;
  const aw = wrap.clientWidth - pad - (simple ? 336 : 0), ah = (phoneSimple ? wrap.clientHeight * 0.5 : wrap.clientHeight) - pad;
  const r = Math.min(aw / p.w, ah / p.h);
  cv.style.width = `${Math.max(80, Math.floor(p.w * r))}px`; cv.style.height = `${Math.max(80, Math.floor(p.h * r))}px`;
  app.player.draw();
}
