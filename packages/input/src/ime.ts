import { reverseHangulInput } from './hangul';
import { mapKeyboardCode } from './keyboard';
import type { PromptInputMode } from './keyboard';

/** How the command line must behave for the active prompt (AGENTS.md section 3). */
export interface InputPolicy {
  /** Free text uses an editable element so the IME can compose Korean. */
  editable: boolean;
  /** Command syntax comes from physical US QWERTY keys regardless of IME state. */
  physicalKeys: boolean;
  /** Space accepts the input like Enter instead of inserting a space. */
  spaceAccepts: boolean;
}

const policies: Readonly<Record<PromptInputMode, InputPolicy>> = {
  command: { editable: false, physicalKeys: true, spaceAccepts: true },
  keyword: { editable: false, physicalKeys: true, spaceAccepts: true },
  number: { editable: false, physicalKeys: true, spaceAccepts: true },
  point: { editable: false, physicalKeys: true, spaceAccepts: true },
  osnap: { editable: false, physicalKeys: true, spaceAccepts: true },
  selection: { editable: false, physicalKeys: true, spaceAccepts: true },
  name: { editable: true, physicalKeys: false, spaceAccepts: true },
  text: { editable: true, physicalKeys: false, spaceAccepts: false },
  file: { editable: true, physicalKeys: false, spaceAccepts: false },
};

export interface KeyInput {
  code: string;
  key?: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
}

export type CommandKeyAction =
  | { type: 'insert'; text: string }
  | { type: 'accept'; via: 'enter' | 'space' }
  | { type: 'backspace' }
  | { type: 'delete' }
  | { type: 'cancel' }
  | { type: 'history'; direction: -1 | 1 }
  | { type: 'tab'; reverse: boolean }
  | { type: 'caret'; to: 'left' | 'right' | 'home' | 'end' };

/**
 * Decides latin (physical key) or text (IME composition) handling from the prompt type
 * and turns stray Hangul back into the Dubeolsik keys that produced it.
 */
export class ImeController {
  private current: PromptInputMode = 'command';

  get mode(): PromptInputMode {
    return this.current;
  }
  setMode(mode: PromptInputMode): void {
    this.current = mode;
  }
  get policy(): InputPolicy {
    return policies[this.current];
  }

  /** Text arriving from paste, composition end or a synthetic key value. */
  normalize(text: string, mode: PromptInputMode = this.current): string {
    return policies[mode].physicalKeys ? reverseHangulInput(text) : text;
  }

  /** Physical-key interpretation; returns undefined for keys the command line ignores. */
  keyAction(event: KeyInput, mode: PromptInputMode = this.current): CommandKeyAction | undefined {
    const policy = policies[mode];
    if (event.isComposing) return undefined;
    if (event.code === 'Escape') return { type: 'cancel' };
    if (event.ctrlKey && (event.code === 'BracketLeft' || event.code === 'Backslash'))
      return { type: 'cancel' };
    if (event.ctrlKey || event.metaKey || event.altKey) return undefined;
    if (event.code === 'Enter' || event.code === 'NumpadEnter')
      return { type: 'accept', via: 'enter' };
    if (event.code === 'Space')
      return policy.spaceAccepts ? { type: 'accept', via: 'space' } : { type: 'insert', text: ' ' };
    if (event.code === 'ArrowUp') return { type: 'history', direction: -1 };
    if (event.code === 'ArrowDown') return { type: 'history', direction: 1 };
    if (event.code === 'Tab') return { type: 'tab', reverse: event.shiftKey === true };
    if (event.code === 'Backspace') return { type: 'backspace' };
    if (event.code === 'Delete') return { type: 'delete' };
    if (event.code === 'ArrowLeft') return { type: 'caret', to: 'left' };
    if (event.code === 'ArrowRight') return { type: 'caret', to: 'right' };
    if (event.code === 'Home') return { type: 'caret', to: 'home' };
    if (event.code === 'End') return { type: 'caret', to: 'end' };
    if (!policy.physicalKeys) return undefined;
    const text = mapKeyboardCode(event.code, event.shiftKey === true);
    return text === undefined ? undefined : { type: 'insert', text };
  }
}
