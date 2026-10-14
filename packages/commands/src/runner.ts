import { DrawingDatabase } from '@hancad/db';
import { InputCancelled, InputQueue } from '@hancad/editor';
import type { CommandInput } from '@hancad/editor';
import { reverseHangulInput } from '@hancad/input';
import { getSystemVariableDefinition, SystemVariables } from '@hancad/sysvars';
import { registerCoreCommands, setVariableFromInput } from './core';
import { commandMessages } from './messages';
import { commandErrorMessage } from './diagnostics';
import { CommandRegistry } from './registry';
import type { CommandContext, CommandLocale, CommandResult } from './types';

export interface HeadlessCommandRunnerOptions {
  registry?: CommandRegistry;
  sysvars?: SystemVariables;
  database?: DrawingDatabase;
  locale?: CommandLocale;
}

export class HeadlessCommandRunner {
  readonly registry: CommandRegistry;
  readonly database: DrawingDatabase;
  readonly sysvars: SystemVariables;
  readonly locale: CommandLocale;
  private lastCommand = '';

  constructor(options: HeadlessCommandRunnerOptions = {}) {
    this.registry = options.registry ?? new CommandRegistry();
    this.database = options.database ?? options.sysvars?.database ?? new DrawingDatabase();
    this.sysvars = options.sysvars ?? new SystemVariables({ database: this.database });
    if (this.sysvars.database !== this.database)
      throw new Error('Command runner database and system variable database must match.');
    this.locale = options.locale ?? 'ko-KR';
    registerCoreCommands(this.registry);
  }

  async run(line: string, inputs: readonly CommandInput[] = []): Promise<CommandResult> {
    const messages: string[] = [];
    if (line === '\u001b')
      return { status: 'cancelled', messages: [commandMessages.cancelled(this.locale)] };
    const tokens = tokenize(line);
    let command = reverseHangulInput(tokens.shift() ?? '');
    if (!command) command = this.lastCommand;
    if (!command) return { status: 'ok', messages };
    const context: CommandContext = {
      database: this.database,
      sysvars: this.sysvars,
      locale: this.locale,
      input: new InputQueue([...tokens, ...inputs]),
      print: (message) => messages.push(message),
    };
    try {
      const resolved = this.registry.resolve(command);
      if (!resolved && !this.registry.get(command) && getSystemVariableDefinition(command)) {
        setVariableFromInput(command, context);
        this.lastCommand = command;
        return { status: 'ok', command, messages };
      }
      if (!resolved)
        return {
          status: 'unknown',
          command,
          messages: [commandMessages.unknown(command, this.locale)],
        };
      command = resolved.canonicalName;
      if (resolved.prefixes.transparent && !resolved.definition.flags?.transparent)
        return {
          status: 'error',
          command,
          messages: [commandMessages.transparent(command, this.locale)],
        };
      if (!resolved.definition.execute)
        return {
          status: 'not-implemented',
          command,
          messages: [commandMessages.pending(command, this.locale)],
        };
      await resolved.definition.execute(context);
      this.lastCommand = command;
      return { status: 'ok', command, messages };
    } catch (error) {
      if (error instanceof InputCancelled)
        return {
          status: 'cancelled',
          command,
          messages: [...messages, commandMessages.cancelled(this.locale)],
        };
      return {
        status: 'error',
        command,
        messages: [...messages, commandErrorMessage(error, this.locale)],
      };
    }
  }

  async runScript(
    lines: readonly { command: string; inputs?: readonly CommandInput[] }[],
  ): Promise<CommandResult[]> {
    const results: CommandResult[] = [];
    for (const line of lines) results.push(await this.run(line.command, line.inputs));
    return results;
  }
}

function tokenize(line: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|(\S+)/g;
  for (const match of line.matchAll(pattern)) tokens.push(match[1] ?? match[2] ?? '');
  return tokens;
}
