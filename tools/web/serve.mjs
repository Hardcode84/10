import {resolve, sep} from 'node:path';
const root = resolve(import.meta.dir, '../../build/web');
const port = Number(process.argv[2] || 8000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be from 1 through 65535');
if (!await Bun.file(resolve(root, 'index.html')).exists()) throw new Error('Build the game first: crust labyrinth.crs --web');
const server = Bun.serve({hostname:'127.0.0.1', port, async fetch(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', {status:405});
  let path;
  try { path = decodeURIComponent(new URL(request.url).pathname); } catch { return new Response('Invalid path', {status:400}); }
  const filePath = resolve(root, '.' + (path === '/' ? '/index.html' : path));
  if (!filePath.startsWith(root + sep)) return new Response('Forbidden', {status:403});
  const file = Bun.file(filePath);
  if (!await file.exists()) return new Response('Not found', {status:404});
  return new Response(request.method === 'HEAD' ? null : file, {headers:{'Content-Type':file.type, 'Cache-Control':'no-store'}});
}});
console.log(`SPINWARD: http://127.0.0.1:${server.port}`);
