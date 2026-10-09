// Topier clip tool: find the strongest moment in a set and render a branded vertical clip.
// Everything runs in the browser with ffmpeg.wasm; the video is mounted read-only
// (WORKERFS) so even a long set is never copied into memory.
import { FFmpeg } from './vendor/ffmpeg/dist/esm/index.js';

const CORE_VERSION = '0.12.6';
const CORE_SOURCES = [
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
  `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
];
const CORE_CACHE = `topier-core-${CORE_VERSION}`;
const $ = (id) => document.getElementById(id);
const S = { file: null, ff: null, loaded: false, mounted: false, dur: 0, start: null, hasAudio: true, vw: 1920, vh: 1080, rendering: false, logo: null };

const fmt = (t) => {
  t = Math.max(0, t);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
const status = (el, msg, err) => { el.textContent = msg; el.classList.toggle('err', !!err); };
const len = () => Number($('len').value);
const even = (n) => Math.round(n / 2) * 2;

// ---------- startup ----------
function supported() {
  if (typeof WebAssembly !== 'object') return 'This browser has no WebAssembly, which the editor needs.';
  if (typeof Worker !== 'function') return 'This browser cannot run background workers, which the editor needs.';
  if (!('WORKERFS' in window) && typeof File !== 'function') return 'This browser cannot read local files.';
  return '';
}
(function boot() {
  const why = supported();
  if (why) { $('unsupported').hidden = false; $('unsupportedWhy').textContent = why + ' Try a current Chrome, Edge, Firefox or Safari.'; $('step1').hidden = true; }
  // Brand mark drawn on every clip. Loaded once; the overlay skips it if it is not ready.
  const img = new Image();
  img.onload = () => { S.logo = img; if (S.start !== null) drawPreview(); };
  img.src = '/assets/brand/topier-logo-white.svg';
  const splash = $('splash');
  const hide = () => { splash.classList.add('gone'); setTimeout(() => splash.remove(), 400); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(hide, hide); else hide();
  setTimeout(hide, 2500);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('install').hidden = false; });
  $('install').addEventListener('click', async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('install').hidden = true; });
  window.addEventListener('beforeunload', (e) => { if (S.rendering) { e.preventDefault(); e.returnValue = ''; } });
})();

// ---------- ffmpeg ----------
async function getFF(statusEl) {
  if (S.loaded) return S.ff;
  const ff = new FFmpeg();
  status(statusEl, 'Loading the editor, about 31 MB, only the first time...');
  let lastErr;
  for (const base of CORE_SOURCES) {
    try {
      const wasmURL = await cachedBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm', (got, cached) => {
        status(statusEl, cached ? 'Opening the editor...' : `Loading the editor: ${(got / 1048576).toFixed(0)} of about 31 MB...`);
      });
      const coreURL = await cachedBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript');
      await ff.load({ coreURL, wasmURL });
      S.ff = ff; S.loaded = true;
      return ff;
    } catch (e) { lastErr = e; console.warn('core source failed', base, e); }
  }
  throw lastErr || new Error('core unavailable');
}

// Fetch with a byte counter (the helper in @ffmpeg/util breaks when the CDN sends no content-length),
// and keep the file in the Cache API so the 31 MB download happens once per device.
async function cachedBlobURL(url, type, onBytes) {
  let cache = null;
  try { cache = await caches.open(CORE_CACHE); } catch {}
  if (cache) {
    const hit = await cache.match(url);
    if (hit) { if (onBytes) onBytes(0, true); return URL.createObjectURL(new Blob([await hit.arrayBuffer()], { type })); }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${url}`);
  const reader = res.body.getReader(), parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length;
    if (onBytes) onBytes(got, false);
  }
  const blob = new Blob(parts, { type });
  if (cache) { try { await cache.put(url, new Response(blob, { headers: { 'content-type': type } })); } catch {} }
  return URL.createObjectURL(blob);
}

async function mountFile(ff) {
  if (S.mounted) { try { await ff.unmount('/in'); } catch {} }
  else { try { await ff.createDir('/in'); } catch {} }
  await ff.mount('WORKERFS', { files: [S.file] }, '/in');
  S.mounted = true;
  return `/in/${S.file.name}`;
}

// ---------- step 1: file ----------
const drop = $('drop');
['dragover', 'dragenter'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, () => drop.classList.remove('over')));
drop.addEventListener('drop', (ev) => { ev.preventDefault(); if (ev.dataTransfer.files[0]) pick(ev.dataTransfer.files[0]); });
$('file').addEventListener('change', (e) => e.target.files[0] && pick(e.target.files[0]));

function pick(file) {
  if (S.rendering) return;
  S.file = file; S.start = null; S.hasAudio = true;
  $('dropText').textContent = `${file.name} (${(file.size / 1048576).toFixed(0)} MB). Tap to change.`;
  const v = $('src');
  if (v.src) URL.revokeObjectURL(v.src);
  v.hidden = false; v.preload = 'auto'; v.src = URL.createObjectURL(file); v.load();
  S.dur = 0;
  $('step2').hidden = false; $('cands').innerHTML = ''; $('chosen').textContent = '';
  $('step3').hidden = true; $('step4').hidden = true; $('out').hidden = true;
  status($('aStatus'), 'Reading the video...');
  v.onloadedmetadata = () => {
    S.dur = v.duration; S.vw = v.videoWidth || 1920; S.vh = v.videoHeight || 1080;
    status($('aStatus'), `Video is ${fmt(S.dur)} long.`);
  };
  v.onerror = () => {
    status($('aStatus'), 'This browser cannot preview this file, but it may still work. Try "Find the best moments".');
  };
}

// ---------- step 2: find the loudest moments ----------
$('analyze').addEventListener('click', async () => {
  const btn = $('analyze'); const st = $('aStatus');
  if (!S.file) { status(st, 'Pick a video first.', true); return; }
  btn.disabled = true;
  try {
    const ff = await getFF(st);
    const path = await mountFile(ff);
    status(st, 'Listening to the whole video. A long set can take a few minutes...');
    const onLog = ({ message }) => {
      // The player may not have read the file (background tab, odd codec), so take length and size from ffmpeg too.
      const d = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(message);
      if (d && !S.dur) S.dur = +d[1] * 3600 + +d[2] * 60 + +d[3];
      const vs = /Video: .*?(\d{2,5})x(\d{2,5})/.exec(message);
      if (vs && !$('src').videoWidth) { S.vw = +vs[1]; S.vh = +vs[2]; }
      const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(message);
      if (m && S.dur) {
        const t = +m[1] * 3600 + +m[2] * 60 + +m[3];
        status(st, `Listening... ${Math.min(99, Math.round((t / S.dur) * 100))}%`);
      }
    };
    ff.on('log', onLog);
    await ff.exec(['-i', path, '-vn', '-ac', '1', '-ar', '2000', '-f', 's16le', '/a.raw']);
    ff.off('log', onLog);
    let raw;
    try { raw = await ff.readFile('/a.raw'); } catch { raw = new Uint8Array(0); }
    try { await ff.deleteFile('/a.raw'); } catch {}
    if (!raw.length) {
      S.hasAudio = false;
      status(st, 'No sound found in this video, so we cannot pick the loudest part. Choose the start yourself below.', true);
      return;
    }
    S.hasAudio = true;
    const pcm = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 2));
    showCands(bestWindows(pcm, 2000, len()));
  } catch (e) {
    console.error(e);
    status(st, S.loaded
      ? 'Something went wrong reading this video. Try a smaller file, or an MP4.'
      : 'Could not download the editor. Check your connection and try again.', true);
  } finally { btn.disabled = false; }
});

// Loudness per half second, then the 3 loudest stretches of the clip length that do not overlap.
function bestWindows(pcm, rate, L) {
  const step = rate / 2, n = Math.floor(pcm.length / step);
  const rms = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * step; j < (i + 1) * step; j++) s += pcm[j] * pcm[j];
    rms[i] = Math.sqrt(s / step);
  }
  const w = Math.min(n, L * 2);
  const score = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += rms[i];
    if (i >= w) sum -= rms[i - w];
    if (i >= w - 1) score.push({ start: (i - w + 1) / 2, v: sum / w });
  }
  score.sort((a, b) => b.v - a.v);
  const picks = [];
  for (const c of score) {
    if (picks.every((p) => Math.abs(p.start - c.start) >= L)) picks.push(c);
    if (picks.length === 3) break;
  }
  const top = picks[0] ? picks[0].v : 1;
  return picks.map((p) => ({ start: p.start, level: p.v / top }));
}

function showCands(list) {
  const box = $('cands'); box.innerHTML = '';
  status($('aStatus'), list.length ? 'The loudest moments, best first. Preview one, then use it.' : 'Nothing found. Choose the start yourself below.');
  list.forEach((c, i) => {
    const d = document.createElement('div');
    d.className = 'cand';
    d.innerHTML = `<span class="t">${i + 1}. ${fmt(c.start)} to ${fmt(c.start + len())}</span>
      <span class="lv"><i style="width:${Math.round(c.level * 100)}%"></i></span>
      <button class="link" type="button" data-a="play">Preview</button>
      <button class="btn" type="button" data-a="use">Use this</button>`;
    d.querySelector('[data-a=play]').onclick = () => { const v = $('src'); v.currentTime = c.start; v.muted = false; v.play().catch(() => {}); };
    d.querySelector('[data-a=use]').onclick = () => { box.querySelectorAll('.cand').forEach((x) => x.classList.remove('on')); d.classList.add('on'); choose(c.start); };
    box.appendChild(d);
  });
}

$('useHere').addEventListener('click', () => { if (S.file) choose($('src').currentTime || 0); });

function choose(t) {
  S.start = Math.max(0, S.dur ? Math.min(t, Math.max(0, S.dur - len())) : t);
  $('chosen').textContent = `Clip: ${fmt(S.start)} to ${fmt(S.start + len())}`;
  $('step3').hidden = false; $('step4').hidden = false;
  const v = $('src'); v.pause(); v.currentTime = S.start;
  v.addEventListener('seeked', drawPreview, { once: true });
  setTimeout(drawPreview, 600);
  $('step3').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- step 3: layout ----------
// All layout is in 1080 x 1920 units, then scaled to the output size.
function layout(W) {
  const k = W / 1080;
  const boxW = 1000, boxH = 1100;
  const r = Math.min(boxW / S.vw, boxH / S.vh);
  const fw = even(S.vw * r * k), fh = even(S.vh * r * k);
  const fx = even((W - fw) / 2), fy = even((W * 16 / 9 - fh) / 2 + 40 * k);
  return { k, W, H: even(W * 16 / 9), fw, fh, fx, fy };
}

function fitFont(ctx, text, max, size, family) {
  let s = size;
  do { ctx.font = `${s}px ${family}`; s -= 4; } while (ctx.measureText(text).width > max && s > 20);
  return s + 4;
}

// The text layer: a dark scrim with a clear window where the video sits, the name above, the link below,
// and the Topier mark at the foot.
function drawOverlay(ctx, L) {
  const { k, W, H, fw, fh, fx, fy } = L;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, W, H);
  ctx.clearRect(fx, fy, fw, fh);
  const accent = $('accent').value;
  ctx.strokeStyle = accent; ctx.lineWidth = 6 * k;
  ctx.strokeRect(fx - 3 * k, fy - 3 * k, fw + 6 * k, fh + 6 * k);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const name = ($('name').value || 'Your name').toUpperCase();
  const ev = $('event').value;
  const link = $('link').value;
  const nameSize = fitFont(ctx, name, 980 * k, 120 * k, 'Anton');
  ctx.font = `${nameSize}px Anton`; ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 12 * k;
  ctx.fillText(name, W / 2, fy - 40 * k);
  if (ev) {
    ctx.font = `800 ${44 * k}px Inter`; ctx.fillStyle = accent;
    ctx.fillText(ev.toUpperCase(), W / 2, fy - 40 * k - nameSize - 10 * k);
  }
  ctx.shadowBlur = 0;
  if (link) {
    ctx.font = `800 ${46 * k}px Inter`;
    const tw = ctx.measureText(link).width + 60 * k, th = 84 * k, ty = fy + fh + 60 * k;
    ctx.fillStyle = accent;
    roundRect(ctx, W / 2 - tw / 2, ty, tw, th, th / 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.textBaseline = 'middle';
    ctx.fillText(link, W / 2, ty + th / 2 + 2 * k);
  }
  if (S.logo && S.logo.naturalWidth) {
    const lw = 200 * k, lhh = lw * S.logo.naturalHeight / S.logo.naturalWidth;
    ctx.globalAlpha = 0.8;
    ctx.drawImage(S.logo, W / 2 - lw / 2, H - lhh - 56 * k, lw, lhh);
    ctx.globalAlpha = 1;
  }
}
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

async function loadFonts() {
  try { await Promise.all([document.fonts.load('120px Anton'), document.fonts.load('800 44px Inter')]); } catch {}
}

async function drawPreview() {
  if (S.start === null) return;
  await loadFonts();
  const cv = $('prev'), ctx = cv.getContext('2d'), v = $('src');
  const L = layout(cv.width);
  ctx.save();
  ctx.filter = 'blur(8px)';
  const sc = Math.max(L.W / S.vw, L.H / S.vh);
  try { ctx.drawImage(v, (L.W - S.vw * sc) / 2, (L.H - S.vh * sc) / 2, S.vw * sc, S.vh * sc); } catch {}
  ctx.restore();
  try { ctx.drawImage(v, L.fx, L.fy, L.fw, L.fh); } catch {}
  const o = document.createElement('canvas'); o.width = L.W; o.height = L.H;
  drawOverlay(o.getContext('2d'), L);
  ctx.drawImage(o, 0, 0);
}
['name', 'event', 'link', 'accent'].forEach((id) => $(id).addEventListener('input', () => S.start !== null && drawPreview()));
$('sync').addEventListener('input', (e) => { $('syncOut').textContent = `${Number(e.target.value).toFixed(2)} s`; });
$('len').addEventListener('change', () => { if (S.start !== null) choose(S.start); });

// ---------- step 4: render ----------
$('render').addEventListener('click', async () => {
  if (S.rendering || S.start === null) return;
  S.rendering = true;
  const btn = $('render'), st = $('rStatus'), bar = $('rBar'), barBox = $('rBarBox');
  btn.disabled = true; $('out').hidden = true; bar.style.width = '0'; barBox.setAttribute('aria-valuenow', '0');
  try {
    await loadFonts();
    const ff = await getFF(st);
    const path = await mountFile(ff);
    const W = Number($('quality').value), L = layout(W), D = len();
    const o = document.createElement('canvas'); o.width = L.W; o.height = L.H;
    drawOverlay(o.getContext('2d'), L);
    const png = new Uint8Array(await (await new Promise((r) => o.toBlob(r, 'image/png'))).arrayBuffer());
    await ff.writeFile('/ov.png', png);

    const shift = Number($('sync').value);
    const aStart = Math.max(0, S.start + shift);
    const bw = even(L.W / 4), bh = even(L.H / 4);
    const vf = [
      `[0:v]split[a][c]`,
      `[a]scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},boxblur=8:2,scale=${L.W}:${L.H},setsar=1[bg]`,
      `[c]scale=${L.fw}:${L.fh},setsar=1[fg]`,
      `[bg][fg]overlay=${L.fx}:${L.fy}[b]`,
      `[b][2:v]overlay=0:0,fps=30,format=yuv420p[v]`,
    ];
    const args = ['-ss', String(S.start), '-t', String(D), '-i', path,
      '-ss', String(aStart), '-t', String(D), '-i', path, '-i', '/ov.png'];
    if (S.hasAudio) {
      vf.push(`[1:a]afade=t=in:d=0.3,afade=t=out:st=${Math.max(0, D - 0.8)}:d=0.8[au]`);
      args.push('-filter_complex', vf.join(';'), '-map', '[v]', '-map', '[au]', '-c:a', 'aac', '-b:a', '160k');
    } else {
      args.push('-filter_complex', vf.join(';'), '-map', '[v]');
    }
    args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-t', String(D), '-movflags', '+faststart', '/out.mp4');

    status(st, 'Making your clip. Keep this tab open...');
    const onProg = ({ time }) => {
      const p = Math.min(1, Math.max(0, time / 1e6 / D));
      bar.style.width = `${Math.round(p * 100)}%`; barBox.setAttribute('aria-valuenow', String(Math.round(p * 100)));
      status(st, `Making your clip... ${Math.round(p * 100)}%`);
    };
    ff.on('progress', onProg);
    const code = await ff.exec(args);
    ff.off('progress', onProg);
    if (code !== 0) throw new Error(`ffmpeg exit ${code}`);
    const data = await ff.readFile('/out.mp4');
    try { await ff.deleteFile('/out.mp4'); } catch {}
    try { await ff.deleteFile('/ov.png'); } catch {}
    const slug = ($('name').value || 'clip').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const fileName = `${slug || 'clip'}-topier-${len()}s.mp4`;
    const blob = new Blob([data.buffer], { type: 'video/mp4' });
    if ($('outVid').src) URL.revokeObjectURL($('outVid').src);
    const url = URL.createObjectURL(blob);
    $('outVid').src = url;
    $('dl').href = url; $('dl').download = fileName;
    const file = new File([blob], fileName, { type: 'video/mp4' });
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    $('share').hidden = !canShare;
    $('share').onclick = () => navigator.share({ files: [file], title: 'Topier clip' }).catch(() => {});
    $('out').hidden = false; bar.style.width = '100%'; barBox.setAttribute('aria-valuenow', '100');
    status(st, 'Done. Watch it, then download.');
    $('out').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (e) {
    console.error(e);
    status(st, S.loaded
      ? 'Something went wrong making the clip. Try Fast quality, or a shorter clip.'
      : 'Could not download the editor. Check your connection and try again.', true);
  } finally { S.rendering = false; btn.disabled = false; }
});

$('again').addEventListener('click', () => { $('out').hidden = true; $('step2').scrollIntoView({ behavior: 'smooth' }); });
