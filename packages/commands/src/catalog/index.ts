import type { CommandFlags, CommandLocale } from '../types';
import { modalCommands, noUndoCommands, pickfirstCommands, transparentCommands } from './flags';
import { rowsA } from './rows-a';
import { rowsD } from './rows-d';
import { rowsI } from './rows-i';
import { rowsP } from './rows-p';
import { rowsS } from './rows-s';

export interface CommandMetadata {
  name: string;
  /** Korean AutoCAD uses English command names, so local and global names coincide. */
  globalName: string;
  displayName: Readonly<Record<CommandLocale, string>>;
  description: Readonly<Record<CommandLocale, string>>;
  flags: CommandFlags;
  /** Original HanCAD phase that owns the complete command. */
  phase: number;
}

function parseRow(row: string): CommandMetadata {
  const fields = row.split('|');
  const [name, ko, en, koHelp, enHelp, phase] = fields;
  if (
    fields.length !== 6 ||
    !name ||
    !/^[A-Z0-9][A-Z0-9_]*$/.test(name) ||
    !ko ||
    !en ||
    !koHelp ||
    !enHelp ||
    !phase ||
    !/^\d+$/.test(phase)
  )
    throw new Error(`Invalid command catalog row: ${row}`);
  const flags: CommandFlags = {};
  if (transparentCommands.has(name)) flags.transparent = true;
  if (modalCommands.has(name)) flags.modal = true;
  if (pickfirstCommands.has(name)) flags.pickfirst = true;
  if (noUndoCommands.has(name)) flags.noUndo = true;
  return {
    name,
    globalName: name,
    displayName: { 'ko-KR': ko, 'en-US': en },
    description: { 'ko-KR': koHelp, 'en-US': enHelp },
    flags,
    phase: Number(phase),
  };
}

function buildCatalog(): ReadonlyMap<string, CommandMetadata> {
  const catalog = new Map<string, CommandMetadata>();
  for (const row of [...rowsA, ...rowsD, ...rowsI, ...rowsP, ...rowsS]) {
    const entry = parseRow(row);
    if (catalog.has(entry.name)) throw new Error(`Duplicate command catalog row: ${entry.name}`);
    catalog.set(entry.name, entry);
  }
  for (const set of [transparentCommands, modalCommands, pickfirstCommands, noUndoCommands])
    for (const name of set)
      if (!catalog.has(name)) throw new Error(`Command flag without catalog row: ${name}`);
  return catalog;
}

/** Built once at startup; malformed rows fail loudly in every environment. */
export const commandCatalog: ReadonlyMap<string, CommandMetadata> = buildCatalog();
