import { useEffect, useRef } from 'react';
import type { PromptInputMode } from '@hancad/input';
import type { SystemVariables } from '@hancad/sysvars';
import { tempOverrideKeys, tempOverrides } from './temp-overrides';
import { inputBlocked, isTextEditingTarget } from './ui-focus';

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
  inputIsDynamic?: () => boolean;
}): void {
  const latest = useRef(options);
  latest.current = options;
  const resetKeys = useRef<() => void>(() => {});
  useEffect(() => resetKeys.current(), [options.mode, options.input, options.sysvars]);
  useEffect(() => {
    const held = new Set<string>();
    let shifted = false;
    function reset(): void {
      held.clear();
      shifted = false;
      tempOverrides.release();
    }
    resetKeys.current = reset;
    function apply(): void {
      tempOverrides.release();
      if (!shifted && !held.has('ShiftLeft') && !held.has('ShiftRight')) return;
      const overrides = [...held].flatMap((code) => {
        const override = tempOverrideKeys[code];
        return override ? [override] : [];
      });
      if (overrides.length) for (const override of overrides) tempOverrides.press(override);
      else tempOverrides.press('ortho');
    }
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
      if (event.defaultPrevented || inputBlocked() || isTextEditingTarget(event.target)) {
        reset();
        return;
      }
      if (
        event.code === 'Space' &&
        event.shiftKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        live.mode === 'selection' &&
        !live.input
      ) {
        event.preventDefault();
        event.stopPropagation();
        live.cycleOverlap();
        return;
      }
      if (!enabled(event)) {
        reset();
        return;
      }
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
        if (!event.repeat) {
          held.add(event.code);
          shifted = true;
          apply();
        }
        return;
      }
      const override = event.shiftKey ? tempOverrideKeys[event.code] : undefined;
      if (
        event.code === 'Comma' &&
        event.target instanceof Element &&
        event.target.closest('.command-input')
      )
        return;
      if (event.code === 'Comma' && live.inputIsDynamic?.()) return;
      if (!override) return;
      event.preventDefault();
      event.stopPropagation();
      shifted = true;
      held.add(event.code);
      apply();
    }
    function up(event: KeyboardEvent): void {
      const changed = held.delete(event.code);
      const shiftReleased = shifted && !event.shiftKey;
      shifted = event.shiftKey;
      if (changed || shiftReleased) apply();
    }
    function focus(event: FocusEvent): void {
      if (inputBlocked() || isTextEditingTarget(event.target)) reset();
    }
    document.addEventListener('keydown', down, true);
    document.addEventListener('keyup', up, true);
    document.addEventListener('focusin', focus, true);
    window.addEventListener('blur', reset);
    return () => {
      document.removeEventListener('keydown', down, true);
      document.removeEventListener('keyup', up, true);
      document.removeEventListener('focusin', focus, true);
      window.removeEventListener('blur', reset);
      resetKeys.current = () => {};
      reset();
    };
  }, []);
}
