import { readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';
import { format, resolveConfig } from 'prettier';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const catalog = new URL('packages/sysvars/src/catalog/', root);
const index = await readFile(new URL('index.ts', catalog), 'utf8');
const variables = [],
  headers = [];
for (const match of index.matchAll(/import (variables\d+|headers\d+) from '\.\/(.*?\.json)';/g)) {
  const entries = JSON.parse(await readFile(new URL(match[2], catalog), 'utf8'));
  (match[1].startsWith('variables') ? variables : headers).push(...entries);
}
const source = await readFile(new URL('packages/sysvars/src/markdown.ts', root), 'utf8');
// This pure formatter imports types only; transpile it with the already pinned compiler.
const module = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { systemVariableMarkdown } = await import(
  `data:text/javascript;base64,${Buffer.from(module.outputText).toString('base64')}`
);
const target = new URL('docs/SYSVARS.md', root);
const markdown = await format(systemVariableMarkdown(variables, headers), {
  ...(await resolveConfig(fileURLToPath(target))),
  parser: 'markdown',
});
if (process.argv.includes('--check')) {
  if ((await readFile(target, 'utf8')) !== markdown)
    throw new Error('docs/SYSVARS.md is stale. Run pnpm docs:sysvars.');
  console.log(
    `System-variable documentation is current (${variables.length} variables, ${headers.length} headers).`,
  );
} else {
  await writeFile(target, markdown);
  console.log(
    `Generated docs/SYSVARS.md (${variables.length} variables, ${headers.length} headers).`,
  );
}
