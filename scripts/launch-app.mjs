import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const address = 'http://127.0.0.1:1420/';
const logDirectory = path.join(root, 'test-artifacts');
mkdirSync(logDirectory, { recursive: true });
const logPath = path.join(logDirectory, 'local-server.log');
const log = openSync(logPath, 'a');
try {
  const server = spawn(process.execPath, [path.join(root, 'scripts', 'serve-app.mjs'), '--open'], {
    cwd: root,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', log, log],
  });
  server.on('error', (error) => {
    console.error(`HanCAD could not start: ${error.message}`);
    process.exitCode = 1;
  });
  server.unref();
} finally {
  closeSync(log);
}

let connected = false;
for (let attempt = 0; attempt < 25; attempt++) {
  try {
    const response = await fetch(address, { signal: AbortSignal.timeout(1000) });
    if (response.ok && response.headers.get('x-hancad-preview') === '1') {
      connected = true;
      break;
    }
  } catch {
    /* Allow the local server to finish starting. */
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}
if (connected) console.log(`HanCAD opened: ${address}`);
else {
  console.error(`HanCAD could not connect. Startup log: ${logPath}`);
  process.exitCode = 1;
}
