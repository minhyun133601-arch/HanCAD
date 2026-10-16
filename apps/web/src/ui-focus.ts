/**
 * Keyboard routing order (AGENTS.md / Phase 03): a text editor or dialog owns the
 * keys first, then the command line, then global shortcuts. Open modal UI blocks
 * command-line typing and drawing shortcuts.
 */
export function inputBlocked(): boolean {
  return (
    document.querySelector('dialog[open], [data-file-menu-open], [data-context-menu-open]') !== null
  );
}

export function isTextEditingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}
