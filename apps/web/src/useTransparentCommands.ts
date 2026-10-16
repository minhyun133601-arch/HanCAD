import { useEffect, useRef, useState } from 'react';
import { commandMessages, interpretCommandInput } from '@hancad/commands';
import type { CommandLocale } from '@hancad/commands';
import type { useCommandSession } from './useCommandSession';

/** Who answers the transparent command's prompts. */
type Owner = 'navigation' | 'measurement' | 'session';
interface Running {
  /** Interrupted command, named in "LINE 명령 재개 중." */
  outer: string;
  owner: Owner;
  name: string;
}
interface Interactive {
  isActive: () => boolean;
  cancel: (notify?: boolean) => boolean;
}

/**
 * Apostrophe commands inside another command: the entry is echoed after the outer
 * prompt, the transparent command's prompts start with >>, and when it ends the
 * interrupted command resumes with "<NAME> 명령 재개 중." at its original prompt.
 */
export function useTransparentCommands(options: {
  session: ReturnType<typeof useCommandSession>;
  navigation: Interactive;
  measurement: Interactive;
  /** The interrupted command (tool, navigation or session prompt) is still running. */
  outerActive: () => boolean;
  locale: CommandLocale;
}) {
  const latest = useRef(options);
  latest.current = options;
  const running = useRef<Running | null>(null);
  /** The transparent command is still being started; its output is not printed yet. */
  const starting = useRef(false);
  const [current, setCurrent] = useState<Running | null>(null);

  function set(next: Running | null): void {
    running.current = next;
    setCurrent(next);
  }
  function busy(owner: Owner): boolean {
    const live = latest.current;
    if (owner === 'navigation') return live.navigation.isActive();
    if (owner === 'measurement') return live.measurement.isActive();
    return live.session.isPrompting('nested');
  }
  function settle(): void {
    const active = running.current;
    if (!active || starting.current || busy(active.owner)) return;
    set(null);
    const live = latest.current;
    if (active.outer && live.outerActive())
      live.session.print(commandMessages.resuming(active.outer, live.locale));
  }
  // Interactive owners finish later (Enter after a realtime zoom, the second DIST point).
  useEffect(settle);

  return {
    active: current !== null,
    name: current?.name ?? null,
    owner: current?.owner ?? null,
    isActive: (): boolean => running.current !== null,
    /** Starts an apostrophe entry typed at the outer prompt `prompt`. */
    async start(value: string, outer: string, prompt: string): Promise<void> {
      const live = latest.current;
      const { session, locale } = live;
      session.print(`${prompt} ${value}`, 'echo');
      session.changeInput('');
      const input = interpretCommandInput(session.registry, value, {
        commandActive: true,
        transparentActive: running.current !== null,
      });
      if (input.kind === 'unknown') {
        session.print(commandMessages.unknown(input.name, locale));
        return;
      }
      if (input.kind !== 'command' && input.kind !== 'sysvar') {
        if (input.kind === 'not-transparent')
          session.print(commandMessages.transparent(input.name, locale));
        return;
      }
      const name = input.kind === 'command' ? input.resolution.canonicalName : input.name;
      const owner: Owner =
        name === 'ZOOM' || name === 'PAN'
          ? 'navigation'
          : name === 'DIST'
            ? 'measurement'
            : 'session';
      // A command cannot interrupt another instance of itself.
      if (busy(owner) && owner !== 'session') {
        session.print(commandMessages.transparent(name, locale));
        return;
      }
      set({ outer, owner, name });
      starting.current = true;
      try {
        await session.execute(value, { transparent: true });
      } finally {
        starting.current = false;
      }
      settle();
    },
    /** Esc: silently ends the transparent command; the caller cancels the outer one. */
    cancel(): boolean {
      const active = running.current;
      if (!active) return false;
      set(null);
      const live = latest.current;
      if (active.owner === 'navigation') live.navigation.cancel(false);
      else if (active.owner === 'measurement') live.measurement.cancel(false);
      live.session.cancelNested();
      return true;
    },
  };
}
