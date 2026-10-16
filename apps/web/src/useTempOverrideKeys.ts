import { useEffect, useRef } from 'react';
import type { PromptInputMode } from '@hancad/input';
import type { SystemVariables } from '@hancad/sysvars';
import { tempOverrideKeys, tempOverrides } from './temp-overrides';

/**
 * Key-down/key-up handling for TEMPOVERRIDES. Overrides apply at point prompts while
 * nothing has been typed yet, so Shift+2 still types "@" and "<" still works inside
 * "@100<90". The listener runs in the capture phase, before the command line.
 */
export function useTempOverrideKeys(options: {
  sysvars: SystemVariables;
  mode: PromptInputMode;
  input: string;
  /** Shift+Space at a selection prompt: cycling through overlapping objects. */
  cycleOverlap: () => void;
}): void {
  const latest = useRef(options);
  latest.current = options;
  useEffect(() => {
    function enabled(event: KeyboardEvent): boolean {
      const live = latest.current;
      let setting = 1;
      try {
        setting = live.sysvars.getNumber('TEMPOVERRIDES');
      } catch {
        // Missing definitions keep AutoCAD's default (on).
      }
      return (
        setting === 1 &&
        live.mode === 'point' &&
        live.input === '' &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      );
    }
    function down(event: KeyboardEvent): void {
      const live = latest.current;
      if (event.code === 'Space' && event.shiftKey && live.mode === 'selection' && !live.input) {
        event.preventDefault();
        event.stopPropagation();
        live.cycleOverlap();
        return;
      }
      if (!enabled(event)) return;
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
        if (!event.repeat) tempOverrides.press('ortho');
        return;
      }
      const override = event.shiftKey ? tempOverrideKeys[event.code] : undefined;
      if (!override) return;
      event.preventDefault();
      event.stopPropagation();
      tempOverrides.release('ortho');
      tempOverrides.press(override);
    }
    function up(event: KeyboardEvent): void {
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') tempOverrides.release();
      else {
        const override = tempOverrideKeys[event.code];
        if (override) tempOverrides.release(override);
      }
    }
    const reset = (): void => tempOverrides.release();
    document.addEventListener('keydown', down, true);
    document.addEventListener('keyup', up, true);
    window.addEventListener('blur', reset);
    return () => {
      document.removeEventListener('keydown', down, true);
      document.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', reset);
      reset();
    };
  }, []);
}
