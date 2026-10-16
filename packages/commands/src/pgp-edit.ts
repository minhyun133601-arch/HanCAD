import { parsePgp } from './pgp';
import type { PgpExternalCommand } from './pgp';

/**
 * Line-preserving edits of a user's PGP file: ALIASEDIT changes only the lines it
 * must, so comments, ordering and the file's line endings survive.
 */
interface Lines {
  lines: string[];
  eol: string;
  bom: string;
}

function split(source: string): Lines {
  const bom = source.startsWith('﻿') ? '﻿' : '';
  const body = source.slice(bom.length);
  const eol = body.includes('\r\n') ? '\r\n' : '\n';
  const lines = body.split(/\r?\n/);
  // A trailing newline leaves one empty element; edits keep it at the end.
  return { lines, eol, bom };
}
function join({ lines, eol, bom }: Lines): string {
  return bom + lines.join(eol);
}
function insertAt(file: Lines, index: number, line: string): void {
  const end =
    file.lines.length > 0 && file.lines.at(-1) === '' ? file.lines.length - 1 : file.lines.length;
  file.lines.splice(Math.min(index, end), 0, line);
}

export function formatAliasLine(alias: string, command: string): string {
  const key = `${alias.toUpperCase()},`;
  return `${key.padEnd(Math.max(key.length + 1, 9))}*${command.toUpperCase()}`;
}
export function formatExternalLine(command: Omit<PgpExternalCommand, 'line'>): string {
  const executable = command.executable ? ` ${command.executable}` : '';
  return `${command.name},${executable}, ${command.flags},${command.allowSpaces ? '*' : ''}${command.prompt},`;
}

/** Adds or redefines an alias; the last definition is replaced, earlier ones removed. */
export function setPgpAlias(source: string, alias: string, command: string): string {
  const key = alias.toUpperCase();
  const file = split(source);
  const document = parsePgp(source);
  const matches = document.aliases
    .filter((entry) => entry.alias === key)
    .map((entry) => entry.line);
  const line = formatAliasLine(key, command);
  const last = matches.at(-1);
  if (last !== undefined) {
    file.lines[last - 1] = line;
    for (const index of matches.slice(0, -1).reverse()) file.lines.splice(index - 1, 1);
  } else {
    const after = document.aliases.at(-1)?.line;
    insertAt(file, after ?? file.lines.length, line);
  }
  return join(file);
}

/** Removes every definition of an alias. */
export function removePgpAlias(source: string, alias: string): string {
  const key = alias.toUpperCase();
  const file = split(source);
  const lines = parsePgp(source)
    .aliases.filter((entry) => entry.alias === key)
    .map((entry) => entry.line);
  for (const index of lines.reverse()) file.lines.splice(index - 1, 1);
  return join(file);
}

/** Adds or redefines an external (shell) command line. */
export function setPgpExternal(source: string, command: Omit<PgpExternalCommand, 'line'>): string {
  const name = command.name.toUpperCase();
  const file = split(source);
  const document = parsePgp(source);
  const matches = document.externals
    .filter((entry) => entry.name === name)
    .map((entry) => entry.line);
  const line = formatExternalLine({ ...command, name });
  const last = matches.at(-1);
  if (last !== undefined) {
    file.lines[last - 1] = line;
    for (const index of matches.slice(0, -1).reverse()) file.lines.splice(index - 1, 1);
  } else {
    // New external commands go after the existing ones, or before the first alias.
    const firstAlias = document.aliases[0]?.line;
    const after =
      document.externals.at(-1)?.line ??
      (firstAlias === undefined ? file.lines.length : firstAlias - 1);
    insertAt(file, after, line);
  }
  return join(file);
}

export function removePgpExternal(source: string, name: string): string {
  const key = name.toUpperCase();
  const file = split(source);
  const lines = parsePgp(source)
    .externals.filter((entry) => entry.name === key)
    .map((entry) => entry.line);
  for (const index of lines.reverse()) file.lines.splice(index - 1, 1);
  return join(file);
}
