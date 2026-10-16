import { useEffect, useState } from 'react';
import { inputSearchOptionsCommand } from '@hancad/commands';
import type { CommandRegistry, InputSearchOptions } from '@hancad/commands';
import type { SystemVariables } from '@hancad/sysvars';
import type { CommandLineMessages } from '@hancad/ui';
import type { MenuEntry } from '../menus/ContextMenu';
import { inputSearchStore } from './input-search-store';

/**
 * Profile-wide input search settings for one drawing's command line: registers
 * INPUTSEARCHOPTIONS, keeps learned AutoCorrect entries in the registry and builds
 * the "Input Settings" flyout of the customize and right-click menus.
 */
export function useInputSearch({
  registry,
  sysvars,
  text,
  runCommand,
}: {
  registry: CommandRegistry;
  sysvars: SystemVariables;
  text: CommandLineMessages;
  runCommand: (command: string) => void;
}) {
  const [store] = useState(inputSearchStore);
  const [options, setOptions] = useState(() => store.get());
  const [dialogOpen, setDialogOpen] = useState(false);
  useEffect(() => {
    const sync = (): void => {
      setOptions(store.get());
      registry.loadCorrections(store.autoCorrect.toPgp());
    };
    sync();
    return store.subscribe(sync);
  }, [registry, store]);
  useEffect(() => {
    registry.register(inputSearchOptionsCommand(store, () => setDialogOpen(true)));
  }, [registry, store]);

  const toggle = (key: keyof InputSearchOptions): void =>
    store.set({ ...store.get(), [key]: !store.get()[key] });
  const settings: readonly MenuEntry[] = [
    {
      id: 'auto-complete',
      label: text.autoComplete,
      checked: options.autoComplete,
      onSelect: () => toggle('autoComplete'),
    },
    {
      id: 'auto-correct',
      label: text.autoCorrect,
      checked: options.autoCorrect,
      onSelect: () => toggle('autoCorrect'),
    },
    {
      id: 'system-variables',
      label: text.searchSystemVariables,
      checked: options.systemVariables,
      onSelect: () => toggle('systemVariables'),
    },
    {
      id: 'content',
      label: text.searchContent,
      checked: options.content,
      onSelect: () => toggle('content'),
    },
    {
      id: 'mid-string',
      label: text.midStringSearch,
      checked: options.midString,
      disabled: !options.autoComplete,
      onSelect: () => toggle('midString'),
    },
    { id: 'delay', label: text.delayTime, onSelect: () => runCommand('INPUTSEARCHDELAY') },
  ];
  return {
    store,
    options,
    settings,
    dialogOpen,
    closeDialog: () => setDialogOpen(false),
    apply(next: InputSearchOptions, delay: number): void {
      store.set(next);
      if (sysvars.getNumber('INPUTSEARCHDELAY') !== delay) sysvars.set('INPUTSEARCHDELAY', delay);
    },
  };
}
