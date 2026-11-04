import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve('.');
const port = Number(process.env.PORT || 3000);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function safePath(urlPath) {
  const pathname = decodeURIComponent(urlPath.split('?')[0]);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const publicRelative = /^(data|images|audio|manus-routes\.json)(\/|$)/.test(relative) ? join('public', relative) : relative;
  const file = normalize(join(root, publicRelative));
  return file === root || file.startsWith(`${root}${sep}`) ? file : null;
}

async function fileFor(urlPath) {
  const direct = safePath(urlPath);
  if (direct) {
    try {
      const info = await stat(direct);
      if (info.isFile()) return direct;
    } catch {}
  }
  if (urlPath === '/' || !extname(urlPath)) return join(root, 'index.html');
  return null;
}

createServer(async (req, res) => {
  const file = await fileFor(req.url || '/');
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Server error');
  }
}).listen(port, '0.0.0.0', () => console.log(`LexiLoop listening on ${port}`));
