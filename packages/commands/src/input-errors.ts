export type CommandInputErrorCode = 'invalid-point' | 'string-required' | 'invalid-history-count';

/** A recognized input failure, independent of UI catalogs and command execution state. */
export class CommandInputError extends Error {
  constructor(
    readonly code: CommandInputErrorCode,
    readonly variable?: string,
  ) {
    super(
      code === 'invalid-point'
        ? `Invalid point value for ${variable}`
        : code === 'string-required'
          ? `A string value is required for ${variable}`
          : 'Undo/redo count must be a positive integer.',
    );
    this.name = 'CommandInputError';
  }
}

export interface CommandInputErrorMessages {
  commandInvalidPointValue: (name: string) => string;
  commandStringValueRequired: (name: string) => string;
  commandHistoryCountInvalid: string;
}

export function formatCommandInputError(
  error: CommandInputError,
  messages: CommandInputErrorMessages,
): string {
  switch (error.code) {
    case 'invalid-point':
      return messages.commandInvalidPointValue(error.variable ?? '');
    case 'string-required':
      return messages.commandStringValueRequired(error.variable ?? '');
    case 'invalid-history-count':
      return messages.commandHistoryCountInvalid;
  }
}
