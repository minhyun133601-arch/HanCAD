/**
 * Global keyboard bindings from docs/SHORTCUTS.md (Reference B). Commands are AutoCAD
 * CUI macros; toggles flip a drafting aid and print its <… 켜기/끄기> message; UI
 * actions belong to the application shell. Text editors, dialogs and the command
 * line handle their own keys first, so these apply only after them.
 */
export type ToggleId =
  | 'grid'
  | 'ortho'
  | 'snap'
  | 'objectSnap'
  | 'object3dSnap'
  | 'polar'
  | 'objectSnapTracking'
  | 'dynamicInput'
  | 'dynamicUcs'
  | 'isoplane'
  | 'selectionCycling'
  | 'coordinates'
  | 'groups'
  | 'pickStyle'
  | 'inferConstraints'
  | 'quickProperties'
  | 'tablet'
  | 'lineweight';

export type UiAction =
  | 'help'
  | 'history'
  | 'textWindow'
  | 'commandLine'
  | 'selectAll'
  | 'erase'
  | 'repeat'
  | 'cancel'
  | 'nextDrawing'
  | 'previousDrawing'
  | 'nextLayout'
  | 'previousLayout'
  | 'cycleViewports'
  | 'cleanScreen'
  | 'palettes'
  | 'cycleOverlap';

export type ShortcutAction =
  | { kind: 'macro'; macro: string }
  | { kind: 'toggle'; toggle: ToggleId }
  | { kind: 'ui'; action: UiAction };

export interface Shortcut {
  /** "Ctrl+Shift+S", "F3", "Delete"; KeyboardEvent.code names without "Key"/"Digit". */
  keys: string;
  action: ShortcutAction;
}

const macro = (keys: string, value: string): Shortcut => ({
  keys,
  action: { kind: 'macro', macro: value },
});
const toggle = (keys: string, id: ToggleId): Shortcut => ({
  keys,
  action: { kind: 'toggle', toggle: id },
});
const ui = (keys: string, action: UiAction): Shortcut => ({ keys, action: { kind: 'ui', action } });

export const shortcuts: readonly Shortcut[] = [
  ui('F1', 'help'),
  ui('F2', 'history'),
  ui('Ctrl+F2', 'textWindow'),
  toggle('F3', 'objectSnap'),
  toggle('F4', 'object3dSnap'),
  toggle('F5', 'isoplane'),
  toggle('F6', 'dynamicUcs'),
  toggle('F7', 'grid'),
  toggle('F8', 'ortho'),
  toggle('F9', 'snap'),
  toggle('F10', 'polar'),
  toggle('F11', 'objectSnapTracking'),
  toggle('F12', 'dynamicInput'),
  ui('Ctrl+0', 'cleanScreen'),
  macro('Ctrl+1', '^C^C_PROPERTIES'),
  macro('Ctrl+2', '^C^C_ADCENTER'),
  macro('Ctrl+3', '^C^C_TOOLPALETTES'),
  macro('Ctrl+4', '^C^C_SHEETSET'),
  macro('Ctrl+6', '^C^C_DBCONNECT'),
  macro('Ctrl+7', '^C^C_MARKUP'),
  macro('Ctrl+8', '^C^C_QUICKCALC'),
  ui('Ctrl+9', 'commandLine'),
  ui('Ctrl+A', 'selectAll'),
  toggle('Ctrl+Shift+A', 'groups'),
  toggle('Ctrl+B', 'snap'),
  macro('Ctrl+C', '^C^C_COPYCLIP'),
  macro('Ctrl+Shift+C', '^C^C_COPYBASE'),
  toggle('Ctrl+D', 'dynamicUcs'),
  toggle('Ctrl+E', 'isoplane'),
  toggle('Ctrl+F', 'objectSnap'),
  toggle('Ctrl+G', 'grid'),
  toggle('Ctrl+H', 'pickStyle'),
  ui('Ctrl+Shift+H', 'palettes'),
  toggle('Ctrl+I', 'coordinates'),
  toggle('Ctrl+Shift+I', 'inferConstraints'),
  ui('Ctrl+J', 'repeat'),
  macro('Ctrl+K', '^C^C_HYPERLINK'),
  toggle('Ctrl+L', 'ortho'),
  ui('Ctrl+M', 'repeat'),
  macro('Ctrl+N', '^C^C_NEW'),
  macro('Ctrl+O', '^C^C_OPEN'),
  macro('Ctrl+P', '^C^C_PLOT'),
  toggle('Ctrl+Shift+P', 'quickProperties'),
  macro('Ctrl+Q', '^C^C_QUIT'),
  ui('Ctrl+R', 'cycleViewports'),
  macro('Ctrl+S', '^C^C_QSAVE'),
  macro('Ctrl+Shift+S', '^C^C_SAVEAS'),
  toggle('Ctrl+T', 'tablet'),
  toggle('Ctrl+U', 'polar'),
  macro('Ctrl+V', '^C^C_PASTECLIP'),
  macro('Ctrl+Shift+V', '^C^C_PASTEBLOCK'),
  toggle('Ctrl+W', 'selectionCycling'),
  macro('Ctrl+X', '^C^C_CUTCLIP'),
  macro('Ctrl+Y', '^C^C_REDO'),
  macro('Ctrl+Z', '^C^C_U'),
  ui('Ctrl+BracketLeft', 'cancel'),
  ui('Ctrl+Backslash', 'cancel'),
  ui('Ctrl+Tab', 'nextDrawing'),
  ui('Ctrl+Shift+Tab', 'previousDrawing'),
  ui('Ctrl+PageUp', 'previousLayout'),
  ui('Ctrl+PageDown', 'nextLayout'),
  macro('Ctrl+F4', '^C^C_CLOSE'),
  ui('Delete', 'erase'),
  // Shift+Space (cycling overlapping objects) belongs to selection prompts and is
  // handled there, before the command line would take Space as Enter.
];

export interface ChordEvent {
  code: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

/** "Ctrl+Shift+S" for Ctrl+Shift+KeyS; "Ctrl+0" for Digit0; "F3" for F3. */
export function chordOf(event: ChordEvent): string {
  const key = event.code.replace(/^Key/, '').replace(/^Digit/, '');
  return [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', key]
    .filter(Boolean)
    .join('+');
}

const byChord = new Map(shortcuts.map((shortcut) => [shortcut.keys, shortcut]));
export function findShortcut(event: ChordEvent): Shortcut | undefined {
  return event.metaKey ? undefined : byChord.get(chordOf(event));
}
