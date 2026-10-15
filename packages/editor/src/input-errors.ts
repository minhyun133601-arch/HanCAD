export type InputValueErrorCode = 'string-required' | 'finite-number-required';

/** Input queue failures preserve diagnostic fallbacks without choosing a UI language. */
export class InputValueError extends Error {
  constructor(readonly code: InputValueErrorCode) {
    super(
      code === 'string-required'
        ? 'A string input is required.'
        : 'A finite number input is required.',
    );
    this.name = 'InputValueError';
  }
}

export interface InputValueErrorMessages {
  inputStringRequired: string;
  inputFiniteNumberRequired: string;
}

export function formatInputValueError(
  error: InputValueError,
  messages: InputValueErrorMessages,
): string {
  return error.code === 'string-required'
    ? messages.inputStringRequired
    : messages.inputFiniteNumberRequired;
}
