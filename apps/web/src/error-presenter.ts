import { formatSystemVariableError, SystemVariableError } from '@hancad/sysvars';
import type { Messages } from '@hancad/ui';
import { CanvasContextError } from '@hancad/render';
import { CommandInputError, formatCommandInputError } from '@hancad/commands';
import { InputValueError, formatInputValueError } from '@hancad/editor';
import { PdfExportError, formatPdfExportError } from '@hancad/io-pdf';
import { getCadImportDiagnostic } from '@hancad/legacy-bridge';
import { formatCadImportDiagnostic } from '@hancad/ui';
import { UndoStateError } from '@hancad/db';
import { NativeDrawingFileError } from './native-file-error';
import { CreationStyleError } from './creation-style-error';

const creationStyleMessages = {
  'invalid-color': 'creationColorInvalid',
  'invalid-rgb': 'creationRgbInvalid',
  'unsupported-hsl': 'creationHslUnsupported',
  'unsupported-color-book': 'creationColorBookUnsupported',
} as const;

/** Localize recognized domain errors without rewriting unrelated diagnostics. */
export function errorMessage(error: unknown, messages: Messages): string {
  if (error instanceof NativeDrawingFileError) return messages.nativeOpenFailed;
  if (error instanceof CreationStyleError) return messages[creationStyleMessages[error.code]];
  if (error instanceof UndoStateError)
    return messages[
      error.code === 'no-group'
        ? 'undoNoGroup'
        : error.code === 'disabled'
          ? 'undoDisabled'
          : 'undoLimited'
    ];
  if (error instanceof CanvasContextError) return messages.rendererContextUnavailable(error.kind);
  if (error instanceof CommandInputError) return formatCommandInputError(error, messages);
  if (error instanceof InputValueError) return formatInputValueError(error, messages);
  if (error instanceof PdfExportError) return formatPdfExportError(error, messages);
  const diagnostic = getCadImportDiagnostic(error);
  if (diagnostic) return formatCadImportDiagnostic(diagnostic, messages.importDiagnostics);
  return error instanceof SystemVariableError
    ? formatSystemVariableError(error, messages)
    : error instanceof Error
      ? error.message
      : String(error);
}
