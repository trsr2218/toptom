// Tiny local server for development: node serve.mjs [port]
// Serves this folder with clean URLs and the public config endpoint the site expects on Vercel.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.argv[2] || 5173);
const root = fileURLToPath(new URL('.', import.meta.url));

// Local .env.local (never committed) supplies the public Supabase settings for /api/config.
const dotenv = {};
try {
  const envPath = join(root, '.env.local');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
      if (m) dotenv[m[1]] = m[2];
    }
  }
} catch {}
const env = (k) => process.env[k] || dotenv[k] || '';

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.txt': 'text/plain',
  '.woff2': 'font/woff2', '.map': 'application/json', '.sql': 'text/plain',
};

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  if (path === '/api/config') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
    return res.end(JSON.stringify({ supabaseUrl: env('SUPABASE_URL'), supabaseAnonKey: env('SUPABASE_ANON_KEY'), topi: false }));
  }
  if (path.startsWith('/api/')) { res.writeHead(503, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'Topi runs on Vercel functions. Local fallback is in use.' })); }
  const file = normalize(join(root, path));
  if (!file.startsWith(normalize(root))) { res.writeHead(403); return res.end(); }
  try {
    let target0 = file;
    try { await stat(target0); } catch { target0 = file + '.html'; }
    const s = await stat(target0);
    const target = s.isDirectory() ? join(target0, 'index.html') : target0;
    const data = await readFile(target);
    res.writeHead(200, {
      'content-type': types[extname(target)] || 'application/octet-stream',
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    res.end(data);
  } catch {
    try {
      const nf = await readFile(join(root, '404.html'));
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); res.end(nf);
    } catch { res.writeHead(404); res.end('Not found'); }
  }
}).listen(port, () => console.log(`Topier dev server: http://localhost:${port}`));
