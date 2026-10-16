import { describe, expect, it } from 'vitest';
import { ImeController, reverseHangulInput, usesEditableInput } from './index';
import type { PromptInputMode } from './index';

const latinModes: readonly PromptInputMode[] = [
  'command',
  'keyword',
  'number',
  'point',
  'osnap',
  'selection',
];

describe('ImeController prompt policies', () => {
  it.each(latinModes)(
    '%s prompts use physical keys, no editable element and Space accepts',
    (mode) => {
      const ime = new ImeController();
      ime.setMode(mode);
      expect(ime.policy).toEqual({ editable: false, physicalKeys: true, spaceAccepts: true });
      expect(usesEditableInput(mode)).toBe(false);
      expect(ime.keyAction({ code: 'Space' })).toEqual({ type: 'accept', via: 'space' });
    },
  );
  it('lets names compose Korean while Space still accepts, like getstring without spaces', () => {
    const ime = new ImeController();
    ime.setMode('name');
    expect(ime.policy).toEqual({ editable: true, physicalKeys: false, spaceAccepts: true });
    expect(ime.normalize('도면층1')).toBe('도면층1');
  });
  it.each(['text', 'file'] as const)('%s prompts compose Korean and insert spaces', (mode) => {
    const ime = new ImeController();
    ime.setMode(mode);
    expect(ime.policy.editable).toBe(true);
    expect(ime.keyAction({ code: 'Space' })).toEqual({ type: 'insert', text: ' ' });
    expect(ime.keyAction({ code: 'KeyA', key: 'ㅁ' })).toBeUndefined();
    expect(ime.normalize('한글 문자')).toBe('한글 문자');
  });
});

describe('ImeController physical key mapping', () => {
  const ime = new ImeController();
  it.each([
    [
      { code: 'KeyZ', key: 'ㅋ' },
      { type: 'insert', text: 'Z' },
    ],
    [
      { code: 'KeyL', key: 'ㅣ' },
      { type: 'insert', text: 'L' },
    ],
    [
      { code: 'KeyC', key: 'ㅊ' },
      { type: 'insert', text: 'C' },
    ],
    [
      { code: 'KeyO', key: 'Process' },
      { type: 'insert', text: 'O' },
    ],
    [
      { code: 'Digit2', key: '"', shiftKey: true },
      { type: 'insert', text: '@' },
    ],
    [
      { code: 'Comma', key: '<', shiftKey: true },
      { type: 'insert', text: '<' },
    ],
    [
      { code: 'Quote', key: "'" },
      { type: 'insert', text: "'" },
    ],
    [
      { code: 'Minus', key: '-' },
      { type: 'insert', text: '-' },
    ],
    [
      { code: 'Minus', key: '_', shiftKey: true },
      { type: 'insert', text: '_' },
    ],
    [
      { code: 'Period', key: '.' },
      { type: 'insert', text: '.' },
    ],
    [
      { code: 'Numpad7', key: '7' },
      { type: 'insert', text: '7' },
    ],
    [{ code: 'Enter' }, { type: 'accept', via: 'enter' }],
    [{ code: 'NumpadEnter' }, { type: 'accept', via: 'enter' }],
    [{ code: 'Escape' }, { type: 'cancel' }],
    [{ code: 'BracketLeft', ctrlKey: true }, { type: 'cancel' }],
    [{ code: 'Backslash', ctrlKey: true }, { type: 'cancel' }],
    [{ code: 'ArrowUp' }, { type: 'history', direction: -1 }],
    [{ code: 'ArrowDown' }, { type: 'history', direction: 1 }],
    [
      { code: 'Tab', shiftKey: true },
      { type: 'tab', reverse: true },
    ],
    [{ code: 'Backspace' }, { type: 'backspace' }],
    [{ code: 'Home' }, { type: 'caret', to: 'home' }],
  ] as const)('maps %o independently of the IME key value', (event, action) => {
    expect(ime.keyAction(event, 'command')).toEqual(action);
  });
  it('ignores composing events, modified shortcuts and unmapped keys', () => {
    expect(ime.keyAction({ code: 'KeyZ', isComposing: true })).toBeUndefined();
    expect(ime.keyAction({ code: 'KeyZ', ctrlKey: true })).toBeUndefined();
    expect(ime.keyAction({ code: 'KeyZ', altKey: true })).toBeUndefined();
    expect(ime.keyAction({ code: 'F3' })).toBeUndefined();
  });
});

describe('Hangul arriving at command prompts', () => {
  it.each([
    ['ㅣ', 'L'],
    ['ㅊ', 'C'],
    ['채', 'CO'],
    ['ㅋ', 'Z'],
    ['ㅣㅑㅜㄷ', 'LINE'],
    ['ㅁㅁ', 'AA'],
    ['ㅇㅑㄴㅅ', 'DIST'],
    ['ㄱㄷㅊ', 'REC'],
    ['ㅔㅣ', 'PL'],
    ['ㅅㄱ', 'TR'],
    ['ㄷㅌ', 'EX'],
    ['ㅐ', 'O'],
    ['ㅡ', 'M'],
    ['ㅡㅑ', 'MI'],
    ['ㄹ', 'F'],
    ['ㅗ', 'H'],
    ['ㅠ', 'B'],
    ['ㅑ', 'I'],
    ['ㅇㅣㅑ', 'DLI'],
    ['애', 'DO'],
    ['ㄴㄷ', 'SE'],
    ['ㅐㄴㅡㅐㅇㄷ', 'OSMODE'],
    ['ㅐ느', 'OSM'],
    ["'ㅋ", "'Z"],
    ['_ㅣㅑㅜㄷ', '_LINE'],
    ['-ㅣㅁ', '-LA'],
    ['ㅁ', 'A'],
    ['ㅊㅁㅣ', 'CAL'],
    ['ㅕ', 'U'],
    ['ㄲㄷㅇㅐ', 'REDO'],
  ])('normalizes %s to %s', (input, keys) => {
    expect(new ImeController().normalize(input)).toBe(keys);
    expect(reverseHangulInput(input)).toBe(keys);
  });
});
