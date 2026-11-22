import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.css': 'text/css' };
export function serve() {
  const server = createServer(async (req, res) => {
    let path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (path.endsWith('/')) path += 'index.html';
    if (!path.startsWith(root)) return res.writeHead(403).end();
    let body;
    try { body = await readFile(path); } catch { return res.writeHead(404).end(); }   // read first, then send headers once
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }).end(body);
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok({ origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}
