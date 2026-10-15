import { getSystemVariableDefinition } from '@hancad/sysvars';
import type { SysvarValue } from '@hancad/sysvars';
import type { CommandInput } from '@hancad/editor';
import { commandMessages } from './messages';
import { CommandInputError } from './input-errors';
import type { CommandContext, CommandDefinition } from './types';
import type { CommandRegistry } from './registry';

export function registerCoreCommands(registry: CommandRegistry): void {
  const handlers: Record<string, (context: CommandContext) => void> = {
    GETVAR: (context) => {
      const name = context.input.requireString().toUpperCase();
      context.print(`${name} = ${formatSysvar(context.sysvars.get(name))}`);
    },
    SETVAR: (context) => setVariableFromInput(context.input.requireString().toUpperCase(), context),
    U: (context) => undo(context),
    UNDO: (context) => undo(context),
    REDO: (context) => redo(context, 1),
    MREDO: (context) => {
      const value = context.input.take();
      redo(
        context,
        value === undefined || value === 'ALL' ? context.database.redoCount : parseCount(value),
      );
    },
    UNDEFINE: (context) => changeDefinition(context, registry, true),
    REDEFINE: (context) => changeDefinition(context, registry, false),
    LTSCALE: (context) => setVariableFromInput('LTSCALE', context),
    THICKNESS: (context) => setVariableFromInput('THICKNESS', context),
    TILEMODE: (context) => setVariableFromInput('TILEMODE', context),
  };
  const variableCommands = new Set(['LTSCALE', 'THICKNESS', 'TILEMODE']);
  for (const [name, execute] of Object.entries(handlers)) {
    const definition: CommandDefinition = {
      name,
      displayName: { 'ko-KR': name, 'en-US': name },
      description: {
        'ko-KR': '시스템 변수 및 명령 기록 기반 명령입니다.',
        'en-US': 'Core system variable and command history operation.',
      },
      flags: {
        transparent: name === 'SETVAR' || name === 'GETVAR' || variableCommands.has(name),
        noUndo: name !== 'SETVAR' && !variableCommands.has(name),
      },
      execute,
    };
    if (variableCommands.has(name)) definition.systemVariable = name;
    registry.register(definition);
  }
}

export function setVariableFromInput(name: string, context: CommandContext): void {
  const current = context.sysvars.get(name);
  context.print(commandMessages.variablePrompt(name, formatSysvar(current), context.locale));
  const input = context.input.take();
  if (input === undefined || input === '') return;
  context.sysvars.set(name, parseSysvarInput(name, input));
}

export function formatSysvar(value: SysvarValue): string {
  return Array.isArray(value) ? value.join(',') : String(value);
}

function parseSysvarInput(name: string, input: CommandInput): SysvarValue {
  const definition = getSystemVariableDefinition(name);
  if (!definition) throw new Error(`Unknown system variable: ${name}`);
  if (definition.type === 'integer' || definition.type === 'real') {
    if (typeof input === 'number') return input;
    if (typeof input === 'string' && input.trim() !== '') return Number(input);
    return Number.NaN;
  }
  if (definition.type === 'boolean')
    return input === true || input === 1 || input === '1' || input === 'true';
  if (definition.type === 'point2' || definition.type === 'point3') {
    const values = typeof input === 'string' ? input.split(',').map(Number) : input;
    if (Array.isArray(values) && values.length === 2) return [Number(values[0]), Number(values[1])];
    if (Array.isArray(values) && values.length === 3)
      return [Number(values[0]), Number(values[1]), Number(values[2])];
    throw new CommandInputError('invalid-point', name);
  }
  if (typeof input !== 'string') throw new CommandInputError('string-required', name);
  return input;
}

function parseCount(input: CommandInput): number {
  const value =
    typeof input === 'number' ? input : typeof input === 'string' ? Number(input) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < 1)
    throw new CommandInputError('invalid-history-count');
  return value;
}

function undo(context: CommandContext): void {
  const input = context.input.take();
  if (typeof input === 'string' && !/^\d+$/.test(input)) {
    context.print(commandMessages.pending(`UNDO ${input.toUpperCase()}`, context.locale));
    return;
  }
  const count = input === undefined ? 1 : parseCount(input);
  if (!context.database.undo(count)) context.print(commandMessages.nothingToUndo(context.locale));
}

function redo(context: CommandContext, count: number): void {
  if (!context.database.redo(count)) context.print(commandMessages.nothingToRedo(context.locale));
}

function changeDefinition(
  context: CommandContext,
  registry: CommandRegistry,
  undefine: boolean,
): void {
  if (!context.input.remaining) {
    context.print(commandMessages.undefinePrompt(context.locale));
    return;
  }
  const name = context.input.requireString();
  const changed = undefine ? registry.undefine(name) : registry.redefine(name);
  if (!changed) context.print(commandMessages.unknown(name.toUpperCase(), context.locale));
}
