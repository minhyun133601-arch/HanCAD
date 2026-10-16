export interface ShortcutMenuContext {
  commandActive: boolean;
  selected: boolean;
  hasKeywords: boolean;
}

/** SHORTCUTMENU bit 16 supersedes the mode bits with timed Enter/menu behavior. */
export function rightClickAction(
  bits: number,
  heldMilliseconds: number,
  duration: number,
  context: ShortcutMenuContext,
): 'enter' | 'menu' {
  if (bits & 16) return heldMilliseconds >= duration ? 'menu' : 'enter';
  const enabled = context.commandActive
    ? Boolean(bits & 4) || Boolean(bits & 8 && context.hasKeywords)
    : Boolean(bits & (context.selected ? 2 : 1));
  return enabled ? 'menu' : 'enter';
}
