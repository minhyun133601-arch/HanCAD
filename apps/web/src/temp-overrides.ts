import { getSystemVariableDefinition } from '@hancad/sysvars';
import type { SystemVariables } from '@hancad/sysvars';
import { parseDraftNumber, parseDraftPoint } from '@hancad/draft';
import { snapModeBits, type PointSnapOverride } from '@hancad/draft';

/**
 * Temporary override keys (TEMPOVERRIDES=1): held at a point prompt they change how
 * drafting aids behave and restore them on release. HanCAD applies them as an
 * effective-value layer over the variables, so nothing enters the drawing or undo.
 */
export type TempOverride =
  | 'ortho'
  | 'osnapToggle'
  | 'osnapEnforce'
  | 'endpoint'
  | 'midpoint'
  | 'center'
  | 'disableSnaps'
  | 'trackingToggle'
  | 'polarToggle'
  | 'dynamicUcsToggle';

/** A shortcut-menu choice applies to one accepted point, independent of held keys. */
export type ObjectSnapOverride = PointSnapOverride;
const objectSnapModes: Readonly<Record<ObjectSnapOverride, number>> = {
  ...snapModeBits,
  none: 0,
};

/** Shift plus either key of each pair, as listed in SHORTCUTS.md. */
export const tempOverrideKeys: Readonly<Record<string, TempOverride>> = {
  KeyA: 'osnapToggle',
  Quote: 'osnapToggle',
  KeyS: 'osnapEnforce',
  Semicolon: 'osnapEnforce',
  KeyE: 'endpoint',
  KeyP: 'endpoint',
  KeyV: 'midpoint',
  KeyM: 'midpoint',
  KeyC: 'center',
  Comma: 'center',
  KeyD: 'disableSnaps',
  KeyL: 'disableSnaps',
  KeyQ: 'trackingToggle',
  BracketRight: 'trackingToggle',
  KeyX: 'polarToggle',
  Period: 'polarToggle',
  KeyZ: 'dynamicUcsToggle',
  Slash: 'dynamicUcsToggle',
};

const suppressed = 16384;
function defaultOsmode(): number {
  const value = getSystemVariableDefinition('OSMODE')?.default;
  return typeof value === 'number' ? value : 4133;
}

export class TempOverrides {
  private readonly held = new Set<TempOverride>();
  private readonly listeners = new Set<() => void>();
  private version = 0;
  private objectSnap: ObjectSnapOverride | undefined;

  getObjectSnap(): ObjectSnapOverride | undefined {
    return this.objectSnap;
  }
  setObjectSnap(mode: ObjectSnapOverride): void {
    if (this.objectSnap === mode) return;
    this.objectSnap = mode;
    this.notify();
  }
  clearObjectSnap(): void {
    if (this.objectSnap === undefined) return;
    this.objectSnap = undefined;
    this.notify();
  }
  consumeObjectSnap(): void {
    this.clearObjectSnap();
  }
  /** Rejected values and prompt keywords do not use up a pending point override. */
  consumeObjectSnapInput(input: string, accepted: boolean): void {
    if (accepted && (parseDraftNumber(input) !== undefined || parseDraftPoint(input) !== undefined))
      this.consumeObjectSnap();
  }

  has(override: TempOverride): boolean {
    return this.held.has(override);
  }
  press(override: TempOverride): void {
    if (this.held.has(override)) return;
    this.held.add(override);
    this.notify();
  }
  release(override?: TempOverride): void {
    if (override ? !this.held.delete(override) : this.held.size === 0) return;
    if (!override) this.held.clear();
    this.notify();
  }

  /** The value drafting aids should use for `name` while overrides are held. */
  effective(name: string, value: number): number {
    const held = this.held;
    if (name === 'OSMODE' && this.objectSnap !== undefined)
      value = objectSnapModes[this.objectSnap];
    if (!held.size) return value;
    if (name === 'ORTHOMODE' && held.has('ortho')) return value ? 0 : 1;
    if (name === 'OSMODE') {
      if (held.has('disableSnaps')) return 0;
      if (held.has('endpoint')) return 1;
      if (held.has('midpoint')) return 2;
      if (held.has('center')) return 4;
      const modes = value === 0 || value === suppressed ? defaultOsmode() : value;
      if (held.has('osnapEnforce')) return modes & ~suppressed;
      if (held.has('osnapToggle'))
        return value && value !== suppressed ? value ^ suppressed : modes;
    }
    if (name === 'AUTOSNAP') {
      let result = value;
      if (held.has('disableSnaps')) result &= ~(8 | 16);
      if (held.has('trackingToggle')) result ^= 16;
      if (held.has('polarToggle')) result ^= 8;
      return result;
    }
    if (name === 'UCSDETECT' && held.has('dynamicUcsToggle')) return value ? 0 : 1;
    return value;
  }
  number(sysvars: SystemVariables, name: string): number {
    return this.effective(name, sysvars.getNumber(name));
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  snapshot = (): number => this.version;
  private notify(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }
}

/** Keyboard state is application-wide, like the physical keys. */
export const tempOverrides = new TempOverrides();
