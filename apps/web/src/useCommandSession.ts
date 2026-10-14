import { useEffect, useMemo, useRef, useState } from 'react';
import { CommandRegistry, HeadlessCommandRunner } from '@hancad/commands';
import type { CommandResult } from '@hancad/commands';
import { DrawingDatabase } from '@hancad/db';
import { getSystemVariableDefinition, SystemVariables } from '@hancad/sysvars';
import { getMessages, type Locale } from '@hancad/ui';
import { restoreProfileVariables, subscribeProfileVariables } from './profile-storage';
import { errorMessage } from './error-presenter';

export interface HistoryLine {
  id: number;
  text: string;
  kind: 'echo' | 'output';
}

type PromptSession =
  | { kind: 'idle' }
  | { kind: 'variable-name'; command: 'GETVAR' | 'SETVAR' }
  | { kind: 'variable-value'; command: string; name: string };

export function useCommandSession(locale: Locale) {
  const messages = getMessages(locale);
  const [runtime] = useState(() => {
    const database = new DrawingDatabase();
    const sysvars = new SystemVariables({ database });
    restoreProfileVariables(sysvars.profile);
    return {
      database,
      sysvars,
      registry: new CommandRegistry(),
    };
  });
  useEffect(() => subscribeProfileVariables(runtime.sysvars.profile), [runtime]);
  const runner = useMemo(
    () => new HeadlessCommandRunner({ ...runtime, locale }),
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
  const recalled = useRef(-1);
  const commands = useRef<string[]>([]);
  const pending = useRef(false);

  function transition(next: PromptSession): void {
    promptRef.current = next;
    setPromptSession(next);
  }

  function promptText(session: PromptSession): string {
    if (session.kind === 'idle') return messages.commandPrompt;
    if (session.kind === 'variable-name') return messages.sysvarNamePrompt;
    const current = runtime.sysvars.get(session.name);
    return messages.sysvarValuePrompt(
      session.name,
      Array.isArray(current) ? current.join(',') : String(current),
    );
  }

  function print(text: string, kind: HistoryLine['kind'] = 'output'): void {
    const line = { id: serial.current++, text, kind };
    setHistory((previous) => [...previous.slice(-299), line]);
  }

  function changeInput(value: string): void {
    setInput(value);
    recalled.current = -1;
  }

  function recall(direction: -1 | 1): void {
    if (!commands.current.length) return;
    const current = recalled.current === -1 ? commands.current.length : recalled.current;
    const index = Math.min(commands.current.length, Math.max(0, current + direction));
    recalled.current = index;
    setInput(commands.current[index] ?? '');
  }

  async function execute(value: string): Promise<void> {
    if (pending.current) return;
    setInput('');
    recalled.current = -1;
    const active = promptRef.current;
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
        transition(next);
        print(promptText(next));
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
    const line = value.trim() || commands.current.at(-1);
    if (!line) return;
    commands.current.push(line);
    print(messages.commandEcho(line), 'echo');
    const tokens = line.split(/\s+/);
    const resolution = runtime.registry.resolve(tokens[0] ?? '');
    const command = resolution?.canonicalName;
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
      transition(next);
      print(promptText(next));
      return;
    }
    await run(line);
  }

  async function run(line: string, inputs: readonly string[] = []): Promise<CommandResult> {
    pending.current = true;
    setBusy(true);
    try {
      const result = await runner.run(line, inputs);
      for (const output of result.messages) print(output);
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

  return {
    ...runtime,
    history,
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
