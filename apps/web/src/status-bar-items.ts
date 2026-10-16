import type { ToggleId } from '@hancad/input';
import type { Locale, Messages } from '@hancad/ui';
import { getShortcutMessages } from '@hancad/ui';

export interface StatusToggle {
  toggle: ToggleId;
  key?: string;
  defaultVisible?: boolean;
}

/** The status strip exposes every distinct drafting toggle in the shortcut table. */
export const statusToggles: readonly StatusToggle[] = [
  { toggle: 'grid', key: 'F7', defaultVisible: true },
  { toggle: 'snap', key: 'F9', defaultVisible: true },
  { toggle: 'inferConstraints' },
  { toggle: 'dynamicInput', key: 'F12', defaultVisible: true },
  { toggle: 'ortho', key: 'F8', defaultVisible: true },
  { toggle: 'polar', key: 'F10', defaultVisible: true },
  { toggle: 'isoplane', key: 'F5' },
  { toggle: 'objectSnapTracking', key: 'F11', defaultVisible: true },
  { toggle: 'objectSnap', key: 'F3', defaultVisible: true },
  { toggle: 'lineweight', defaultVisible: true },
  { toggle: 'selectionCycling', key: 'Ctrl+W' },
  { toggle: 'object3dSnap', key: 'F4' },
  { toggle: 'dynamicUcs', key: 'F6' },
  { toggle: 'groups', key: 'Ctrl+Shift+A' },
  { toggle: 'quickProperties', key: 'Ctrl+Shift+P' },
  { toggle: 'tablet', key: 'Ctrl+T' },
];

export function statusLabel(id: ToggleId, messages: Messages, locale: Locale): string {
  switch (id) {
    case 'grid':
      return messages.grid;
    case 'snap':
      return messages.snap;
    case 'ortho':
      return messages.ortho;
    case 'polar':
      return messages.polar;
    case 'objectSnap':
      return messages.objectSnap;
    case 'objectSnapTracking':
      return messages.objectSnapTracking;
    case 'dynamicInput':
      return messages.dynamicInput;
    case 'lineweight':
      return messages.lineweight;
    default:
      return getShortcutMessages(locale).toggleNames[id];
  }
}
