import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  desktopEnvironment,
  inspectDesktop,
  desktopFailures,
  desktopFailureMessage,
  requiresDesktopPreflight,
} from './desktop-readiness.mjs';

export function runTauri(args, options = {}) {
  const root = options.root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const env = desktopEnvironment(options.env);
  const cli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
  if (!(options.exists ?? fs.existsSync)(cli))
    throw new Error('먼저 pnpm install로 저장소 의존성을 설치하세요.');
  if (requiresDesktopPreflight(args)) {
    const inventory = (options.inspect ?? inspectDesktop)({ env });
    if (desktopFailures(inventory).length) throw new Error(desktopFailureMessage(inventory));
  }
  return (options.spawn ?? spawn)(process.execPath, [cli, ...args], {
    cwd: path.join(root, 'apps', 'desktop'),
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const child = runTauri(process.argv.slice(2));
    child.on('error', (error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
    child.on('exit', (code) => {
      process.exitCode = code ?? 1;
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
