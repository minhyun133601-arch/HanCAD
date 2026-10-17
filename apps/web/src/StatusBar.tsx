import { evaluateDiesel } from '@hancad/commands';
import { useState } from 'react';
import { dieselHost } from './useMacroRunner';
import type { ToggleId } from '@hancad/input';
import { draftingToggles } from './drafting-toggles';
import type { SystemVariables } from '@hancad/sysvars';
import type { Locale, Messages } from '@hancad/ui';
import type { LayoutId } from './DrawingSurface';
import type { PlatformMode } from './platform';
import { ContextMenu, type MenuEntry } from './menus/ContextMenu';
import { StatusIcon } from './StatusIcon';
import { statusToggles, statusLabel } from './status-bar-items';
import { useStatusItems } from './status-bar-preferences';
import { coordinateMenu, statusSettings } from './status-bar-menus';
import { coordinateText, type StatusCoordinates } from './status-coordinates';
import type { DraftingTab } from './drafting-settings-fields';

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
  locale = 'ko-KR',
  coordinates,
  focusCommand,
  openDraftingSettings,
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
  locale?: Locale;
  coordinates?: StatusCoordinates;
  focusCommand?: () => void;
  openDraftingSettings?: (tab: DraftingTab) => void;
}) {
  const profile = useStatusItems();
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    label: string;
    items: MenuEntry[];
  } | null>(null);
  const korean = locale === 'ko-KR';
  const customizeLabel = korean ? '상태막대 사용자화' : 'Status bar customization';
  function openMenu(
    event: { clientX: number; clientY: number; preventDefault(): void; stopPropagation(): void },
    label: string,
    items: MenuEntry[],
  ): void {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, label, items });
  }
  function customize(): MenuEntry[] {
    return [
      {
        id: 'coordinates',
        label: korean ? '좌표' : 'Coordinates',
        checked: profile.visible.includes('coordinates'),
        onSelect: () => profile.toggle('coordinates'),
      },
      ...statusToggles.map((item) => ({
        id: item.toggle,
        label: statusLabel(item.toggle, messages, locale),
        checked: profile.visible.includes(item.toggle),
        onSelect: () => profile.toggle(item.toggle),
      })),
      {
        id: 'units',
        label: korean ? '단위' : 'Units',
        checked: profile.visible.includes('units'),
        onSelect: () => profile.toggle('units'),
      },
    ];
  }
  const layouts: readonly LayoutId[] = ['model', 'layoutOne', 'layoutTwo'];
  return (
    <footer
      className="status-bar"
      aria-label={messages.statusBar}
      onContextMenu={(event) => openMenu(event, customizeLabel, customize())}
    >
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
      {profile.visible.includes('coordinates') && (
        <button
          className="status-coordinates"
          aria-label={korean ? '좌표' : 'Coordinates'}
          data-testid="status-coordinates"
          data-coords-mode={sysvars.getNumber('COORDS')}
          title={`${korean ? '좌표' : 'Coordinates'} (Ctrl+I)`}
          onClick={() => toggle('coordinates')}
          onContextMenu={(event) =>
            openMenu(
              event,
              korean ? '좌표' : 'Coordinates',
              coordinateMenu(sysvars, locale, Boolean(coordinates?.base), execute),
            )
          }
        >
          {coordinateText(
            sysvars,
            coordinates ?? { cursor: { x: 0, y: 0 }, last: { x: 0, y: 0 } },
            locale,
          )}
        </button>
      )}
      <div className="status-toggles" role="toolbar" aria-label={messages.statusBar}>
        {statusToggles
          .filter((item) => profile.visible.includes(item.toggle))
          .map((item) => (
            <button
              key={item.toggle}
              className="status-toggle"
              aria-pressed={draftingToggles[item.toggle].enabled(sysvars)}
              aria-label={statusLabel(item.toggle, messages, locale)}
              title={`${statusLabel(item.toggle, messages, locale)}${item.key ? ` (${item.key})` : ''}${
                draftingToggles[item.toggle].implemented ? '' : ` · ${pendingNote}`
              }`}
              onClick={() => toggle(item.toggle)}
              onContextMenu={(event) =>
                openMenu(
                  event,
                  statusLabel(item.toggle, messages, locale),
                  statusSettings(
                    item.toggle,
                    sysvars,
                    locale,
                    () => toggle(item.toggle),
                    execute,
                    openDraftingSettings,
                  ),
                )
              }
            >
              <StatusIcon id={item.toggle} />
            </button>
          ))}
      </div>
      {profile.visible.includes('units') && (
        <div className="status-units" title={messages.annotationScale}>
          1:1 <span>{messages.millimeters}</span>
        </div>
      )}
      <span
        className="platform-mode"
        title={mode === 'browser' ? messages.browserMode : messages.desktopMode}
      >
        {messages.offline}
      </span>
      <button
        className="status-customize"
        aria-label={customizeLabel}
        title={customizeLabel}
        aria-haspopup="menu"
        aria-expanded={menu?.label === customizeLabel}
        onClick={(event) => openMenu(event, customizeLabel, customize())}
      >
        ☰
      </button>
      {menu && (
        <ContextMenu
          {...menu}
          onClose={() => {
            setMenu(null);
            focusCommand?.();
          }}
        />
      )}
    </footer>
  );
}
