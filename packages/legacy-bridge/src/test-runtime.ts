import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import type { LegacyCadRuntime } from './types';

/** Small local parser fixture; production loads the full offline DWG worker bundle. */
export function createTestRuntime(): LegacyCadRuntime {
  const context = createContext({
    TextDecoder,
    TextEncoder,
    ArrayBuffer,
    Uint8Array,
    Blob,
    URL,
    setTimeout,
    clearTimeout,
    AbortController,
    atob,
    console,
  });
  context.window = context;
  context.HeechangTool = { core: {} };
  for (const path of [
    '../runtime/cad-engine.js',
    '../../../vendor/cad-dxf.js',
    '../runtime/cad-importers.js',
    '../runtime/cad-exporters.js',
  ]) {
    runInContext(readFileSync(new URL(path, import.meta.url), 'utf8'), context, { filename: path });
  }
  return context.HeechangTool as LegacyCadRuntime;
}

export function fixtureDxf(): string {
  const record = (type: string, tags: readonly (string | number)[] = []): string =>
    [0, type, ...tags].join('\n') + '\n';
  return (
    record('SECTION', [2, 'HEADER', 9, '$INSUNITS', 70, 4]) +
    record('ENDSEC') +
    record('SECTION', [2, 'ENTITIES']) +
    record('LINE', [8, '0', 10, 0, 20, 0, 11, 100, 21, 50]) +
    record('CIRCLE', [10, 50, 20, 25, 40, 10]) +
    record('TEXT', [10, 15, 20, 20, 40, 3.5, 1, '한글 검사 도면']) +
    record('ACAD_PROXY_ENTITY') +
    record('ENDSEC') +
    record('EOF')
  );
}
