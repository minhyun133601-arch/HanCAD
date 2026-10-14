import { describe, expect, it } from 'vitest';
import { mapKeyboardCode, reverseDubeolsik, reverseHangulInput, usesEditableInput } from './index';

const jamoCases: readonly (readonly [string, string])[] = [
  ['ㄱ', 'r'],
  ['ㄲ', 'R'],
  ['ㄳ', 'rt'],
  ['ㄴ', 's'],
  ['ㄵ', 'sw'],
  ['ㄶ', 'sg'],
  ['ㄷ', 'e'],
  ['ㄸ', 'E'],
  ['ㄹ', 'f'],
  ['ㄺ', 'fr'],
  ['ㄻ', 'fa'],
  ['ㄼ', 'fq'],
  ['ㄽ', 'ft'],
  ['ㄾ', 'fx'],
  ['ㄿ', 'fv'],
  ['ㅀ', 'fg'],
  ['ㅁ', 'a'],
  ['ㅂ', 'q'],
  ['ㅃ', 'Q'],
  ['ㅄ', 'qt'],
  ['ㅅ', 't'],
  ['ㅆ', 'T'],
  ['ㅇ', 'd'],
  ['ㅈ', 'w'],
  ['ㅉ', 'W'],
  ['ㅊ', 'c'],
  ['ㅋ', 'z'],
  ['ㅌ', 'x'],
  ['ㅍ', 'v'],
  ['ㅎ', 'g'],
  ['ㅏ', 'k'],
  ['ㅐ', 'o'],
  ['ㅑ', 'i'],
  ['ㅒ', 'O'],
  ['ㅓ', 'j'],
  ['ㅔ', 'p'],
  ['ㅕ', 'u'],
  ['ㅖ', 'P'],
  ['ㅗ', 'h'],
  ['ㅘ', 'hk'],
  ['ㅙ', 'ho'],
  ['ㅚ', 'hl'],
  ['ㅛ', 'y'],
  ['ㅜ', 'n'],
  ['ㅝ', 'nj'],
  ['ㅞ', 'np'],
  ['ㅟ', 'nl'],
  ['ㅠ', 'b'],
  ['ㅡ', 'm'],
  ['ㅢ', 'ml'],
  ['ㅣ', 'l'],
];
const composedCases: readonly (readonly [string, string])[] = [
  ['가', 'rk'],
  ['까', 'Rk'],
  ['따', 'Ek'],
  ['빠', 'Qk'],
  ['싸', 'Tk'],
  ['짜', 'Wk'],
  ['과', 'rhk'],
  ['괘', 'rho'],
  ['괴', 'rhl'],
  ['궈', 'rnj'],
  ['궤', 'rnp'],
  ['귀', 'rnl'],
  ['긔', 'rml'],
  ['갃', 'rkrt'],
  ['간', 'rks'],
  ['갅', 'rksw'],
  ['갆', 'rksg'],
  ['갈', 'rkf'],
  ['갉', 'rkfr'],
  ['갊', 'rkfa'],
  ['갋', 'rkfq'],
  ['갌', 'rkft'],
  ['갍', 'rkfx'],
  ['갎', 'rkfv'],
  ['갏', 'rkfg'],
  ['값', 'rkqt'],
  ['갔', 'rkT'],
  ['채', 'co'],
  ['ㅣㅑㅜㄷ', 'line'],
  ['한글', 'gksrmf'],
];

describe('Korean command reversal', () => {
  it.each(jamoCases)('reverses isolated/compound/shifted jamo %s', (input, keys) => {
    expect(reverseDubeolsik(input)).toBe(keys);
  });
  it.each(composedCases)('reverses composed syllables %s', (input, keys) => {
    expect(reverseDubeolsik(input)).toBe(keys);
  });
  it('supports decomposed Unicode Hangul and canonical command case', () => {
    expect(reverseHangulInput('한글')).toBe('GKSRMF');
    expect(reverseHangulInput('ㅣㅑㅜㄷ')).toBe('LINE');
    expect(reverseHangulInput('_채')).toBe('_CO');
    expect(reverseHangulInput('@10,20<45')).toBe('@10,20<45');
  });
});

describe('prompt mode and physical keyboard', () => {
  it.each([
    ['KeyZ', false, 'Z'],
    ['KeyL', true, 'L'],
    ['Digit2', true, '@'],
    ['Digit0', true, ')'],
    ['Digit7', false, '7'],
    ['Comma', true, '<'],
    ['Quote', false, "'"],
    ['NumpadDecimal', false, '.'],
    ['NumpadSubtract', false, '-'],
    ['Space', false, ' '],
    ['Enter', false, undefined],
  ] as const)('maps %s without depending on IME event.key', (code, shift, expected) => {
    expect(mapKeyboardCode(code, shift)).toBe(expected);
  });
  it('keeps free Korean text/file input editable and command syntax non-editable', () => {
    expect(usesEditableInput('text')).toBe(true);
    expect(usesEditableInput('file')).toBe(true);
    for (const mode of ['command', 'keyword', 'number', 'point', 'osnap'] as const)
      expect(usesEditableInput(mode)).toBe(false);
  });
});
