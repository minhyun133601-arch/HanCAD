import { useEffect, useMemo, useRef, useState } from 'react';
import {
  editDistance,
  inlineCompletion,
  maxCorrectionDistance,
  suggestCommandInput,
} from '@hancad/commands';
import type { CommandRegistry, InputSearchOptions, Suggestion } from '@hancad/commands';
import { getSystemVariableDefinition } from '@hancad/sysvars';
import { usesEditableInput } from '@hancad/input';
import type { CommandKeyAction, PromptInputMode } from '@hancad/input';
import type { InputSearchStore } from './input-search-store';

export interface AutoCompleteView {
  /** Suggestions of the shown group (commands, or system variables after Tab). */
  items: readonly Suggestion[];
  group: 'items' | 'variables';
  /** Hidden system-variable matches reachable with Tab. */
  variableCount: number;
  open: boolean;
  highlighted: number | null;
  /** AutoComplete text appended after the caret. */
  completion: string;
  /** Consumes Up/Down/Tab/Backspace while suggestions are active. */
  handleKey(action: CommandKeyAction): boolean;
  /** Text submitted for Enter/Space; also feeds usage counts and AutoCorrect learning. */
  acceptText(input: string): string;
  /** A clicked suggestion: its submitted text. */
  choose(index: number): string;
  hover(index: number): void;
}

interface Options {
  registry: CommandRegistry;
  store: InputSearchStore;
  options: InputSearchOptions;
  input: string;
  mode: PromptInputMode;
  /** A command (or a command-owned prompt) is running; only 'transparent input applies. */
  commandActive: boolean;
  delay: number;
}

/** Command-line AutoComplete, AutoCorrect and suggestion-list state (INPUTSEARCHOPTIONS). */
export function useAutoComplete(props: Options): AutoCompleteView {
  const { registry, store, options, input, mode, commandActive, delay } = props;
  const eligible = !usesEditableInput(mode) && input.trim() !== '';
  const result = useMemo(
    () =>
      eligible
        ? suggestCommandInput(registry, {
            input,
            options,
            commandActive,
            usage: (name) => store.usageOf(name),
          })
        : { query: '', items: [], variables: [], exact: false },
    [registry, store, options, input, commandActive, eligible],
  );
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<'items' | 'variables'>('items');
  const [highlight, setHighlight] = useState<{ index: number; chosen: boolean } | null>(null);
  const [suppressed, setSuppressed] = useState(false);
  const lastUnknown = useRef<string | undefined>(undefined);

  useEffect(() => {
    setHighlight(null);
    setGroup('items');
    if (!eligible) {
      setOpen(false);
      setSuppressed(false);
      return;
    }
    if (open) return;
    const timer = window.setTimeout(() => setOpen(true), delay);
    return () => window.clearTimeout(timer);
    // Typing restarts the delay only until the list has opened.
  }, [input, eligible, delay]);

  const items = group === 'variables' ? result.variables : result.items;
  const completion = suppressed || group !== 'items' ? '' : inlineCompletion(result, options);
  const shown = open && items.length > 0;
  const automatic =
    options.autoComplete && !result.exact && (completion !== '' || shown) && items.length > 0;
  const highlighted = highlight ? highlight.index : automatic || (shown && result.exact) ? 0 : null;

  function chosen(): Suggestion | undefined {
    if (highlight?.chosen) return items[highlight.index];
    return automatic ? items[0] : undefined;
  }
  function move(step: number): void {
    if (!items.length) return;
    const start = highlighted ?? (step > 0 ? -1 : items.length);
    const index = (start + step + items.length) % items.length;
    setHighlight({ index, chosen: true });
    setOpen(true);
  }
  function learn(typed: string, choice: Suggestion | undefined, text: string): void {
    if (!typed || !result.query) return;
    if (choice?.match === 'correction') store.recordCorrection(result.query, choice.name);
    const name =
      registry.resolve(text)?.canonicalName ??
      getSystemVariableDefinition(text.replace(/^['_.-]+/, ''))?.name;
    if (name) {
      store.recordUsage(name);
      const mistyped = lastUnknown.current;
      if (mistyped && editDistance(mistyped, name) <= maxCorrectionDistance(mistyped))
        store.recordCorrection(mistyped, name);
      lastUnknown.current = undefined;
    } else if (!choice && !result.exact && !registry.external(result.query))
      lastUnknown.current = result.query;
  }
  function submit(choice: Suggestion | undefined, value: string): string {
    const text = choice?.text ?? value;
    learn(value.trim(), choice, text);
    setOpen(false);
    return text;
  }

  return {
    items: shown || highlight ? items : [],
    group,
    variableCount: group === 'items' ? result.variables.length : 0,
    open: shown,
    highlighted,
    completion,
    handleKey(action) {
      if (!eligible) return false;
      if (action.type === 'backspace' && completion) {
        setSuppressed(true);
        return true;
      }
      if (action.type === 'insert') setSuppressed(false);
      if (action.type === 'history' && shown) {
        move(action.direction);
        return true;
      }
      if (action.type === 'tab') {
        if (group === 'items' && result.variables.length && (!result.items.length || shown)) {
          setGroup('variables');
          setHighlight({ index: 0, chosen: true });
          setOpen(true);
        } else move(action.reverse ? -1 : 1);
        return true;
      }
      return false;
    },
    acceptText: (value) => (eligible ? submit(chosen(), value) : value),
    choose: (index) => submit(items[index], input),
    hover: (index) => setHighlight({ index, chosen: true }),
  };
}
