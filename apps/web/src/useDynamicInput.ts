import { useEffect, useRef, useState } from 'react';
import type { CadPoint } from '@hancad/legacy-bridge';
import type { PromptInputMode } from '@hancad/input';
import { coordinateSettings, formatDraftAngle, formatDraftNumber } from '@hancad/draft';
import type { SystemVariables } from '@hancad/sysvars';
import type { Locale } from '@hancad/ui';
import { keywordOf, promptOptions } from './command-line/PromptKeywords';
import { constraintsFor, dynamicFields, dynamicToken } from './dynamic-input-state';
import type { DynamicConstraints, DynamicEdit, DynamicField } from './dynamic-input-state';

export interface DynamicInputOptions {
  sysvars: SystemVariables;
  mode: PromptInputMode;
  input: string;
  changeInput: (value: string) => void;
  prompt: string;
  commandActive: boolean;
  cursor: { point: CadPoint; screen: CadPoint } | null;
  base?: CadPoint;
  locale: Locale;
  submit: (value: string) => void | Promise<void>;
  focusCommand: () => void;
}

/** Tooltip fields share the command buffer and never create an editable IME target. */
export function useDynamicInput(options: DynamicInputOptions) {
  const latest = useRef(options);
  latest.current = options;
  const vars = options.sysvars;
  const mode = vars.getNumber('DYNMODE');
  const dimensional = Boolean(options.base && mode & 2);
  const polar = Boolean(options.base && vars.getNumber('DYNPIFORMAT') === 0);
  const active = mode > 0 && (options.mode === 'point' || options.mode === 'number');
  const defaultFields = dynamicFields(dimensional, polar);
  const relative = Boolean(options.base && vars.getNumber('DYNPICOORDS') === 0);
  const initial: DynamicEdit = {
    field: defaultFields[0] ?? 'x',
    locked: {},
    engaged: false,
    relative,
  };
  const edit = useRef<DynamicEdit>(initial);
  const [state, setState] = useState(initial);
  const fields = state.cartesian ? dynamicFields(false, false) : defaultFields;
  const [menu, setMenu] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const context = `${options.commandActive}:${options.prompt}:${options.base?.x}:${options.base?.y}:${dimensional}:${polar}`;
  useEffect(() => {
    edit.current = initial;
    setState(initial);
    setMenu(false);
  }, [context]);
  function change(next: DynamicEdit): void {
    edit.current = next;
    setState(next);
  }
  function fallback(): Record<DynamicField, string> {
    const live = latest.current;
    const settings = coordinateSettings((name) => live.sysvars.get(name));
    const cursor = live.cursor?.point ?? { x: 0, y: 0 };
    const base = live.base ?? { x: 0, y: 0 };
    const dx = cursor.x - base.x,
      dy = base.y - cursor.y;
    return {
      x: formatDraftNumber(cursor.x - (edit.current.relative ? base.x : 0), settings),
      y: formatDraftNumber(-cursor.y + (edit.current.relative ? base.y : 0), settings),
      z: formatDraftNumber(0, settings),
      distance: formatDraftNumber(Math.hypot(dx, dy), settings),
      angle: formatDraftAngle(Math.atan2(dy, dx), settings),
    };
  }
  function advance(field: DynamicField): void {
    const live = latest.current;
    const value = live.input.trim();
    const prefix = value.startsWith('#')
      ? false
      : value.startsWith('@')
        ? true
        : edit.current.relative;
    const locked = { ...edit.current.locked, ...(value ? { [edit.current.field]: value.replace(/^[#@]/, '') } : {}) };
    change({
      ...edit.current,
      field,
      locked,
      engaged: true,
      relative: prefix,
    });
    live.changeInput('');
    live.focusCommand();
  }
  useEffect(() => {
    function key(event: KeyboardEvent): void {
      const live = latest.current;
      if (
        event.defaultPrevented ||
        document.querySelector('dialog[open], [data-context-menu-open]')
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      )
        return;
      const enabled =
        live.sysvars.getNumber('DYNMODE') > 0 && (live.mode === 'point' || live.mode === 'number');
      if (!enabled) return;
      if (
        target instanceof HTMLElement &&
        target.dataset.testid === 'drawing-canvas' &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      )
        change({ ...edit.current, engaged: true });
      const options = promptOptions(live.prompt);
      if (menu) {
        if (event.code === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          setMenu(false);
          return;
        }
        if (event.code === 'ArrowDown' || event.code === 'ArrowUp') {
          event.preventDefault();
          event.stopPropagation();
          setHighlight(
            (old) =>
              (old + (event.code === 'ArrowDown' ? 1 : -1) + options.length) % options.length,
          );
          return;
        }
        if (event.code === 'Enter' || event.code === 'NumpadEnter') {
          event.preventDefault();
          event.stopPropagation();
          const token = keywordOf(options[highlight] ?? '');
          setMenu(false);
          if (token) void live.submit(token);
          return;
        }
      }
      if (event.code === 'ArrowDown' && options.length && live.sysvars.getNumber('DYNPROMPT')) {
        event.preventDefault();
        event.stopPropagation();
        setMenu(true);
        setHighlight(0);
        return;
      }
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (edit.current.locked[edit.current.field] && !live.input && /^(Digit|Numpad|Key|Minus|Period|Backspace)/.test(event.code)) {
        const locked = { ...edit.current.locked }; delete locked[edit.current.field];
        change({ ...edit.current, locked });
      }
      if (edit.current.engaged && event.shiftKey && (event.code === 'Digit2' || event.code === 'Digit3')) {
        change({ field: 'x', locked: {}, engaged: true, relative: event.code === 'Digit2', cartesian: true });
        return;
      }
      if (event.code === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        const next =
          fields[
            (fields.indexOf(edit.current.field) + (event.shiftKey ? fields.length - 1 : 1)) %
              fields.length
          ] ?? fields[0];
        if (next) advance(next);
        return;
      }
      if (event.code === 'Comma' && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        advance('angle');
        return;
      }
      if (event.code === 'Comma' && edit.current.engaged) {
        event.preventDefault();
        event.stopPropagation();
        if (edit.current.cartesian || edit.current.field === 'x' || edit.current.field === 'y') {
          change({ ...edit.current, cartesian: true });
          advance(edit.current.field === 'x' ? 'y' : 'z');
        } else {
          const value = live.input.trim();
          change({
            field: 'y',
            locked: value ? { x: value.replace(/^[#@]/, '') } : {},
            engaged: true,
            relative: value.startsWith('#')
              ? false
              : value.startsWith('@')
                ? true
                : edit.current.relative,
            cartesian: true,
          });
          live.changeInput('');
          live.focusCommand();
        }
        return;
      }
      if ((event.code === 'Enter' || event.code === 'NumpadEnter') && edit.current.engaged) {
        const value = dynamicToken(edit.current, live.input, fallback());
        if (value !== undefined) {
          event.preventDefault();
          event.stopPropagation();
          void live.submit(value);
          change(initial);
        }
      }
    }
    document.addEventListener('keydown', key, true);
    function pointer(event: PointerEvent): void {
      if (event.target instanceof Element && event.target.closest('.command-input'))
        change(initial);
    }
    document.addEventListener('pointerdown', pointer, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', pointer, true);
    };
  }, [active, fields.join(','), menu, highlight, context]);
  const displayed = fallback();
  const values = constraintsFor(state, options.input);
  const visibility = vars.getNumber('DYNPIVIS');
  return {
    visible: Boolean(options.cursor && mode > 0 && ((active && options.commandActive && (visibility !== 0 || options.input || state.engaged)) || (visibility === 2 && options.mode === 'command'))),
    screen: options.cursor?.screen ?? { x: 0, y: 0 },
    fields,
    state,
    displayed,
    values,
    menu,
    highlight,
    prompt: vars.getNumber('DYNPROMPT') ? options.prompt : '',
    size: vars.getNumber('TOOLTIPSIZE'),
    opacity: 1 - vars.getNumber('TOOLTIPTRANSPARENCY') / 100,
    allTooltips: vars.getNumber('DYNTOOLTIPS') === 1,
    locale: options.locale,
    openOptions: () => {
      setMenu(true);
      setHighlight(0);
    },
    selectOption: (token: string) => {
      setMenu(false);
      void options.submit(token);
      options.focusCommand();
    },
    selectField: (field: DynamicField) => {
      advance(field);
    },
    unlock: (field: DynamicField) => {
      const locked = { ...edit.current.locked };
      delete locked[field];
      change({ ...edit.current, locked });
    },
    getConstraints: (): DynamicConstraints =>
      active ? constraintsFor(edit.current, latest.current.input) : { relative },
    reset: () => {
      change(initial);
      setMenu(false);
    },
  };
}
