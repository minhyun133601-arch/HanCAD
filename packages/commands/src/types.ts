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
  prefixes?: CommandPrefixes;
  print(message: string): void;
}
export interface CommandDefinition {
  name: string;
  /** Global (English) name accepted with the _ prefix in every language. */
  globalName?: string;
  /** Original HanCAD phase that owns the complete command. */
  phase?: number;
  aliases?: readonly string[];
  displayName: Readonly<Record<CommandLocale, string>>;
  description: Readonly<Record<CommandLocale, string>>;
  flags?: CommandFlags;
  /** A command that opens a system-variable value prompt instead of a manager. */
  systemVariable?: string;
  /**
   * Interactive command-line prompts: the next prompt for the answers collected so
   * far, or undefined when the command can run with them (UNDO, -INPUTSEARCHOPTIONS).
   */
  nextPrompt?: (values: readonly string[], state: PromptState) => PromptStep | undefined;
  execute?: (context: CommandContext) => void | Promise<void>;
}
/** What a command's prompt sequence may read while answers are being collected. */
export interface PromptState {
  database: DrawingDatabase;
  sysvars: SystemVariables;
  locale: CommandLocale;
  prefixes: CommandPrefixes;
}
export interface PromptStep {
  prompt: string;
  /** Printed before the prompt, e.g. after an invalid keyword. */
  notice?: string;
  /** Free text: spaces belong to the answer and the IME may compose Korean. */
  text?: boolean;
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
