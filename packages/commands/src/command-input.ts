import { reverseHangulInput } from '@hancad/input';
import { getSystemVariableDefinition } from '@hancad/sysvars';
import type { PgpExternalCommand } from './pgp';
import { parsePrefixes } from './registry';
import type { CommandRegistry } from './registry';
import type { CommandPrefixes, CommandResolution } from './types';

export type CommandLineInput =
  /** Empty Enter/Space at the command prompt repeats the previous command. */
  | { kind: 'repeat' }
  /** Ordinary response to the active prompt (point, keyword, value, text). */
  | { kind: 'prompt'; text: string }
  | { kind: 'command'; resolution: CommandResolution; arguments: string[]; transparent: boolean }
  | { kind: 'sysvar'; name: string; prefixes: CommandPrefixes; arguments: string[] }
  | { kind: 'external'; command: PgpExternalCommand; arguments: string[] }
  | { kind: 'not-transparent'; name: string }
  | { kind: 'unknown'; name: string };

export interface CommandInputContext {
  /** A command is running and its prompt receives non-apostrophe input. */
  commandActive: boolean;
  /** A transparent command is already running; AutoCAD does not nest them. */
  transparentActive: boolean;
}

export function tokenizeCommandLine(line: string): string[] {
  const tokens: string[] = [];
  for (const match of line.matchAll(/"([^"]*)"|(\S+)/g)) tokens.push(match[1] ?? match[2] ?? '');
  return tokens;
}

/** Classifies one accepted command-line entry exactly once, for the UI and headless runner. */
export function interpretCommandInput(
  registry: CommandRegistry,
  line: string,
  context: CommandInputContext = { commandActive: false, transparentActive: false },
): CommandLineInput {
  const trimmed = line.trim();
  const apostrophe = trimmed.startsWith("'");
  if (context.commandActive && !apostrophe) return { kind: 'prompt', text: line };
  const tokens = tokenizeCommandLine(trimmed);
  const first = reverseHangulInput(tokens.shift() ?? '');
  if (!first) return context.commandActive ? { kind: 'prompt', text: line } : { kind: 'repeat' };
  const parsed = parsePrefixes(first);
  const nestedTransparent = apostrophe && context.transparentActive;
  const resolution = registry.resolve(first);
  if (resolution) {
    // At the command prompt an apostrophe is accepted but the command runs normally.
    const transparent = context.commandActive && apostrophe;
    if (
      nestedTransparent ||
      (resolution.prefixes.transparent && !resolution.definition.flags?.transparent)
    )
      return { kind: 'not-transparent', name: resolution.canonicalName };
    return { kind: 'command', resolution, arguments: tokens, transparent };
  }
  // An UNDEFINEd command stays unknown even when a system variable shares its name.
  if (registry.get(parsed.name)) return { kind: 'unknown', name: parsed.name };
  const external = registry.external(parsed.name);
  if (external && !apostrophe) return { kind: 'external', command: external, arguments: tokens };
  if (getSystemVariableDefinition(parsed.name)) {
    if (nestedTransparent) return { kind: 'not-transparent', name: parsed.name };
    return { kind: 'sysvar', name: parsed.name, prefixes: parsed.prefixes, arguments: tokens };
  }
  return { kind: 'unknown', name: parsed.name || first };
}
