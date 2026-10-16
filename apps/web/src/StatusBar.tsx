import { evaluateDiesel } from '@hancad/commands';
import { dieselHost } from './useMacroRunner';
import { getSystemVariableDefinition } from '@hancad/sysvars';
import type { SystemVariables } from '@hancad/sysvars';
import type { MessageKey, Messages } from '@hancad/ui';
import type { LayoutId } from './DrawingSurface';
import type { PlatformMode } from './platform';

export interface StatusToggle {
  implemented?: boolean;
  label: MessageKey;
  variable: string;
  key?: string;
  mask?: number;
  onValue?: number;
}
export const statusToggles: readonly StatusToggle[] = [
  { label: 'grid', variable: 'GRIDMODE', key: 'F7' },
  { label: 'snap', variable: 'SNAPMODE', key: 'F9', implemented: false },
  { label: 'ortho', variable: 'ORTHOMODE', key: 'F8' },
  { label: 'polar', variable: 'AUTOSNAP', key: 'F10', mask: 8, implemented: false },
  { label: 'objectSnap', variable: 'OSMODE', key: 'F3', mask: 16384 },
  { label: 'objectSnapTracking', variable: 'AUTOSNAP', key: 'F11', mask: 16, implemented: false },
  { label: 'dynamicInput', variable: 'DYNMODE', key: 'F12', onValue: 3, implemented: false },
  { label: 'lineweight', variable: 'LWDISPLAY' },
];

export function isToggleEnabled(sysvars: SystemVariables, toggle: StatusToggle): boolean {
  const value = sysvars.getNumber(toggle.variable);
  if (toggle.variable === 'OSMODE') return value > 0 && (value & 16384) === 0;
  return toggle.mask === undefined ? value > 0 : (value & toggle.mask) !== 0;
}

export function changeToggle(sysvars: SystemVariables, toggle: StatusToggle): boolean {
  const current = sysvars.getNumber(toggle.variable);
  const enabled = isToggleEnabled(sysvars, toggle);
  if (toggle.variable === 'OSMODE')
    sysvars.set(
      toggle.variable,
      current === 0 ? (getSystemVariableDefinition('OSMODE')?.default ?? 0) : current ^ 16384,
    );
  else if (toggle.variable === 'DYNMODE') sysvars.toggle(toggle.variable);
  else if (toggle.mask !== undefined) sysvars.set(toggle.variable, current ^ toggle.mask);
  else sysvars.set(toggle.variable, enabled ? 0 : (toggle.onValue ?? 1));
  return isToggleEnabled(sysvars, toggle);
}

/** MODEMACRO: user text on the status bar, evaluated as DIESEL on every update. */
function ModeMacro({ sysvars }: { sysvars: SystemVariables }) {
  let source = '';
  try {
    source = String(sysvars.get('MODEMACRO'));
  } catch {
    return null;
  }
  if (!source) return null;
  return (
    <span className="status-modemacro" data-testid="modemacro">
      {evaluateDiesel(source, dieselHost(sysvars))}
    </span>
  );
}

export function StatusBar({
  messages,
  layout,
  onLayout,
  sysvars,
  toggle,
  mode,
  execute,
}: {
  messages: Messages;
  layout: LayoutId;
  onLayout: (layout: LayoutId) => void;
  sysvars: SystemVariables;
  toggle: (toggle: StatusToggle) => void;
  mode: PlatformMode;
  execute: (command: string) => void;
}) {
  const layouts: readonly LayoutId[] = ['model', 'layoutOne', 'layoutTwo'];
  return (
    <footer className="status-bar" aria-label={messages.statusBar}>
      <div className="layout-tabs" role="tablist" aria-label={messages.layoutTabs}>
        {layouts.map((item) => (
          <button
            key={item}
            role="tab"
            aria-selected={layout === item}
            className={layout === item ? 'layout-tab active' : 'layout-tab'}
            onClick={() => onLayout(item)}
          >
            {messages[item]}
          </button>
        ))}
        <button
          className="add-layout"
          aria-label={messages.newLayout}
          title={messages.newLayout}
          onClick={() => execute('LAYOUT')}
        >
          +
        </button>
      </div>
      <ModeMacro sysvars={sysvars} />
      <div className="status-toggles" role="toolbar" aria-label={messages.statusBar}>
        {statusToggles.map((item) => (
          <button
            key={item.label}
            className="status-toggle"
            aria-pressed={item.implemented === false ? false : isToggleEnabled(sysvars, item)}
            disabled={item.implemented === false}
            aria-label={messages[item.label]}
            title={
              item.implemented === false
                ? `${messages[item.label]} · ${messages.draftingAidsPending}`
                : `${messages[item.label]}${item.key ? ` (${item.key})` : ''}`
            }
            onClick={() => toggle(item)}
          >
            {messages[item.label]}
          </button>
        ))}
      </div>
      <div className="status-units" title={messages.annotationScale}>
        1:1 <span>{messages.millimeters}</span>
      </div>
      <span
        className="platform-mode"
        title={mode === 'browser' ? messages.browserMode : messages.desktopMode}
      >
        {messages.offline}
      </span>
    </footer>
  );
}
