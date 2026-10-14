import { useEffect } from 'react';
import { statusToggles } from './StatusBar';
import type { StatusToggle } from './StatusBar';
import type { Messages } from '@hancad/ui';
import type { useDrawingFiles } from './useDrawingFiles';
import type { useDrafting } from './useDrafting';
import type { useDimensions } from './useDimensions';
import type { useModification } from './useModification';
import type { useMeasurement } from './useMeasurement';

interface Options {
  files: Pick<
    ReturnType<typeof useDrawingFiles>,
    'restoring' | 'reading' | 'cancelRestore' | 'cancelImport'
  >;
  draft: Pick<ReturnType<typeof useDrafting>, 'isActive' | 'cancel' | 'selectAll'>;
  dimensions: Pick<ReturnType<typeof useDimensions>, 'isActive' | 'cancel'>;
  modification: Pick<ReturnType<typeof useModification>, 'isActive' | 'cancel'>;
  measurement: Pick<ReturnType<typeof useMeasurement>, 'isActive' | 'cancel'>;
  additional?: readonly { isActive: () => boolean; cancel: (notify?: boolean) => boolean }[];
  messages: Pick<Messages, 'draftingAidsPending'>;
  print: (message: string) => void;
  execute: (command: string) => void;
  focusCommand: () => void;
  cancelPointer: () => void;
  showCommand: () => void;
  toggleCommand: () => void;
  toggleExpanded: () => void;
  toggle: (item: StatusToggle) => void;
}

/** Document shortcuts always use the current render's controller callbacks. */
export function useWorkspaceShortcuts(options: Options): void {
  useEffect(() => {
    const { files, draft, dimensions, modification, measurement } = options;
    function handleShortcut(event: KeyboardEvent): void {
      if (document.querySelector('dialog[open], [data-file-menu-open]')) return;
      if (files.restoring && event.code === 'Escape') {
        event.preventDefault();
        files.cancelRestore();
        return;
      }
      if (files.reading) {
        if (event.code === 'Escape') {
          event.preventDefault();
          files.cancelImport();
        }
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      )
        return;
      if (event.ctrlKey && event.code === 'KeyO') {
        event.preventDefault();
        options.execute('OPEN');
      } else if (event.ctrlKey && event.code === 'KeyS') {
        event.preventDefault();
        options.execute('QSAVE');
      } else if (event.ctrlKey && (event.code === 'KeyZ' || event.code === 'KeyY')) {
        event.preventDefault();
        options.execute(event.code === 'KeyY' || event.shiftKey ? 'REDO' : 'U');
      } else if (event.ctrlKey && event.code === 'KeyA') {
        event.preventDefault();
        options.cancelPointer();
        if (draft.isActive()) draft.cancel(false);
        if (dimensions.isActive()) dimensions.cancel(false);
        modification.cancel(false);
        measurement.cancel(false);
        for (const item of options.additional ?? []) if (item.isActive()) item.cancel(false);
        draft.selectAll();
        options.focusCommand();
      } else if (
        event.code === 'Delete' &&
        !draft.isActive() &&
        !dimensions.isActive() &&
        !modification.isActive() &&
        !measurement.isActive() &&
        !(options.additional ?? []).some((item) => item.isActive())
      ) {
        event.preventDefault();
        options.execute('ERASE');
      } else if (event.code === 'F2') {
        event.preventDefault();
        options.showCommand();
        options.toggleExpanded();
      } else if (event.ctrlKey && event.code === 'Digit9') {
        event.preventDefault();
        options.toggleCommand();
      } else {
        const item = statusToggles.find((item) => item.key === event.code);
        if (item) {
          event.preventDefault();
          if (item.implemented === false) options.print(options.messages.draftingAidsPending);
          else options.toggle(item);
        }
      }
    }
    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  });
}
