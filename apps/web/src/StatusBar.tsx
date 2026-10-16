import { evaluateDiesel } from '@hancad/commands';
import { dieselHost } from './useMacroRunner';
import type { ToggleId } from '@hancad/input';
import { draftingToggles } from './drafting-toggles';
import type { SystemVariables } from '@hancad/sysvars';
import type { MessageKey, Messages } from '@hancad/ui';
import type { LayoutId } from './DrawingSurface';
import type { PlatformMode } from './platform';

export interface StatusToggle {
  label: MessageKey;
  toggle: ToggleId;
  key?: string;
}
export const statusToggles: readonly StatusToggle[] = [
  { label: 'grid', toggle: 'grid', key: 'F7' },
  { label: 'snap', toggle: 'snap', key: 'F9' },
  { label: 'ortho', toggle: 'ortho', key: 'F8' },
  { label: 'polar', toggle: 'polar', key: 'F10' },
  { label: 'objectSnap', toggle: 'objectSnap', key: 'F3' },
  { label: 'objectSnapTracking', toggle: 'objectSnapTracking', key: 'F11' },
  { label: 'dynamicInput', toggle: 'dynamicInput', key: 'F12' },
  { label: 'lineweight', toggle: 'lineweight' },
];

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
  pendingNote,
  mode,
  execute,
}: {
  messages: Messages;
  layout: LayoutId;
  onLayout: (layout: LayoutId) => void;
  sysvars: SystemVariables;
  toggle: (toggle: ToggleId) => void;
  /** Tooltip suffix for toggles whose behavior is not implemented yet. */
  pendingNote: string;
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
            aria-pressed={draftingToggles[item.toggle].enabled(sysvars)}
            aria-label={messages[item.label]}
            title={`${messages[item.label]}${item.key ? ` (${item.key})` : ''}${
              draftingToggles[item.toggle].implemented ? '' : ` · ${pendingNote}`
            }`}
            onClick={() => toggle(item.toggle)}
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
