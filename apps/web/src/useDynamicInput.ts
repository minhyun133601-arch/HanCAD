import { useEffect, useRef, useState } from 'react';
import type { CadPoint } from '@hancad/legacy-bridge';
import type { PromptInputMode } from '@hancad/input';
import {
  coordinateSettings,
  formatDraftAngle,
  formatDraftNumber,
  visibleGripDimensions,
} from '@hancad/draft';
import type { GripDimensionContext } from '@hancad/draft';
import {
  gripDimensionConstraints,
  gripDimensionDisplay,
  gripDimensionLocks,
  gripDimensionToken,
  isGripDimensionField,
} from './grip-dynamic-input';
import type { SystemVariables } from '@hancad/sysvars';
import type { Locale } from '@hancad/ui';
import { keywordOf, promptOptions } from './command-line/PromptKeywords';
import { constraintsFor, dynamicFields, dynamicToken } from './dynamic-input-state';
import type { DynamicConstraints, DynamicEdit, DynamicField } from './dynamic-input-state';
import { inputBlocked, isTextEditingTarget } from './ui-focus';

export interface DynamicInputOptions {
  sysvars: SystemVariables;
  mode: PromptInputMode;
  scalarKind?: 'angle' | 'distance';
  input: string;
  changeInput: (value: string) => void;
  prompt: string;
  commandActive: boolean;
  cursor: { point: CadPoint; screen: CadPoint } | null;
  base?: CadPoint;
  locale: Locale;
  submit: (value: string) => void | Promise<void>;
  focusCommand: () => void;
  grip?: GripDimensionContext;
  keywords?: readonly string[];
}

/** Tooltip fields share the command buffer and never create an editable IME target. */
export function useDynamicInput(options: DynamicInputOptions) {
  const latest = useRef(options);
  latest.current = options;
  const vars = options.sysvars;
  const mode = vars.getNumber('DYNMODE');
  const grip = mode > 0 && Boolean(mode & 2) ? options.grip : undefined;
  const gripFields = grip
    ? visibleGripDimensions(grip, vars.getNumber('DYNDIVIS'), vars.getNumber('DYNDIGRIP'))
    : undefined;
  const dimensional = Boolean(options.base && mode & 2 && options.mode === 'point');
  const polar = Boolean(options.base && vars.getNumber('DYNPIFORMAT') === 0);
  const active = gripFields
    ? gripFields.length > 0
    : mode > 0 &&
      (options.mode === 'number' || (options.mode === 'point' && (dimensional || mode & 1)));
  const defaultFields =
    gripFields ??
    (options.mode === 'number'
      ? options.scalarKind === 'angle'
        ? (['angle'] as const)
        : (['distance'] as const)
      : dynamicFields(dimensional, polar));
  const relative = dimensional || Boolean(options.base && vars.getNumber('DYNPICOORDS') === 0);
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
  const context = `${options.commandActive}:${options.prompt}:${options.base?.x}:${options.base?.y}:${dimensional}:${polar}:${relative}:${mode}:${grip?.key}:${gripFields?.join(',')}:${options.scalarKind}`;
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
    const base = edit.current.relative ? (live.base ?? { x: 0, y: 0 }) : { x: 0, y: 0 };
    const dx = cursor.x - base.x,
      dy = base.y - cursor.y;
    return {
      x: formatDraftNumber(cursor.x - (edit.current.relative ? base.x : 0), settings),
      y: formatDraftNumber(-cursor.y + (edit.current.relative ? base.y : 0), settings),
      z: formatDraftNumber(0, settings),
      distance: formatDraftNumber(Math.hypot(dx, dy), settings),
      angle: formatDraftAngle(Math.atan2(dy, dx), settings),
      result: '',
      lengthChange: '',
      absoluteAngle: '',
      angleChange: '',
      radius: '',
      ...(live.grip ? gripDimensionDisplay(live.grip, settings) : {}),
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
    const locked =
      live.grip && !edit.current.cartesian && isGripDimensionField(edit.current.field)
        ? gripDimensionLocks(edit.current, value, live.grip)
        : {
            ...edit.current.locked,
            ...(value ? { [edit.current.field]: value.replace(/^[#@]/, '') } : {}),
          };
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
      if (event.defaultPrevented || inputBlocked() || isTextEditingTarget(event.target)) return;
      const target = event.target;
      const parsedOptions = promptOptions(live.prompt);
      const options = parsedOptions.length ? parsedOptions : (live.keywords ?? []);
      const enabled =
        active ||
        (live.sysvars.getNumber('DYNMODE') > 0 &&
          live.sysvars.getNumber('DYNPROMPT') > 0 &&
          live.commandActive &&
          options.length > 0);
      if (!enabled) return;
      if (
        active &&
        target instanceof HTMLElement &&
        target.dataset.testid === 'drawing-canvas' &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      )
        change({ ...edit.current, engaged: true });
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
      if (!active || event.ctrlKey || event.altKey || event.metaKey) return;
      if (
        edit.current.locked[edit.current.field] &&
        !live.input &&
        /^(Digit|Numpad|Key|Minus|Period|Backspace)/.test(event.code)
      ) {
        const locked = { ...edit.current.locked };
        delete locked[edit.current.field];
        change({ ...edit.current, locked });
      }
      if (
        edit.current.engaged &&
        event.shiftKey &&
        (event.code === 'Digit2' || event.code === 'Digit3')
      ) {
        change({
          field: 'x',
          locked: {},
          engaged: true,
          relative: event.code === 'Digit2',
          cartesian: true,
        });
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
      if (
        event.code === 'Comma' &&
        event.shiftKey &&
        (fields.includes('angle') || fields.includes('absoluteAngle')) &&
        (edit.current.engaged || live.input)
      ) {
        event.preventDefault();
        event.stopPropagation();
        advance(fields.includes('absoluteAngle') ? 'absoluteAngle' : 'angle');
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
        const token = live.input.trim().replace(/^_/, '').toUpperCase();
        const keyword = options.some((label) => keywordOf(label)?.toUpperCase() === token);
        const value = keyword
          ? live.input
          : live.grip && !edit.current.cartesian && isGripDimensionField(edit.current.field)
            ? gripDimensionToken(
                edit.current,
                live.input,
                live.grip,
                coordinateSettings((name) => live.sysvars.get(name)),
              )
            : live.mode === 'number' && live.scalarKind !== undefined && !edit.current.cartesian
              ? live.input.trim() || edit.current.locked[edit.current.field]
              : dynamicToken(edit.current, live.input, fallback());
        if (value === null) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (value !== undefined) {
          event.preventDefault();
          event.stopPropagation();
          void live.submit(value);
          change(initial);
        }
      }
    }
    document.addEventListener('keydown', key, true);
    function commandEntry(event: Event): void {
      if (event.target instanceof Element && event.target.closest('.command-input'))
        change(initial);
    }
    document.addEventListener('pointerdown', commandEntry, true);
    document.addEventListener('focusin', commandEntry, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', commandEntry, true);
      document.removeEventListener('focusin', commandEntry, true);
    };
  }, [active, fields.join(','), menu, highlight, context]);
  const displayed = fallback();
  const values = constraintsFor(state, options.input);
  const invalid = Boolean(
    grip &&
    state.engaged &&
    !state.cartesian &&
    isGripDimensionField(state.field) &&
    gripDimensionConstraints(
      state,
      options.input,
      grip,
      coordinateSettings((name) => vars.get(name)),
    ).invalid,
  );
  const visibility = vars.getNumber('DYNPIVIS');
  const showFields =
    (active &&
      options.commandActive &&
      (dimensional || visibility !== 0 || Boolean(options.input) || state.engaged)) ||
    (mode > 0 && Boolean(mode & 1) && visibility === 2 && options.mode === 'command');
  const showPrompt =
    vars.getNumber('DYNPROMPT') > 0 && (options.commandActive || Boolean(options.input));
  function scalarConstraints(): DynamicConstraints {
    const scalar = latest.current.input.trim() || edit.current.locked[edit.current.field];
    return { relative, ...(scalar !== undefined ? { scalar } : {}) };
  }
  return {
    visible: Boolean(options.cursor && mode > 0 && (showFields || showPrompt)),
    showFields,
    inputText: !active ? options.input : '',
    screen: options.cursor?.screen ?? { x: 0, y: 0 },
    fields,
    state,
    displayed,
    invalid,
    values,
    menu,
    highlight,
    prompt: vars.getNumber('DYNPROMPT') ? options.prompt : '',
    optionLabels: promptOptions(options.prompt).length
      ? promptOptions(options.prompt)
      : (options.keywords ?? []),
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
      active && edit.current.engaged
        ? latest.current.grip && !edit.current.cartesian && isGripDimensionField(edit.current.field)
          ? gripDimensionConstraints(
              edit.current,
              latest.current.input,
              latest.current.grip,
              coordinateSettings((name) => latest.current.sysvars.get(name)),
            )
          : latest.current.mode === 'number' &&
              latest.current.scalarKind !== undefined &&
              !edit.current.cartesian
            ? scalarConstraints()
            : constraintsFor(edit.current, latest.current.input)
        : { relative },
    isEditing: (): boolean => edit.current.engaged || Object.keys(edit.current.locked).length > 0,
    reset: () => {
      change(initial);
      setMenu(false);
    },
  };
}
