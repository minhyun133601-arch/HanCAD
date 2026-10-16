import { useEffect, useMemo, useRef, useState } from 'react';
import { CommandRegistry, HeadlessCommandRunner } from '@hancad/commands';
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
  const [promptSession, setPromptSession] = useState<PromptSession>({ kind: 'idle' });
  const promptRef = useRef<PromptSession>({ kind: 'idle' });
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
  /** Canonical name of the command most recently started from the command line. */
  const [startedCommand, setStartedCommand] = useState<string | null>(null);
  const pending = useRef(false);

  function transition(next: PromptSession): void {
    promptRef.current = next;
    setPromptSession(next);
  }

  function promptText(session: PromptSession): string {
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
        Array.isArray(current) ? current.join(',') : String(current),
      );
    } catch (error) {
      return messages.commandFailure(errorMessage(error, messages));
    }
  }

  function openVariablePrompt(next: Extract<PromptSession, { kind: 'variable-value' }>): void {
    try {
      runtime.sysvars.get(next.name);
      transition(next);
      print(promptText(next));
    } catch (error) {
      transition({ kind: 'idle' });
      print(messages.commandFailure(errorMessage(error, messages)));
    }
  }

  function print(text: string, kind: HistoryLine['kind'] = 'output'): void {
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

  async function execute(value: string): Promise<void> {
    if (pending.current) return;
    setInput('');
    inputs.current.resetCursor();
    const active = promptRef.current;
    if (active.kind === 'prompted') {
      print(`${promptText(active)} ${value}`, 'echo');
      const values = [...active.values, value];
      const step = nextStep(active.command, active.prefixes, values);
      if (step) showStep({ ...active, values }, step);
      else {
        const result = await run(active.line, values);
        if (result.status === 'ok') transition({ kind: 'idle' });
      }
      return;
    }
    if (active.kind === 'variable-name') {
      const name = value.trim().toUpperCase();
      print(`${promptText(active)} ${name}`, 'echo');
      if (!name) {
        transition({ kind: 'idle' });
        return;
      }
      const definition = getSystemVariableDefinition(name);
      if (active.command === 'GETVAR' || !definition) {
        const result = await run('GETVAR', [name]);
        if (result.status === 'ok') transition({ kind: 'idle' });
      } else {
        const next: PromptSession = { kind: 'variable-value', command: 'SETVAR', name };
        openVariablePrompt(next);
      }
      return;
    }
    if (active.kind === 'variable-value') {
      print(`${promptText(active)} ${value}`, 'echo');
      const result = await run(
        active.command,
        active.command === 'SETVAR' ? [active.name, value] : [value],
      );
      if (result.status === 'ok') transition({ kind: 'idle' });
      return;
    }
    const line = value.trim() || lastCommand.current;
    if (!line) return;
    lastCommand.current = line;
    inputs.current.add('command', line);
    print(messages.commandEcho(line), 'echo');
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
        showStep({ ...base, values }, step);
        return;
      }
    }
    if ((command === 'SETVAR' || command === 'GETVAR') && tokens.length === 1) {
      const next: PromptSession = { kind: 'variable-name', command };
      transition(next);
      print(promptText(next));
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
      openVariablePrompt(next);
      return;
    }
    await run(line);
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
  function showStep(next: Extract<PromptSession, { kind: 'prompted' }>, step: PromptStep): void {
    if (step.notice) print(step.notice);
    transition(next);
    print(step.prompt);
  }

  async function run(line: string, values: readonly string[] = []): Promise<CommandResult> {
    pending.current = true;
    setBusy(true);
    try {
      const result = await runner.run(line, values);
      for (const output of result.messages) print(output);
      if (result.status === 'ok' && result.command) setStartedCommand(result.command);
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

  function cancel(): void {
    transition({ kind: 'idle' });
    changeInput('');
    print(messages.cancel);
  }
  function startCommand(value: string): void {
    if (promptRef.current.kind !== 'idle') cancel();
    void execute(value);
  }
  function refresh(): void {
    setRevision((value) => value + 1);
  }

  function inputMode(session: PromptSession): PromptInputMode {
    if (session.kind === 'idle') return 'command';
    if (session.kind !== 'variable-value') return 'keyword';
    // String values (MODEMACRO, DIMPOST...) are free text; spaces belong to the value.
    return getSystemVariableDefinition(session.name)?.type === 'string' ? 'text' : 'number';
  }

  return {
    ...runtime,
    history,
    inputMode: inputMode(promptSession),
    /** Command whose prompt the session itself owns (SETVAR, UNDO, a variable name). */
    promptCommand:
      promptSession.kind === 'idle'
        ? null
        : promptSession.kind === 'prompted' && promptSession.prefixes.commandLine
          ? `-${promptSession.command}`
          : promptSession.command,
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
    prompt: promptText(promptSession),
    editable:
      promptSession.kind === 'variable-value' &&
      getSystemVariableDefinition(promptSession.name)?.type === 'string',
    changeInput,
    recall,
    execute,
    startCommand,
    cancel,
    refresh,
    print,
  };
}
