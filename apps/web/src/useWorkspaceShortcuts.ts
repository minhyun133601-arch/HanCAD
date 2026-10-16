import { useEffect, useRef } from 'react';
import { findShortcut } from '@hancad/input';
import type { ToggleId, UiAction } from '@hancad/input';
import type { useDrawingFiles } from './useDrawingFiles';
import type { useDrafting } from './useDrafting';

interface Options {
  files: Pick<
    ReturnType<typeof useDrawingFiles>,
    'restoring' | 'reading' | 'cancelRestore' | 'cancelImport'
  >;
  draft: Pick<ReturnType<typeof useDrafting>, 'selectAll'>;
  /** A command, navigation or prompt is running (Delete only erases at idle). */
  isActive: () => boolean;
  /** Ends every running tool silently (Ctrl+A). */
  cancelTools: () => void;
  execute: (macro: string) => void;
  toggle: (id: ToggleId) => void;
  /** Enter at the current prompt; at an empty command prompt it repeats. */
  enter: () => void;
  focusCommand: () => void;
  cancelPointer: () => void;
  toggleCommand: () => void;
  toggleExpanded: () => void;
  openTextWindow: () => void;
  switchDrawing: (offset: 1 | -1) => void;
  switchLayout: (offset: 1 | -1) => void;
  pending: (action: 'cycleViewports' | 'cycleOverlap') => void;
}

/**
 * Global bindings from docs/SHORTCUTS.md. Text editors and dialogs keep their own
 * keys, and the command line handles typing, Enter/Space, Esc, Ctrl+[ and history
 * first; only what remains reaches this table.
 */
export function useWorkspaceShortcuts(options: Options): void {
  const latest = useRef(options);
  latest.current = options;
  useEffect(() => {
    function run(action: UiAction, live: Options): void {
      switch (action) {
        case 'help':
          return live.execute("'_HELP");
        case 'history':
          return live.toggleExpanded();
        case 'textWindow':
          return live.openTextWindow();
        case 'commandLine':
          return live.toggleCommand();
        case 'selectAll':
          live.cancelPointer();
          live.cancelTools();
          live.draft.selectAll();
          return live.focusCommand();
        case 'erase':
          return live.execute('ERASE');
        case 'repeat':
          return live.enter();
        case 'nextDrawing':
        case 'previousDrawing':
          return live.switchDrawing(action === 'nextDrawing' ? 1 : -1);
        case 'nextLayout':
        case 'previousLayout':
          return live.switchLayout(action === 'nextLayout' ? 1 : -1);
        case 'cleanScreen':
          return live.execute('^C^C_CLEANSCREENON');
        case 'palettes':
          return live.execute('^C^C_HIDEPALETTES');
        case 'cycleViewports':
        case 'cycleOverlap':
          return live.pending(action);
        case 'cancel':
          // The command line already cancels Ctrl+[ and Ctrl+\.
          return;
      }
    }
    function handleShortcut(event: KeyboardEvent): void {
      const live = latest.current;
      const { files } = live;
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
      const shortcut = findShortcut(event);
      if (!shortcut || event.defaultPrevented) return;
      // Delete erases a selection only while no command is running.
      if (shortcut.action.kind === 'ui' && shortcut.action.action === 'erase' && live.isActive())
        return;
      if (shortcut.action.kind === 'ui' && shortcut.action.action === 'cancel') return;
      event.preventDefault();
      if (shortcut.action.kind === 'macro') live.execute(shortcut.action.macro);
      else if (shortcut.action.kind === 'toggle') live.toggle(shortcut.action.toggle);
      else run(shortcut.action.action, live);
    }
    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, []);
}
