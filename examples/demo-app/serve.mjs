// Serves ./site on http://127.0.0.1:4173 for the demo.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = join(dirname(fileURLToPath(import.meta.url)), 'site');
createServer(async (request, response) => {
  try {
    const body = await readFile(join(site, 'index.html'));
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
  } catch {
    response.writeHead(500).end();
  }
}).listen(4173, '127.0.0.1');
