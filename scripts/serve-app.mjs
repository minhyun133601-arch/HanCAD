import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps', 'web', 'dist');
const port = 1420;
const address = `http://127.0.0.1:${port}`;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

await stat(path.join(dist, 'index.html')).catch(() => {
  throw new Error('최신 실행 파일을 먼저 빌드하세요: pnpm build');
});

const server = http.createServer(async (request, response) => {
  response.setHeader('X-HanCAD-Preview', '1');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url || '/', address).pathname);
    const target = path.resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!target.startsWith(`${dist}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    const information = await stat(target);
    if (!information.isFile()) {
      response.writeHead(404).end();
      return;
    }
    const contents = request.method === 'HEAD' ? null : await readFile(target);
    response.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream');
    response.setHeader('Content-Length', contents?.byteLength ?? information.size);
    response.writeHead(200);
    if (request.method === 'HEAD') response.end();
    else response.end(contents);
  } catch (error) {
    response.writeHead(error instanceof URIError ? 400 : 404).end();
  }
});

server.on('error', async (error) => {
  if (error.code === 'EADDRINUSE') {
    try {
      const running = await fetch(address, { signal: AbortSignal.timeout(2000) });
      if (running.headers.get('x-hancad-preview') === '1') {
        console.log(`HanCAD 실행 중: ${address}`);
        return;
      }
    } catch {
      /* Report the occupied port below. */
    }
  }
  console.error(`HanCAD 실행 실패: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  console.log(`HanCAD 실행 중: ${address}`);
  console.log('최신 기능을 확인하려면 브라우저를 새로고침하세요. 종료: Ctrl+C');
});
