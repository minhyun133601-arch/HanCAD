/**
 * Menu, ribbon and toolbar macros (CUI command macros). A macro is replayed as the
 * keystrokes it stands for: text typed into the command line, Enter (;), Space, a
 * pause for user input (\), Esc (^C) and the other control characters.
 */
export type MacroToggle = 'B' | 'D' | 'E' | 'G' | 'O' | 'T';
export type MacroStep =
  | { type: 'text'; text: string }
  | { type: 'enter' }
  | { type: 'space' }
  | { type: 'pause' }
  | { type: 'cancel' }
  | { type: 'backspace' }
  | { type: 'tab' }
  /** ^B snap, ^D dynamic UCS, ^E isoplane, ^G grid, ^O ortho, ^T tablet. */
  | { type: 'toggle'; key: MacroToggle }
  /** ^P: toggles MENUECHO echo suppression for the rest of the macro. */
  | { type: 'menuecho' }
  /** ^Q: hides the macro's prompts and input from the command history. */
  | { type: 'quiet' }
  /** ^R command versioning, ^V viewport, ^] select, =* menus: not available yet. */
  | { type: 'unsupported'; code: string }
  /** $M=: a DIESEL expression whose result is replayed as macro text. */
  | { type: 'diesel'; expression: string };

export interface ParsedMacro {
  /** A leading * repeats the macro until another command starts or Esc. */
  repeat: boolean;
  steps: MacroStep[];
}

const toggles = new Set<string>(['B', 'D', 'E', 'G', 'O', 'T']);

/** Length of the balanced $( ... ) starting at `start`, honoring DIESEL quotes. */
function dieselLength(source: string, start: number): number {
  let depth = 0;
  let quoted = false;
  for (let index = start; index < source.length; index++) {
    const character = source[index];
    if (character === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (character === '(') depth++;
    else if (character === ')' && --depth === 0) return index + 1 - start;
  }
  return source.length - start;
}

/** `trailingSpace: false` parses DIESEL output, whose macro already ends the input. */
export function parseMacro(macro: string, options: { trailingSpace?: boolean } = {}): ParsedMacro {
  let source = macro;
  const repeat = source.startsWith('*^C^C');
  if (repeat) source = source.slice(1);
  const steps: MacroStep[] = [];
  let text = '';
  const flush = (): void => {
    if (text) steps.push({ type: 'text', text });
    text = '';
  };
  const push = (step: MacroStep): void => {
    flush();
    steps.push(step);
  };
  // Whether the macro ends with something that suppresses the automatic final space.
  let endsWithControl = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index]!;
    endsWithControl = false;
    if (character === '^' && index + 1 < source.length) {
      const code = source[index + 1]!.toUpperCase();
      index++;
      endsWithControl = true;
      if (code === 'C') push({ type: 'cancel' });
      else if (code === 'M') push({ type: 'enter' });
      else if (code === 'H') push({ type: 'backspace' });
      else if (code === 'I') push({ type: 'tab' });
      else if (code === 'P') push({ type: 'menuecho' });
      else if (code === 'Q') push({ type: 'quiet' });
      else if (code === 'Z') flush();
      else if (toggles.has(code)) push({ type: 'toggle', key: code as MacroToggle });
      else push({ type: 'unsupported', code: `^${code}` });
      continue;
    }
    if (character === ';') {
      push({ type: 'enter' });
      endsWithControl = true;
    } else if (character === ' ') push({ type: 'space' });
    else if (character === '\\') {
      push({ type: 'pause' });
      endsWithControl = true;
    } else if (source.startsWith('$M=', index)) {
      const start = index + 3;
      const length = source.startsWith('$(', start) ? dieselLength(source, start) : 0;
      push({ type: 'diesel', expression: source.slice(start, start + length) });
      index = start + length - 1;
    } else if (source.startsWith('=*', index)) {
      push({ type: 'unsupported', code: '=*' });
      index++;
      endsWithControl = true;
    } else text += character;
  }
  flush();
  // A macro that ends in text gets AutoCAD's automatic trailing space (Enter).
  const last = steps.at(-1);
  if (
    options.trailingSpace !== false &&
    !endsWithControl &&
    (last?.type === 'text' || last?.type === 'diesel')
  )
    steps.push({ type: 'space' });
  return { repeat, steps };
}
