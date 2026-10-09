// Tiny local server for development: node serve.mjs [port]
// Serves this folder with the same headers vercel.json sets in production.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.argv[2] || 5173);
const root = fileURLToPath(new URL('.', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.txt': 'text/plain',
  '.woff2': 'font/woff2', '.map': 'application/json',
};

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(root, path));
  if (!file.startsWith(normalize(root))) { res.writeHead(403); return res.end(); }
  try {
    const s = await stat(file);
    const target = s.isDirectory() ? join(file, 'index.html') : file;
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
