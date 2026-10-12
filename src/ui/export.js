// Export sheet: pick the platform, watch the progress, download or share.
import { EXPORTS } from '../presets.js';
import { exportProject, webCodecsAvailable, canEncode, preset4K } from '../engine/export.js';
import { has, openPlans } from '../plan.js';
import { projectDuration } from '../model.js';
import * as H from '../habits.js';

let app;
export function mount(a) { app = a; }

export function open(a) {
  app = a || app;
  const p = app.project, dur = projectDuration(p);
  if (dur <= 0) return app.toast('Add a clip first.', true);
  const port = p.h > p.w, sq = p.h === p.w;
  const fav = H.favourite('export', 1);
  const list = [...EXPORTS].sort((x, y) => (score(y) - score(x)) || ((y.id === fav) - (x.id === fav)));
  function score(e) { const ep = e.h > e.w, es = e.h === e.w; return (ep === port && es === sq) ? 2 : (ep === port ? 1 : 0); }
  const s = app.sheet(`<h3>Export</h3><p class="muted">${Math.round(dur)} seconds · made on this device${webCodecsAvailable() ? '' : ' · this browser records in real time'}</p>
    <div class="preset-list">${list.map((e, i) => `<label><input type="radio" name="preset" value="${e.id}" ${i === 0 ? 'checked' : ''}> <strong>${e.name}</strong><small>${e.w} × ${e.h}${score(e) < 2 ? ' · refits' : ''}</small></label>`).join('')}</div>
    ${quality()}
    <p class="muted" style="font-size:12px">${p.watermark ? 'The Topier mark sits in the corner on the free plan.' : 'No watermark.'} Keep this tab open while it renders.</p>
    <div id="exProg" hidden><div class="bar"><i id="exBar"></i></div><div class="row between"><span id="exMsg" class="muted">Starting...</span><button class="btn sm ghost" id="exCancel">Cancel</button></div></div>
    <div id="exOut" hidden><video id="exVid" controls playsinline></video><div class="row" style="margin-top:10px"><a id="exDl" class="btn primary" download>Download</a><button id="exShare" class="btn" hidden>Share</button><button id="exAgain" class="btn ghost">Export another</button></div></div>
    <div class="row" id="exGo" style="margin-top:10px"><button class="btn primary" id="exStart">Export</button></div>`);
  s.querySelector('#exStart').onclick = () => run(s);
  wireQuality(s);
}

// Pro and Studio: 4K and a bitrate of your choosing. Everyone else sees what it is and where to get it.
function quality() {
  if (!webCodecsAvailable()) return '';
  if (!has('pro')) return `<div class="sec" id="exQ"><h4>Quality</h4><div class="row between"><span class="muted" style="font-size:12px">1080p at the best bitrate for each app. 4K and custom bitrate come with Pro.</span><button class="btn sm" id="exUp" type="button">See Pro</button></div></div>`;
  return `<div class="sec" id="exQ"><h4>Quality</h4>
    <div class="row" style="margin-bottom:8px"><button class="chip on" data-q="std" type="button">Standard</button><button class="chip" data-q="4k" type="button">4K</button><span class="muted" id="exQNote" style="font-size:12px"></span></div>
    <label class="f">Bitrate<span class="val" id="exBrVal">Auto</span><input type="range" id="exBr" min="0" max="80" step="1" value="0"></label>
    <p class="muted" style="font-size:12px;margin:0">Auto picks what each app recommends. Higher keeps more detail and makes a bigger file.</p></div>`;
}
function wireQuality(s) {
  const up = s.querySelector('#exUp'); if (up) up.onclick = () => { app.closeSheet(); openPlans('pro'); };
  const br = s.querySelector('#exBr'); if (!br) return;
  const cur = () => { const e = EXPORTS.find((x) => x.id === s.querySelector('input[name=preset]:checked').value); return s.querySelector('[data-q="4k"]').classList.contains('on') ? preset4K(e) : e; };
  const paint = () => { const e = cur(); s.querySelector('#exBrVal').textContent = +br.value ? `${br.value} Mbps` : `Auto, ${Math.round(e.kbps / 1000)} Mbps`; s.querySelector('#exQNote').textContent = `${e.w} × ${e.h}`; };
  br.oninput = paint;
  s.querySelectorAll('input[name=preset]').forEach((r) => r.onchange = paint);
  s.querySelectorAll('[data-q]').forEach((b) => b.onclick = async () => {
    if (b.dataset.q === '4k') { const e = preset4K(cur()); if (!(await canEncode(e.w, e.h, e.fps, e.kbps))) return app.toast('This device cannot encode 4K. Try a desktop with Chrome or Edge.', true); }
    s.querySelectorAll('[data-q]').forEach((x) => x.classList.toggle('on', x === b)); paint();
  });
  paint();
}

async function run(s) {
  const id = s.querySelector('input[name=preset]:checked').value;
  const base = EXPORTS.find((e) => e.id === id);
  const k4 = s.querySelector('[data-q="4k"].on'), br = s.querySelector('#exBr');
  const preset = k4 ? preset4K(base) : { ...base };
  if (br && +br.value) preset.kbps = +br.value * 1000;
  const p = app.project;
  // Export at the chosen size: temporarily refit the canvas if the aspect differs.
  const ow = p.w, oh = p.h;
  const same = Math.abs(p.w / p.h - preset.w / preset.h) < 0.01;
  if (!same) { p.w = preset.w; p.h = preset.h; }
  s.querySelector('#exProg').hidden = false; s.querySelector('#exGo').hidden = true; s.querySelector('.preset-list').hidden = true; if (s.querySelector('#exQ')) s.querySelector('#exQ').hidden = true;
  const ac = new AbortController(); app._sheetAbort = ac; app._exporting = true;
  s.querySelector('#exCancel').onclick = () => ac.abort();
  app.player.pause();
  const t0 = performance.now();
  try {
    H.bump('export', base.id); H.length(projectDuration(p));
    const blob = await exportProject(p, preset, {
      getMedia: (mid) => app.getMedia(mid), signal: ac.signal,
      onProgress: ({ stage, pct, eta }) => {
        const bar = s.querySelector('#exBar'), msg = s.querySelector('#exMsg'); if (!bar) return;
        bar.style.width = `${Math.round((pct || 0) * 100)}%`;
        msg.textContent = stage === 'audio' ? 'Mixing the sound...' : stage === 'convert' ? 'Packing the file...' : stage === 'done' ? 'Done' : `Rendering ${Math.round((pct || 0) * 100)}%${eta ? ` · about ${fmtEta(eta)} left` : ''}`;
      },
    });
    const name = `${(p.name || 'topier').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${preset.id}.${blob.type.includes('webm') ? 'webm' : 'mp4'}`;
    const url = URL.createObjectURL(blob);
    s.querySelector('#exProg').hidden = true; s.querySelector('#exOut').hidden = false;
    const v = s.querySelector('#exVid'); v.src = url;
    const dl = s.querySelector('#exDl'); dl.href = url; dl.download = name;
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { const sh = s.querySelector('#exShare'); sh.hidden = false; sh.onclick = () => navigator.share({ files: [file], title: p.name }).catch(() => {}); }
    s.querySelector('#exAgain').onclick = () => { app.closeSheet(); open(app); };
    app.toast(`Exported in ${fmtEta((performance.now() - t0) / 1000)}`);
  } catch (e) {
    console.error(e);
    if (e.message !== 'cancelled') { s.querySelector('#exMsg').textContent = 'Export failed: ' + (e.message || 'try a smaller size'); s.querySelector('#exMsg').style.color = 'var(--bad)'; }
    else app.closeSheet();
  } finally {
    if (!same) { p.w = ow; p.h = oh; }
    app._exporting = false; app._sheetAbort = null; app.player.draw();
  }
}
const fmtEta = (s) => s < 60 ? `${Math.max(1, Math.round(s))} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
