import { useEffect, useRef, useState } from 'react';
import type { CommandRegistry } from '@hancad/commands';
import type { SystemVariables } from '@hancad/sysvars';
import type { LegacyCadState } from '@hancad/legacy-bridge';
import { PropertiesPalette } from './PropertiesPalette';
import { changeEntityProperty } from './entity-properties';

interface Options {
  registry: CommandRegistry;
  sysvars: SystemVariables;
  getState: () => LegacyCadState;
  commitState: (label: string, state: LegacyCadState) => void;
  selectedIds: readonly string[];
  korean: boolean;
}
export function useProperties(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const [open, setOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [dismissed, setDismissed] = useState('');
  const selectionKey = options.selectedIds.join('|');
  useEffect(
    () =>
      options.sysvars.events.subscribe((event) => {
        if (event.name.startsWith('QP') || event.name === 'PICKFIRST')
          setRevision((value) => value + 1);
      }),
    [options.sysvars],
  );
  useEffect(() => {
    for (const command of ['PROPERTIES', 'PROPERTIESCLOSE', 'QUICKPROPERTIES'] as const)
      options.registry.register({
        name: command,
        displayName: {
          'ko-KR': command === 'QUICKPROPERTIES' ? '빠른 특성' : '특성',
          'en-US': command === 'QUICKPROPERTIES' ? 'Quick Properties' : 'Properties',
        },
        description: {
          'ko-KR': '선택한 객체의 특성을 표시하고 편집합니다.',
          'en-US': 'Display and edit properties of the selected objects.',
        },
        execute: () => {
          if (command === 'PROPERTIES') setOpen(true);
          else if (command === 'PROPERTIESCLOSE') setOpen(false);
          else {
            setQuickOpen(true);
            setDismissed('');
          }
        },
      });
  }, [options.registry]);
  const state = options.getState(),
    wanted = new Set(options.selectedIds),
    entities = state.entities.filter((entity) => wanted.has(entity.id));
  const autoQuick =
    options.sysvars.getNumber('QPMODE') > 0 &&
    options.sysvars.getNumber('PICKFIRST') === 1 &&
    entities.length > 0 &&
    dismissed !== selectionKey;
  // Retain a subscription render even when the selected array itself did not change.
  void revision;
  function apply(key: string, value: string): void {
    const live = latest.current;
    live.commitState(
      'PROPERTIES',
      changeEntityProperty(live.getState(), live.selectedIds, key, value),
    );
  }
  const panels = (
    <>
      {open && (
        <PropertiesPalette
          entities={entities}
          state={state}
          korean={options.korean}
          close={() => setOpen(false)}
          apply={apply}
        />
      )}
      {(quickOpen || autoQuick) && entities.length > 0 && (
        <PropertiesPalette
          entities={entities}
          state={state}
          korean={options.korean}
          quick
          apply={apply}
          close={() => {
            setQuickOpen(false);
            setDismissed(selectionKey);
          }}
        />
      )}
    </>
  );
  return { panels, open, quickOpen: quickOpen || autoQuick };
}
