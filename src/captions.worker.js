// Auto captions, on the device: Whisper (tiny, quantised, about 40 MB once) through transformers.js.
// Receives 16 kHz mono Float32 audio, replies with word timings.
let pipe = null, loading = null;

async function load(lang) {
  if (pipe) return pipe;
  loading ??= (async () => {
    const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3/dist/transformers.min.js');
    env.allowLocalModels = false;
    const model = lang === 'en' ? 'onnx-community/whisper-tiny.en' : 'onnx-community/whisper-tiny';
    pipe = await pipeline('automatic-speech-recognition', model, {
      dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' },
      device: 'wasm',
      progress_callback: (p) => { if (p.status === 'progress') postMessage({ type: 'progress', stage: 'model', pct: (p.progress || 0) / 100, file: p.file }); },
    });
    return pipe;
  })();
  return loading;
}

onmessage = async (e) => {
  const { type, audio, lang, id } = e.data;
  if (type !== 'transcribe') return;
  try {
    const p = await load(lang || 'en');
    postMessage({ type: 'progress', stage: 'listen', pct: 0 });
    const out = await p(audio, {
      return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5,
      ...(lang && lang !== 'en' ? { language: lang, task: 'transcribe' } : {}),
    });
    const words = (out.chunks || []).map((c) => ({
      w: String(c.text || '').trim(), t: +(c.timestamp[0] || 0), d: Math.max(0.12, (c.timestamp[1] == null ? (c.timestamp[0] || 0) + 0.3 : c.timestamp[1]) - (c.timestamp[0] || 0)),
    })).filter((w) => w.w);
    postMessage({ type: 'done', id, words, text: out.text || '' });
  } catch (err) {
    postMessage({ type: 'error', id, message: err && err.message ? err.message : String(err) });
  }
};
