import { describe, expect, it } from 'vitest';
import { InputCancelled, InputQueue, InputValueError } from './index';

describe('headless command input failures', () => {
  it('identifies missing/wrong string and invalid numeric inputs while retaining diagnostic fallback', () => {
    for (const values of [[], [12], [true]] as const) {
      const queue = new InputQueue(values);
      expect(() => queue.requireString()).toThrow(InputValueError);
    }
    try {
      new InputQueue().requireString();
    } catch (error) {
      expect(error).toMatchObject({
        name: 'InputValueError',
        code: 'string-required',
        message: 'A string input is required.',
      });
    }
    for (const value of ['NaN', '', Number.POSITIVE_INFINITY, true] as const) {
      try {
        new InputQueue([value]).requireNumber();
        expect.fail('Nonfinite input must be rejected.');
      } catch (error) {
        expect(error).toBeInstanceOf(InputValueError);
        expect(error).toMatchObject({
          code: 'finite-number-required',
          message: 'A finite number input is required.',
        });
      }
    }
    expect(new InputQueue(['12.5']).requireNumber()).toBe(12.5);
    expect(new InputQueue(['한글']).requireString()).toBe('한글');
    expect(() => new InputQueue(['\u001b']).requireString()).toThrow(InputCancelled);
    expect(() => new InputQueue(['\u001b']).requireNumber()).toThrow(InputCancelled);
  });
});
