import { formatSystemVariableError, SystemVariableError } from '@hancad/sysvars';
import type { Messages } from '@hancad/ui';
import { CanvasContextError } from '@hancad/render';
import { CommandInputError, formatCommandInputError } from '@hancad/commands';
import { InputValueError, formatInputValueError } from '@hancad/editor';
import { PdfExportError, formatPdfExportError } from '@hancad/io-pdf';
import { getCadImportDiagnostic } from '@hancad/legacy-bridge';
import { formatCadImportDiagnostic } from '@hancad/ui';

/** Localize recognized domain errors without rewriting unrelated diagnostics. */
export function errorMessage(error: unknown, messages: Messages): string {
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
