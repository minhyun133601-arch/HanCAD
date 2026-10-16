import { useState } from 'react';
import { loadLayout, saveLayout } from './layout';
import type { CommandLineLayout } from './layout';

/** Command window visibility, placement and its secondary windows (Phase 03). */
export function useCommandWindow() {
  const [layout, setLayout] = useState<CommandLineLayout>(loadLayout);
  const [visible, setVisible] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [textWindow, setTextWindow] = useState(false);
  const [transparencyOpen, setTransparencyOpen] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);

  function changeLayout(next: CommandLineLayout): void {
    setLayout(next);
    saveLayout(next);
    if (next.docked) setExpanded(false);
  }
  return {
    layout,
    changeLayout,
    visible,
    expanded,
    textWindow,
    transparencyOpen,
    closeConfirm,
    show: () => setVisible(true),
    hide: () => {
      setVisible(false);
      setCloseConfirm(false);
    },
    /** Ctrl+9 toggles the window directly; the close button asks first. */
    toggle: () => setVisible((value) => !value),
    requestClose: () => setCloseConfirm(true),
    cancelClose: () => setCloseConfirm(false),
    /** F2: a floating window expands its history; a docked one opens the text window. */
    pressF2: () => {
      setVisible(true);
      if (layout.docked) setTextWindow((value) => !value);
      else setExpanded((value) => !value);
    },
    toggleExpanded: () => setExpanded((value) => !value),
    openTextWindow: () => setTextWindow(true),
    closeTextWindow: () => setTextWindow(false),
    openTransparency: () => setTransparencyOpen(true),
    closeTransparency: () => setTransparencyOpen(false),
  };
}
export type CommandWindowState = ReturnType<typeof useCommandWindow>;
