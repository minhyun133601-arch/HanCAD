import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

// Regenerates the docs/COMMANDS.md command table from the catalog rows and alias
// tables while keeping each command's hand-written implementation status.
const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');
const catalog = [];
for (const file of ['rows-a', 'rows-d', 'rows-i', 'rows-p', 'rows-s']) {
  const text = await source(`packages/commands/src/catalog/${file}.ts`);
  for (const match of text.matchAll(/^ {2}'([^']+)',$/gm)) {
    const [name, korean, , , , phase] = match[1].split('|');
    catalog.push({ name, korean, phase: Number(phase) });
  }
}
const aliases = new Map();
for (const file of ['aliases-extended', 'aliases']) {
  const text = await source(`packages/commands/src/${file}.ts`);
  for (const match of text.matchAll(/^ {2}(?:'([^']+)'|([A-Z0-9_]+)): '([^']+)',$/gm))
    aliases.set(match[1] ?? match[2], match[3].replace(/^[-_.']+/, ''));
}
const target = new URL('docs/COMMANDS.md', root);
const document = await source('docs/COMMANDS.md');
const start = document.indexOf('| Command');
const end = document.indexOf('\n## ', start);
const statuses = new Map();
for (const match of document.slice(start, end).matchAll(/^\| ([A-Z0-9_]+) +\|(.*)\|$/gm)) {
  const cells = match[2].split('|').map((cell) => cell.trim());
  statuses.set(match[1], cells.at(-1));
}
for (const match of document.matchAll(/^\| ([A-Z0-9_]+) +\| (Partial \/[^|]*?) +\|$/gm))
  if (!statuses.has(match[1]) || statuses.get(match[1]).startsWith('Not implemented'))
    statuses.set(match[1], match[2].trim());
const rows = catalog
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((entry) => {
    const names = [...aliases]
      .filter(([, command]) => command === entry.name)
      .map(([alias]) => alias)
      .sort((a, b) => a.replace(/^-/, '').localeCompare(b.replace(/^-/, '')) || a.localeCompare(b));
    const known = statuses.get(entry.name);
    const status =
      known && !known.startsWith('Not implemented')
        ? known
        : `Not implemented; explicit message (Phase ${String(entry.phase).padStart(2, '0')})`;
    return `| ${entry.name} | ${names.join(', ')} | ${entry.korean} | ${status} |`;
  });
const table = [
  '| Command | Aliases | 한국어 | Implementation status |',
  '| --- | --- | --- | --- |',
  ...rows,
].join('\n');
const next = `${document.slice(0, start)}${table}\n${document.slice(end)}`;
const markdown = await format(next, {
  ...(await resolveConfig(fileURLToPath(target))),
  parser: 'markdown',
});
if (process.argv.includes('--check')) {
  if (markdown !== document) throw new Error('docs/COMMANDS.md is stale. Run pnpm docs:commands.');
  console.log(`Command documentation is current (${catalog.length} commands).`);
} else {
  await writeFile(target, markdown);
  console.log(`Generated docs/COMMANDS.md (${catalog.length} commands, ${aliases.size} aliases).`);
}
