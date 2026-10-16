import { useEffect, useMemo, useRef, useState } from 'react';
import { CommandRegistry, HeadlessCommandRunner, formatSysvarInput } from '@hancad/commands';
import type { CommandPrefixes, CommandResult, PromptStep } from '@hancad/commands';
import { DrawingDatabase } from '@hancad/db';
import { getSystemVariableDefinition, SystemVariables } from '@hancad/sysvars';
import type { DrawingDocument } from '@hancad/sysvars';
import { getMessages, type Locale } from '@hancad/ui';
import type { PromptInputMode } from '@hancad/input';
import { restoreProfileVariables, subscribeProfileVariables } from './profile-storage';
import { errorMessage } from './error-presenter';
import { InputHistory } from './command-line/input-history';

export interface HistoryLine {
  id: number;
  text: string;
  kind: 'echo' | 'output';
}

type PromptSession =
  | { kind: 'idle' }
  | { kind: 'variable-name'; command: 'GETVAR' | 'SETVAR' }
  | { kind: 'variable-value'; command: string; name: string }
  /** A command with its own prompt sequence (UNDO, MREDO, -INPUTSEARCHOPTIONS). */
  | {
      kind: 'prompted';
      command: string;
      /** The typed command token, rerun with the collected answers. */
      line: string;
      prefixes: CommandPrefixes;
      values: string[];
    };

type Slot = 'main' | 'nested';
const idleSlots: Readonly<Record<Slot, PromptSession>> = {
  main: { kind: 'idle' },
  nested: { kind: 'idle' },
};

export function useCommandSession(locale: Locale, document?: DrawingDocument) {
  const messages = getMessages(locale);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [runtime] = useState(() => {
    const database = document?.database ?? new DrawingDatabase();
    const sysvars = document?.sysvars ?? new SystemVariables({ database });
    if (!document) restoreProfileVariables(sysvars.profile);
    return {
      database,
      sysvars,
      registry: new CommandRegistry(),
    };
  });
  useEffect(
    () => (document ? undefined : subscribeProfileVariables(runtime.sysvars.profile)),
    [runtime, document],
  );
  const runner = useMemo(
    () =>
      new HeadlessCommandRunner({
        ...runtime,
        locale,
        errorFormatter: (error) => errorMessage(error, messagesRef.current),
      }),
    [runtime, locale],
  );
  const [history, setHistory] = useState<HistoryLine[]>([
    { id: 0, text: messages.commandReady, kind: 'output' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  // The main slot holds a command's own prompts; the nested slot a transparent
  // command's >> prompts (SETVAR, GETVAR, a variable name) inside another command.
  const [prompts, setPrompts] = useState<Record<Slot, PromptSession>>(idleSlots);
  const slots = useRef<Record<Slot, PromptSession>>(idleSlots);
  const serial = useRef(1);
  const inputs = useRef(
    new InputHistory(() => {
      try {
        return runtime.sysvars.getNumber('CMDINPUTHISTORYMAX');
      } catch {
        return 20;
      }
    }),
  );
  const lastCommand = useRef('');
  /** Menu macros may hide their input echo (^P, MENUECHO) or all output (^Q). */
  const echo = useRef<'all' | 'no-echo' | 'quiet'>('all');
  /** Canonical name of the command most recently started from the command line. */
  const [startedCommand, setStartedCommand] = useState<string | null>(null);
  const pending = useRef(false);

  function transition(slot: Slot, next: PromptSession): void {
    slots.current = { ...slots.current, [slot]: next };
    setPrompts(slots.current);
  }

  function promptText(session: PromptSession, slot: Slot = 'main'): string {
    const text = basePrompt(session);
    return slot === 'nested' && session.kind !== 'idle' ? `>>${text}` : text;
  }
  function basePrompt(session: PromptSession): string {
    if (session.kind === 'idle') return messages.commandPrompt;
    if (session.kind === 'variable-name') return messages.sysvarNamePrompt;
    if (session.kind === 'prompted')
      // Recomputed on render so a language switch relocalizes the active prompt.
      return (
        nextStep(session.command, session.prefixes, session.values)?.prompt ??
        messages.commandPrompt
      );
    try {
      const current = runtime.sysvars.get(session.name);
      return messages.sysvarValuePrompt(
        session.name,
        formatSysvarInput(session.name, current, runtime.sysvars),
      );
    } catch (error) {
      return messages.commandFailure(errorMessage(error, messages));
    }
  }

  function openVariablePrompt(
    slot: Slot,
    next: Extract<PromptSession, { kind: 'variable-value' }>,
  ): void {
    try {
      runtime.sysvars.get(next.name);
      transition(slot, next);
      print(promptText(next, slot));
    } catch (error) {
      transition(slot, { kind: 'idle' });
      print(messages.commandFailure(errorMessage(error, messages)));
    }
  }

  function print(text: string, kind: HistoryLine['kind'] = 'output'): void {
    if (echo.current === 'quiet' || (echo.current === 'no-echo' && kind === 'echo')) return;
    const line = { id: serial.current++, text, kind };
    setHistory((previous) => [...previous.slice(-299), line]);
  }

  function changeInput(value: string): void {
    setInput(value);
    inputs.current.resetCursor();
  }

  /** INPUTHISTORYMODE bit 1 enables Up/Down recall by prompt context. */
  function recall(direction: -1 | 1, context = 'command'): void {
    if ((runtime.sysvars.getNumber('INPUTHISTORYMODE') & 1) === 0) return;
    const value = inputs.current.recall(context, direction);
    if (value !== undefined) setInput(value);
  }
  function remember(context: string, value: string): void {
    inputs.current.add(context, value);
  }

  /**
   * Answers the active prompt or starts a command. With `transparent`, an apostrophe
   * entry runs inside the current command: the caller has echoed it after the outer
   * prompt, its prompts start with >> and it does not become the repeat command.
   */
  async function execute(value: string, options: { transparent?: boolean } = {}): Promise<void> {
    if (pending.current) return;
    setInput('');
    inputs.current.resetCursor();
    const slot: Slot =
      options.transparent || slots.current.nested.kind !== 'idle' ? 'nested' : 'main';
    const nested = slot === 'nested';
    const active = slots.current[slot];
    if (active.kind === 'prompted') {
      print(`${promptText(active, slot)} ${value}`, 'echo');
      const values = [...active.values, value];
      const step = nextStep(active.command, active.prefixes, values);
      if (step) showStep(slot, { ...active, values }, step);
      else {
        const result = await run(active.line, values, nested);
        if (result.status === 'ok') transition(slot, { kind: 'idle' });
      }
      return;
    }
    if (active.kind === 'variable-name') {
      const name = value.trim().toUpperCase();
      print(`${promptText(active, slot)} ${name}`, 'echo');
      if (!name) {
        transition(slot, { kind: 'idle' });
        return;
      }
      const definition = getSystemVariableDefinition(name);
      if (active.command === 'GETVAR' || !definition) {
        const result = await run('GETVAR', [name], nested);
        if (result.status === 'ok') transition(slot, { kind: 'idle' });
      } else {
        const next: PromptSession = { kind: 'variable-value', command: 'SETVAR', name };
        openVariablePrompt(slot, next);
      }
      return;
    }
    if (active.kind === 'variable-value') {
      print(`${promptText(active, slot)} ${value}`, 'echo');
      const result = await run(
        active.command,
        active.command === 'SETVAR' ? [active.name, value] : [value],
        nested,
      );
      if (result.status === 'ok') transition(slot, { kind: 'idle' });
      return;
    }
    if (nested && !value.trim()) return;
    const line = (nested ? value.trim().replace(/^'/, '') : value.trim()) || lastCommand.current;
    if (!line) return;
    inputs.current.add('command', nested ? value.trim() : line);
    if (!nested) {
      lastCommand.current = line;
      print(messages.commandEcho(line), 'echo');
    }
    const tokens = line.split(/\s+/);
    const resolution = runtime.registry.resolve(tokens[0] ?? '');
    const command = resolution?.canonicalName;
    if (
      command !== 'REDO' &&
      (resolution?.definition.execute || getSystemVariableDefinition(tokens[0] ?? ''))
    )
      runtime.database.invalidateSingleRedo();
    if (resolution && command && resolution.definition.nextPrompt) {
      const values = tokens.slice(1);
      const step = nextStep(command, resolution.prefixes, values);
      if (step) {
        const line = tokens[0] ?? command;
        const base = { kind: 'prompted', command, line, prefixes: resolution.prefixes } as const;
        showStep(slot, { ...base, values }, step);
        return;
      }
    }
    if ((command === 'SETVAR' || command === 'GETVAR') && tokens.length === 1) {
      const next: PromptSession = { kind: 'variable-name', command };
      transition(slot, next);
      print(promptText(next, slot));
      return;
    }
    const variableCommand = resolution?.definition.systemVariable;
    const variableName = variableCommand
      ? variableCommand
      : command === 'SETVAR' && tokens.length === 2
        ? tokens[1]?.toUpperCase()
        : line.toUpperCase();
    const definition = variableName ? getSystemVariableDefinition(variableName) : undefined;
    if (
      variableName &&
      definition &&
      !definition.readonly &&
      (!command || command === 'SETVAR' || variableCommand !== undefined) &&
      (tokens.length === 1 || command === 'SETVAR')
    ) {
      const next: PromptSession = {
        kind: 'variable-value',
        command: command === 'SETVAR' ? command : variableName,
        name: variableName,
      };
      openVariablePrompt(slot, next);
      return;
    }
    await run(nested ? value.trim() : line, [], nested);
  }

  function nextStep(
    command: string,
    prefixes: CommandPrefixes,
    values: readonly string[],
  ): PromptStep | undefined {
    return runtime.registry.get(command)?.nextPrompt?.(values, {
      database: runtime.database,
      sysvars: runtime.sysvars,
      locale,
      prefixes,
    });
  }
  function showStep(
    slot: Slot,
    next: Extract<PromptSession, { kind: 'prompted' }>,
    step: PromptStep,
  ): void {
    if (step.notice) print(step.notice);
    transition(slot, next);
    print(promptText(next, slot));
  }

  async function run(
    line: string,
    values: readonly string[] = [],
    transparent = false,
  ): Promise<CommandResult> {
    pending.current = true;
    setBusy(true);
    try {
      // Inside another command only apostrophe input runs; the outer command stays named.
      const text = transparent && !line.startsWith("'") ? `'${line}` : line;
      const result = await runner.run(text, values, transparent ? { commandActive: true } : {});
      for (const output of result.messages) print(output);
      if (result.status === 'ok' && result.command && !transparent)
        setStartedCommand(result.command);
      return result;
    } catch (error) {
      print(messages.commandFailure(errorMessage(error, messages)));
      return { status: 'error', messages: [] };
    } finally {
      pending.current = false;
      setBusy(false);
      setRevision((value) => value + 1);
    }
  }

  function cancel(notify = true): void {
    transition('main', { kind: 'idle' });
    transition('nested', { kind: 'idle' });
    changeInput('');
    if (notify) print(messages.cancel);
  }
  function startCommand(value: string): void {
    if (slots.current.main.kind !== 'idle' || slots.current.nested.kind !== 'idle') cancel();
    void execute(value);
  }
  function refresh(): void {
    setRevision((value) => value + 1);
  }

  function inputMode(session: PromptSession): PromptInputMode {
    if (session.kind === 'idle') return 'command';
    if (session.kind === 'prompted')
      return nextStep(session.command, session.prefixes, session.values)?.text ? 'text' : 'keyword';
    if (session.kind !== 'variable-value') return 'keyword';
    // String values (MODEMACRO, DIMPOST...) are free text; spaces belong to the value.
    return getSystemVariableDefinition(session.name)?.type === 'string' ? 'text' : 'number';
  }

  const nestedActive = prompts.nested.kind !== 'idle';
  const shown = nestedActive ? prompts.nested : prompts.main;
  const owner = (session: PromptSession): string | null =>
    session.kind === 'idle'
      ? null
      : session.kind === 'prompted' && session.prefixes.commandLine
        ? `-${session.command}`
        : session.command;
  return {
    ...runtime,
    history,
    inputMode: inputMode(shown),
    /** Command whose prompt the session itself owns (SETVAR, UNDO, a variable name). */
    promptCommand: owner(prompts.main),
    /** Transparent command answering >> prompts in the nested slot. */
    transparentCommand: owner(prompts.nested),
    /** A transparent SETVAR/GETVAR/variable prompt is active inside another command. */
    nestedActive,
    isPrompting: (slot: Slot = 'main') => slots.current[slot].kind !== 'idle',
    cancelNested: () => transition('nested', { kind: 'idle' }),
    setEcho: (mode: 'all' | 'no-echo' | 'quiet') => {
      echo.current = mode;
    },
    startedCommand,
    remember,
    recentCommands: (): string[] => {
      const names: string[] = [];
      for (const line of [...inputs.current.list('command')].reverse()) {
        const name = runtime.registry.resolve(line)?.canonicalName ?? line.toUpperCase();
        if (!names.includes(name)) names.push(name);
      }
      return names;
    },
    input,
    busy,
    revision,
    prompt: promptText(shown, nestedActive ? 'nested' : 'main'),
    editable: inputMode(shown) === 'text',
    changeInput,
    recall,
    execute,
    startCommand,
    cancel,
    refresh,
    print,
  };
}
