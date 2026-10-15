import { useEffect, useRef } from 'react';
import type { Messages } from '@hancad/ui';
import type { DrawingSession } from './drawing-session';

interface DrawingFileNoticeOptions {
  initial: { drawing: DrawingSession; reused: boolean; failed: boolean; restored: boolean };
  messages: Messages;
  print: (message: string) => void;
  documentName: string;
  notice: 'restored' | 'opened' | undefined;
  consumeNotice: (() => void) | undefined;
}
/** Consume a document notice once, including StrictMode's repeated effect setup. */
export function useDrawingFileNotice({
  initial,
  messages,
  print,
  documentName,
  notice,
  consumeNotice,
}: DrawingFileNoticeOptions): void {
  const printed = useRef(false);
  useEffect(() => {
    if (printed.current) return;
    printed.current = true;
    if (notice) {
      print(
        notice === 'restored'
          ? messages.restoredDrawing
          : messages.importFinished(documentName, initial.drawing.state.entities.length),
      );
      consumeNotice?.();
      return;
    }
    if (initial.reused) return;
    if (initial.failed) print(messages.restoreFailed);
    else if (initial.restored) print(messages.restoredDrawing);
  }, [initial]);
}
