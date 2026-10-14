import { formatSystemVariableError, SystemVariableError } from '@hancad/sysvars';
import type { Messages } from '@hancad/ui';

/** Localize recognized domain errors without rewriting unrelated diagnostics. */
export function errorMessage(error: unknown, messages: Messages): string {
  return error instanceof SystemVariableError
    ? formatSystemVariableError(error, messages)
    : error instanceof Error
      ? error.message
      : String(error);
}
