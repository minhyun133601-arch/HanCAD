import { useRef } from 'react';
import type { ToggleId } from '@hancad/input';
import type { SystemVariables } from '@hancad/sysvars';
import { getShortcutMessages } from '@hancad/ui';
import type { Locale } from '@hancad/ui';
import { draftingToggles, flipToggle } from './drafting-toggles';

/**
 * One path for F-keys, Ctrl shortcuts, ^B/^G/^O macros and status-bar buttons: flip
 * the toggle, echo "<그리드 켜기>" and, once per session, note when only the system
 * variable changes because the feature itself comes in a later phase.
 */
export function useDraftingToggle(options: {
  sysvars: SystemVariables;
  locale: Locale;
  print: (text: string) => void;
  failure: (error: unknown) => string;
  refresh: () => void;
  focus: () => void;
}) {
  const latest = useRef(options);
  latest.current = options;
  const noted = useRef(new Set<ToggleId>());
  return (id: ToggleId): void => {
    const live = latest.current;
    const text = getShortcutMessages(live.locale);
    try {
      const enabled = flipToggle(live.sysvars, id);
      const name = text.toggleNames[id];
      live.print(
        id === 'isoplane'
          ? (text.isoplane[live.sysvars.getNumber('SNAPISOPAIR')] ?? text.isoplane[0])
          : text.toggleState(name, enabled),
      );
      if (!draftingToggles[id].implemented && !noted.current.has(id)) {
        noted.current.add(id);
        live.print(text.featurePending(name));
      }
      live.refresh();
    } catch (error) {
      live.print(live.failure(error));
    }
    live.focus();
  };
}
