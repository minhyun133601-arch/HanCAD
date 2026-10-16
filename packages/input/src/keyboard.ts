const punctuation: Readonly<Record<string, readonly [string, string]>> = {
  Backquote: ['`', '~'],
  Minus: ['-', '_'],
  Equal: ['=', '+'],
  BracketLeft: ['[', '{'],
  BracketRight: [']', '}'],
  Backslash: ['\\', '|'],
  Semicolon: [';', ':'],
  Quote: ["'", '"'],
  Comma: [',', '<'],
  Period: ['.', '>'],
  Slash: ['/', '?'],
};
const shiftedDigits = ')!@#$%^&*(';
const numpad: Readonly<Record<string, string>> = {
  NumpadDecimal: '.',
  NumpadAdd: '+',
  NumpadSubtract: '-',
  NumpadMultiply: '*',
  NumpadDivide: '/',
  NumpadEqual: '=',
};

/** US physical keys are used only when the active prompt expects command syntax. */
export function mapKeyboardCode(code: string, shiftKey = false): string | undefined {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code))
    return shiftKey ? shiftedDigits[Number(code.slice(5))] : code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6);
  if (code === 'Space') return ' ';
  const pair = punctuation[code];
  return pair ? pair[shiftKey ? 1 : 0] : numpad[code];
}

/**
 * Prompt input types: command syntax (command, keyword, number, point, osnap, selection)
 * uses physical keys; names, free text and file names use an editable element.
 */
export type PromptInputMode =
  'command' | 'keyword' | 'number' | 'point' | 'osnap' | 'selection' | 'name' | 'text' | 'file';

export function usesEditableInput(mode: PromptInputMode): boolean {
  return mode === 'name' || mode === 'text' || mode === 'file';
}
