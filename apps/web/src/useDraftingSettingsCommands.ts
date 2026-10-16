import { useEffect, useRef, useState } from 'react';
import { osnapCommand } from '@hancad/commands';
import type { CommandRegistry } from '@hancad/commands';
import type { Locale } from '@hancad/ui';
import type { DraftingTab } from './drafting-settings-fields';

/** OSNAP opens its tab; the hyphen form keeps the command-line prompt sequence. */
export function useDraftingSettingsCommands(registry: CommandRegistry, locale: Locale) {
  const [tab, setTab] = useState<DraftingTab | null>(null);
  const previous = useRef<DraftingTab>('snap');
  useEffect(() => {
    registry.register({
      name: 'DSETTINGS',
      displayName: { 'ko-KR': '', 'en-US': '' },
      description: { 'ko-KR': '', 'en-US': '' },
      execute: () => setTab(previous.current),
    });
    registry.register(
      osnapCommand(() => {
        previous.current = 'osnap';
        setTab('osnap');
      }),
    );
  }, [registry, locale]);
  return { tab, close: () => setTab(null) };
}
