export type CreationStyleErrorCode =
  'invalid-color' | 'invalid-rgb' | 'unsupported-hsl' | 'unsupported-color-book';

/** Creation-variable validation is independent of the active presentation locale. */
export class CreationStyleError extends Error {
  constructor(readonly code: CreationStyleErrorCode) {
    super(`Invalid or unsupported current entity color: ${code}`);
    this.name = 'CreationStyleError';
  }
}
