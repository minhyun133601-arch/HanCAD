import { DrawingDatabase } from '@hancad/db';
import { InputCancelled, InputQueue } from '@hancad/editor';
import type { CommandInput } from '@hancad/editor';
import { SystemVariables } from '@hancad/sysvars';
import { interpretCommandInput } from './command-input';
import type { CommandInputContext } from './command-input';
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
  /** The application may localize domain failures without adding UI dependencies here. */
  errorFormatter?: (error: unknown) => string;
}

export class HeadlessCommandRunner {
  readonly registry: CommandRegistry;
  readonly database: DrawingDatabase;
  readonly sysvars: SystemVariables;
  readonly locale: CommandLocale;
  private readonly errorFormatter: (error: unknown) => string;
  private lastCommand = '';

  constructor(options: HeadlessCommandRunnerOptions = {}) {
    this.registry = options.registry ?? new CommandRegistry();
    this.database = options.database ?? options.sysvars?.database ?? new DrawingDatabase();
    this.sysvars = options.sysvars ?? new SystemVariables({ database: this.database });
    if (this.sysvars.database !== this.database)
      throw new Error('Command runner database and system variable database must match.');
    this.locale = options.locale ?? 'ko-KR';
    this.errorFormatter =
      options.errorFormatter ?? ((error) => commandErrorMessage(error, this.locale));
    registerCoreCommands(this.registry);
  }

  /** The previous command repeated by an empty Enter/Space at the command prompt. */
  get previousCommand(): string {
    return this.lastCommand;
  }

  async run(
    line: string,
    inputs: readonly CommandInput[] = [],
    situation: Partial<CommandInputContext> = {},
  ): Promise<CommandResult> {
    const messages: string[] = [];
    if (line === '\u001b')
      return { status: 'cancelled', messages: [commandMessages.cancelled(this.locale)] };
    const transparentActive =
      situation.transparentActive ?? (this.sysvars.getNumber('CMDACTIVE') & 2) !== 0;
    let input = interpretCommandInput(this.registry, line, {
      commandActive: situation.commandActive ?? false,
      transparentActive,
    });
    if (input.kind === 'repeat') {
      if (!this.lastCommand) return { status: 'ok', messages };
      input = interpretCommandInput(this.registry, this.lastCommand);
    }
    const context: CommandContext = {
      database: this.database,
      sysvars: this.sysvars,
      locale: this.locale,
      input: new InputQueue('arguments' in input ? [...input.arguments, ...inputs] : [...inputs]),
      print: (message) => messages.push(message),
    };
    let command = '';
    try {
      switch (input.kind) {
        case 'prompt':
        case 'repeat':
          return { status: 'ok', messages };
        case 'unknown':
          return {
            status: 'unknown',
            command: input.name,
            messages: [commandMessages.unknown(input.name, this.locale)],
          };
        case 'not-transparent':
          return {
            status: 'error',
            command: input.name,
            messages: [commandMessages.transparent(input.name, this.locale)],
          };
        case 'external':
          this.lastCommand = input.command.name;
          return {
            status: 'not-implemented',
            command: input.command.name,
            messages: [commandMessages.externalUnavailable(input.command.name, this.locale)],
          };
        case 'sysvar':
          this.database.invalidateSingleRedo();
          setVariableFromInput(input.name, context);
          this.lastCommand = input.name;
          return { status: 'ok', command: input.name, messages };
        case 'command':
          break;
      }
      const resolved = input.resolution;
      command = resolved.canonicalName;
      context.prefixes = resolved.prefixes;
      if (!resolved.definition.execute)
        return {
          status: 'not-implemented',
          command,
          messages: [commandMessages.pending(command, this.locale)],
        };
      const previousActive = this.sysvars.getNumber('CMDACTIVE');
      if (command !== 'REDO') this.database.invalidateSingleRedo();
      const previousNames = this.sysvars.get('CMDNAMES');
      const transparent = input.transparent || resolved.prefixes.transparent;
      try {
        this.sysvars.setRuntimeSessionValue('CMDACTIVE', previousActive | (transparent ? 2 : 1));
        this.sysvars.setRuntimeSessionValue(
          'CMDNAMES',
          transparent && previousNames !== '' ? `${previousNames}'${command}` : command,
        );
        await resolved.definition.execute(context);
      } finally {
        this.sysvars.setRuntimeSessionValue('CMDNAMES', previousNames);
        this.sysvars.setRuntimeSessionValue('CMDACTIVE', previousActive);
      }
      if (!input.transparent) this.lastCommand = command;
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
        messages: [...messages, this.errorFormatter(error)],
      };
    }
  }

  /**
   * Runs the commands of one menu/toolbar macro. With UNDO Auto on (the default)
   * they are undone by a single U, as AutoCAD groups a menu item's operations.
   */
  async runMacro(
    lines: readonly { command: string; inputs?: readonly CommandInput[] }[],
  ): Promise<CommandResult[]> {
    const group = this.database.undoAutoEnabled && !this.database.undoGroupActive;
    if (group) this.database.beginUndoGroup();
    try {
      return await this.runScript(lines);
    } finally {
      if (group && this.database.undoGroupActive) this.database.endUndoGroup();
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
