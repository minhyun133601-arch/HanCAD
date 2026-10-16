import { useEffect, useRef } from 'react';
import type { CommandRegistry } from '@hancad/commands';
import type { CommandWindowState } from './useCommandWindow';

const neutral = { 'ko-KR': '', 'en-US': '' } as const;

/** COMMANDLINE, COMMANDLINEHIDE, TEXTSCR and GRAPHSCR drive the command window state. */
export function useCommandWindowCommands(
  registry: CommandRegistry,
  window: CommandWindowState,
): void {
  const latest = useRef(window);
  latest.current = window;
  useEffect(() => {
    const actions: Record<string, () => void> = {
      COMMANDLINE: () => latest.current.show(),
      COMMANDLINEHIDE: () => latest.current.hide(),
      TEXTSCR: () => latest.current.openTextWindow(),
      GRAPHSCR: () => latest.current.closeTextWindow(),
    };
    for (const [name, action] of Object.entries(actions))
      registry.register({
        name,
        // The catalog supplies the localized names and help text.
        displayName: neutral,
        description: neutral,
        execute: action,
      });
  }, [registry]);
}
