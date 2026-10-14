import type { DrawingDatabase } from '@hancad/db';
import type { InputQueue } from '@hancad/editor';
import type { SystemVariables } from '@hancad/sysvars';

export type CommandLocale = 'ko-KR' | 'en-US';
export interface CommandFlags {
  transparent?: boolean;
  modal?: boolean;
  pickfirst?: boolean;
  noUndo?: boolean;
}
export interface CommandContext {
  database: DrawingDatabase;
  sysvars: SystemVariables;
  input: InputQueue;
  locale: CommandLocale;
  print(message: string): void;
}
export interface CommandDefinition {
  name: string;
  aliases?: readonly string[];
  displayName: Readonly<Record<CommandLocale, string>>;
  description: Readonly<Record<CommandLocale, string>>;
  flags?: CommandFlags;
  /** A command that opens a system-variable value prompt instead of a manager. */
  systemVariable?: string;
  execute?: (context: CommandContext) => void | Promise<void>;
}
export interface CommandPrefixes {
  global: boolean;
  builtin: boolean;
  commandLine: boolean;
  transparent: boolean;
}
export interface CommandResolution {
  name: string;
  canonicalName: string;
  prefixes: CommandPrefixes;
  definition: CommandDefinition;
}
export interface CommandResult {
  status: 'ok' | 'unknown' | 'not-implemented' | 'cancelled' | 'error';
  command?: string;
  messages: string[];
}
