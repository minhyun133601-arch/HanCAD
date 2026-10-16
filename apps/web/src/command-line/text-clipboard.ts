/**
 * Plain-text clipboard for command history and command input. The browser's
 * asynchronous clipboard works on the local secure origin; failures are reported
 * by the caller instead of being ignored.
 */
export async function writeClipboardText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function readClipboardText(): Promise<string | undefined> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return undefined;
  }
}

/** Text currently selected inside the command window, if any. */
export function selectedHistoryText(): string {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return '';
  const anchor = selection.anchorNode?.parentElement;
  return anchor?.closest('.command-line, .text-window') ? selection.toString() : '';
}
