import { describe, expect, it } from 'vitest';
import { rightClickAction } from './shortcut-menu';

describe('drawing-area right-click policy', () => {
  it('distinguishes default, edit, command and command-options modes', () => {
    for (let bits = 0; bits < 16; bits++) {
      expect(
        rightClickAction(bits, 0, 250, {
          commandActive: false,
          selected: false,
          hasKeywords: false,
        }),
      ).toBe(bits & 1 ? 'menu' : 'enter');
      expect(
        rightClickAction(bits, 0, 250, {
          commandActive: false,
          selected: true,
          hasKeywords: false,
        }),
      ).toBe(bits & 2 ? 'menu' : 'enter');
      expect(
        rightClickAction(bits, 0, 250, { commandActive: true, selected: true, hasKeywords: false }),
      ).toBe(bits & 4 ? 'menu' : 'enter');
      expect(
        rightClickAction(bits, 0, 250, { commandActive: true, selected: false, hasKeywords: true }),
      ).toBe(bits & 12 ? 'menu' : 'enter');
    }
  });
  it('uses the inclusive duration boundary for every timed mode', () => {
    for (let bits = 16; bits < 32; bits++) {
      const context = { commandActive: true, selected: true, hasKeywords: false };
      expect(rightClickAction(bits, 249, 250, context)).toBe('enter');
      expect(rightClickAction(bits, 250, 250, context)).toBe('menu');
    }
  });
});
