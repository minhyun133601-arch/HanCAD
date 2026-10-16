/**
 * Program parameters (PGP) grammar shared by acad.pgp and AutoCorrectUserDB.pgp:
 *   alias,*command
 *   command,[executable],bitflag,[*]prompt[,return_code]
 * Lines beginning with ';' are comments; blank lines are ignored.
 */
export interface PgpAlias {
  alias: string;
  command: string;
  line: number;
}
export interface PgpExternalCommand {
  name: string;
  executable: string;
  /** 1 = do not wait, 2 = minimized, 4 = hidden, 8 = quote the argument. */
  flags: number;
  prompt: string;
  /** A leading * in the prompt allows spaces in the user's response. */
  allowSpaces: boolean;
  line: number;
}
export interface PgpDocument {
  aliases: PgpAlias[];
  externals: PgpExternalCommand[];
  invalidLines: number[];
}

const namePattern = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;
const commandPattern = /^[-_.']*[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function parsePgp(source: string): PgpDocument {
  const document: PgpDocument = { aliases: [], externals: [], invalidLines: [] };
  source
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .forEach((raw, index) => {
      const line = index + 1;
      const text = raw.trim();
      if (!text || text.startsWith(';')) return;
      const alias = /^([^,\s]+)\s*,\s*\*\s*([^\s;,]+)\s*(?:;.*)?$/.exec(text);
      if (alias?.[1] && alias[2]) {
        if (namePattern.test(alias[1]) && commandPattern.test(alias[2]))
          document.aliases.push({
            alias: alias[1].toUpperCase(),
            command: alias[2].toUpperCase(),
            line,
          });
        else document.invalidLines.push(line);
        return;
      }
      const external = parseExternal(text, line);
      if (external) document.externals.push(external);
      else document.invalidLines.push(line);
    });
  return document;
}

function parseExternal(text: string, line: number): PgpExternalCommand | undefined {
  const fields = text.split(',');
  if (fields.length < 4) return undefined;
  const name = fields[0]?.trim() ?? '';
  const executable = fields[1]?.trim() ?? '';
  const flagText = fields[2]?.trim() ?? '';
  // The prompt itself may not contain commas; anything after it is the return code.
  const promptField = fields[3] ?? '';
  if (!namePattern.test(name) || !/^\d+$/.test(flagText)) return undefined;
  const allowSpaces = promptField.trimStart().startsWith('*');
  return {
    name: name.toUpperCase(),
    executable,
    flags: Number(flagText),
    prompt: (allowSpaces ? promptField.trimStart().slice(1) : promptField).trimStart(),
    allowSpaces,
    line,
  };
}

/** Serializes aliases in the canonical "ALIAS, *COMMAND" form with aligned columns. */
export function formatPgp(
  aliases: readonly { alias: string; command: string }[],
  externals: readonly PgpExternalCommand[] = [],
  header: readonly string[] = [],
): string {
  const lines = header.map((line) => `; ${line}`);
  if (externals.length) {
    lines.push('', '; External commands');
    for (const item of externals)
      lines.push(
        `${item.name},${item.executable ? ` ${item.executable}` : ''}, ${item.flags},${item.allowSpaces ? '*' : ''}${item.prompt},`,
      );
  }
  if (aliases.length) {
    lines.push('', '; Command aliases');
    const width = Math.max(...aliases.map((item) => item.alias.length)) + 1;
    for (const item of aliases) lines.push(`${`${item.alias},`.padEnd(width + 1)}*${item.command}`);
  }
  return `${lines.join('\r\n')}\r\n`;
}
