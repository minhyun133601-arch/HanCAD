import { getSystemVariableDefinition } from '@hancad/sysvars';
import type { SystemVariables } from '@hancad/sysvars';
import type { ToggleId } from '@hancad/input';

/**
 * Drafting-aid toggles shared by function keys, Ctrl shortcuts, macro control
 * characters (^B ^G ^O) and status-bar buttons. Each flips its system variable the
 * way AutoCAD does and reports the state for the "<… 켜기>" message.
 */
export interface DraftingToggle {
  variable: string;
  /** Whether HanCAD already implements the behavior, not just the variable. */
  implemented: boolean;
  enabled(sysvars: SystemVariables): boolean;
  flip(sysvars: SystemVariables): void;
}

function number(sysvars: SystemVariables, name: string): number {
  return sysvars.getNumber(name);
}
const fallback = (name: string, value: number): number => {
  const initial = getSystemVariableDefinition(name)?.default;
  return typeof initial === 'number' && initial !== 0 ? initial : value;
};
function onOff(variable: string, implemented = false, onValue = 1): DraftingToggle {
  return {
    variable,
    implemented,
    enabled: (sysvars) => number(sysvars, variable) !== 0,
    flip: (sysvars) => sysvars.set(variable, number(sysvars, variable) !== 0 ? 0 : onValue),
  };
}
function bit(variable: string, mask: number, implemented = false): DraftingToggle {
  return {
    variable,
    implemented,
    enabled: (sysvars) => (number(sysvars, variable) & mask) !== 0,
    flip: (sysvars) => sysvars.set(variable, number(sysvars, variable) ^ mask),
  };
}
/** A bit that suppresses the setting when set (OSMODE 16384, 3DOSMODE 1). */
function suppressBit(variable: string, mask: number, implemented = false): DraftingToggle {
  return {
    variable,
    implemented,
    enabled: (sysvars) => {
      const value = number(sysvars, variable);
      return value > 0 && (value & mask) === 0;
    },
    flip: (sysvars) => {
      const value = number(sysvars, variable);
      // Turning on with no modes selected restores the default modes, as AutoCAD does.
      sysvars.set(variable, value === 0 || value === mask ? fallback(variable, 0) : value ^ mask);
    },
  };
}
/** A value whose sign switches the setting (DYNMODE, QPMODE, SELECTIONCYCLING). */
function sign(variable: string, implemented = false, onValue?: number): DraftingToggle {
  return {
    variable,
    implemented,
    enabled: (sysvars) => number(sysvars, variable) > 0,
    flip: (sysvars) => {
      const value = number(sysvars, variable);
      sysvars.set(variable, value === 0 ? (onValue ?? Math.abs(fallback(variable, 1))) : -value);
    },
  };
}

export const draftingToggles: Readonly<Record<ToggleId, DraftingToggle>> = {
  grid: onOff('GRIDMODE', true),
  ortho: onOff('ORTHOMODE', true),
  snap: onOff('SNAPMODE'),
  objectSnap: suppressBit('OSMODE', 16384, true),
  object3dSnap: suppressBit('3DOSMODE', 1),
  polar: bit('AUTOSNAP', 8),
  objectSnapTracking: bit('AUTOSNAP', 16),
  dynamicInput: sign('DYNMODE'),
  dynamicUcs: onOff('UCSDETECT'),
  isoplane: {
    variable: 'SNAPISOPAIR',
    implemented: false,
    enabled: () => true,
    flip: (sysvars) => sysvars.set('SNAPISOPAIR', (number(sysvars, 'SNAPISOPAIR') + 1) % 3),
  },
  selectionCycling: sign('SELECTIONCYCLING', false, 2),
  coordinates: {
    variable: 'COORDS',
    implemented: true,
    enabled: (sysvars) => number(sysvars, 'COORDS') !== 0,
    flip: (sysvars) => sysvars.set('COORDS', (number(sysvars, 'COORDS') + 1) % 3),
  },
  groups: bit('PICKSTYLE', 1),
  pickStyle: bit('PICKSTYLE', 1),
  inferConstraints: onOff('CONSTRAINTINFER'),
  quickProperties: sign('QPMODE'),
  tablet: onOff('TABMODE'),
  lineweight: onOff('LWDISPLAY', true),
};

/**
 * Flips a toggle. Ortho and polar tracking exclude each other in AutoCAD: turning one
 * on turns the other off. Returns the new state.
 */
export function flipToggle(sysvars: SystemVariables, id: ToggleId): boolean {
  const toggle = draftingToggles[id];
  toggle.flip(sysvars);
  const enabled = toggle.enabled(sysvars);
  if (enabled && id === 'ortho' && draftingToggles.polar.enabled(sysvars))
    draftingToggles.polar.flip(sysvars);
  if (enabled && id === 'polar' && draftingToggles.ortho.enabled(sysvars))
    draftingToggles.ortho.flip(sysvars);
  return enabled;
}
