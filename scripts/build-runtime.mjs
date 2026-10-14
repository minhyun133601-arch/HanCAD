import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeFiles = [
  'vendor/cad-offline.js',
  'packages/legacy-bridge/runtime/cad-engine.js',
  'packages/legacy-bridge/runtime/cad-exporters.js',
  'packages/legacy-bridge/runtime/cad-modify.js',
  'packages/legacy-bridge/runtime/cad-importers.js',
];
const modules = await Promise.all(
  runtimeFiles.map(async (file) => {
    const source = await readFile(path.join(root, file), 'utf8');
    new vm.Script(source, { filename: file });
    return `// ${file}\n${source}`;
  }),
);
const outputDirectory = path.join(root, 'apps', 'web', 'public', 'runtime');
await mkdir(outputDirectory, { recursive: true });
const source = 'window.HeechangTool = { core: {} };\n' + modules.join('\n');
await writeFile(path.join(outputDirectory, 'cad-runtime.js'), source, 'utf8');
console.log(`Built local CAD runtime (${(Buffer.byteLength(source) / 1048576).toFixed(1)} MB).`);
