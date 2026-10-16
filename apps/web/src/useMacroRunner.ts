import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { evaluateDiesel, parseMacro } from '@hancad/commands';
import type { CommandRegistry, DieselHost, MacroStep, MacroToggle } from '@hancad/commands';
import { ImeController } from '@hancad/input';
import type { PromptInputMode } from '@hancad/input';
import type { SystemVariables } from '@hancad/sysvars';

/** The parts of command routing a macro drives, read fresh before every step. */
export interface MacroTarget {
  submit: (value: string) => Promise<void>;
  cancel: () => void;
  isActive: () => boolean;
  inputMode: PromptInputMode;
}
interface Run {
  aborted: boolean;
  /** MENUECHO state for this macro: ^P toggles input echo, ^Q hides everything. */
  echo: 'all' | 'no-echo' | 'quiet';
  /** Resolves a \\ pause when the user answers the prompt. */
  resume?: () => void;
  /** User input arrived during this pass (a repeat needs it to continue). */
  answered: boolean;
}

function menuecho(sysvars: SystemVariables): number {
  try {
    return sysvars.getNumber('MENUECHO');
  } catch {
    return 0;
  }
}

export function dieselHost(sysvars: SystemVariables): DieselHost {
  const number = (name: string): number => {
    try {
      return sysvars.getNumber(name);
    } catch {
      return 0;
    }
  };
  return {
    getvar: (name) => {
      try {
        const value = sysvars.get(name);
        if (typeof value === 'boolean') return value ? '1' : '0';
        return Array.isArray(value) ? value.join(',') : String(value);
      } catch {
        return undefined;
      }
    },
    units: () => ({
      lunits: number('LUNITS'),
      luprec: number('LUPREC'),
      aunits: number('AUNITS'),
      auprec: number('AUPREC'),
    }),
  };
}

/**
 * Replays menu, ribbon and toolbar macros through the command line exactly as typed
 * input: ^C cancels, ; and Space accept, \\ waits for the user, $M= runs DIESEL and
 * a leading * repeats the macro after each completed command until Esc.
 */
export function useMacroRunner(options: {
  registry: CommandRegistry;
  target: MacroTarget;
  sysvars: SystemVariables;
  print: (text: string) => void;
  setEcho: (mode: 'all' | 'no-echo' | 'quiet') => void;
  toggle: (key: MacroToggle) => void;
  unsupported: (code: string) => string;
}) {
  const latest = useRef(options);
  latest.current = options;
  const current = useRef<Run | null>(null);
  const commits = useRef(new Set<() => void>());
  const [ime] = useState(() => new ImeController());
  // Resolves waiters once React has committed the state a step produced.
  useLayoutEffect(() => {
    for (const resolve of commits.current) resolve();
    commits.current.clear();
  });
  const settle = (): Promise<void> =>
    new Promise((resolve) => {
      commits.current.add(resolve);
      window.setTimeout(resolve, 30);
    });

  async function step(run: Run, item: MacroStep, typed: { text: string }): Promise<void> {
    const live = latest.current;
    const submit = async (): Promise<void> => {
      const value = typed.text;
      typed.text = '';
      await live.target.submit(value);
      await settle();
    };
    switch (item.type) {
      case 'text':
        typed.text += item.text;
        return;
      case 'enter':
        return submit();
      case 'space':
        ime.setMode(latest.current.target.inputMode);
        if (ime.policy.spaceAccepts) return submit();
        typed.text += ' ';
        return;
      case 'backspace':
        typed.text = typed.text.slice(0, -1);
        return;
      case 'tab':
        return;
      case 'cancel':
        typed.text = '';
        if (live.target.isActive()) {
          live.target.cancel();
          await settle();
        }
        return;
      case 'pause': {
        if (typed.text) await submit();
        await new Promise<void>((resolve) => {
          run.resume = resolve;
        });
        delete run.resume;
        await settle();
        return;
      }
      case 'toggle':
        live.toggle(item.key);
        return;
      case 'menuecho':
        // MENUECHO bit 4 disables the ^P toggle.
        if (run.echo === 'quiet' || menuecho(live.sysvars) & 4) return;
        run.echo = run.echo === 'all' ? 'no-echo' : 'all';
        live.setEcho(run.echo);
        return;
      case 'quiet':
        run.echo = 'quiet';
        live.setEcho('quiet');
        return;
      case 'unsupported':
        live.print(live.unsupported(item.code));
        return;
      case 'diesel': {
        const result = evaluateDiesel(item.expression, dieselHost(live.sysvars));
        for (const inner of parseMacro(result, { trailingSpace: false }).steps) {
          if (run.aborted) return;
          await step(run, inner, typed);
        }
        return;
      }
    }
  }

  useEffect(() => {
    const enabled =
      import.meta.env.DEV ||
      new URLSearchParams(globalThis.location?.search ?? '').get('devtools') === '1';
    if (!enabled) return;
    // Development and tests: run any macro typed at a free-text prompt.
    options.registry.register({
      name: 'DEVMACRO',
      displayName: { 'ko-KR': '', 'en-US': '' },
      description: { 'ko-KR': '', 'en-US': '' },
      nextPrompt: (values, state) =>
        values.length
          ? undefined
          : { prompt: state.locale === 'ko-KR' ? '매크로 입력:' : 'Enter macro:', text: true },
      execute: (context) => {
        const macro = String(context.input.take() ?? '');
        // Starts after DEVMACRO itself has finished, like a menu pick.
        if (macro) window.setTimeout(() => void play(macro), 0);
      },
    });
  }, [options.registry]);

  async function play(macro: string): Promise<void> {
    if (current.current) current.current.aborted = true;
    const parsed = parseMacro(macro);
    // MENUECHO bit 1 suppresses the echo of menu input from the start.
    const run: Run = {
      aborted: false,
      answered: false,
      echo: menuecho(latest.current.sysvars) & 1 ? 'no-echo' : 'all',
    };
    current.current = run;
    latest.current.setEcho(run.echo);
    try {
      do {
        run.answered = false;
        const typed = { text: '' };
        for (const item of parsed.steps) {
          if (run.aborted) return;
          await step(run, item, typed);
        }
        if (!parsed.repeat) return;
        // *^C^C: start again once the command ends, if the user took part in it.
        while (!run.aborted && latest.current.target.isActive()) await settle();
      } while (!run.aborted && run.answered);
    } finally {
      latest.current.setEcho('all');
      if (current.current === run) current.current = null;
    }
  }

  return {
    run: (macro: string): Promise<void> => play(macro),
    /** The user answered a prompt (typed entry, click or window selection). */
    inputReceived(): void {
      const run = current.current;
      if (!run) return;
      run.answered = true;
      run.resume?.();
    },
    /** Esc or a new command typed by the user ends the macro and its repetition. */
    abort(): void {
      const run = current.current;
      if (!run) return;
      run.aborted = true;
      run.resume?.();
    },
    isRunning: (): boolean => current.current !== null,
  };
}
