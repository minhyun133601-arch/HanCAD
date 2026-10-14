import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cargoBin = path.join(process.env.USERPROFILE || process.env.HOME || '', '.cargo', 'bin');
const env = { ...process.env, PATH: `${cargoBin}${path.delimiter}${process.env.PATH || ''}` };
const cli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
if (!fs.existsSync(cli))
  throw new Error('Install the workspace dependencies with pnpm install first.');
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: path.join(root, 'apps', 'desktop'),
  env,
  stdio: 'inherit',
  windowsHide: true,
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
