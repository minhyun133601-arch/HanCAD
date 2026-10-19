import { useEffect, useRef, useState } from 'react';
import type { CommandRegistry } from '@hancad/commands';
import type { SystemVariables } from '@hancad/sysvars';
import type { LegacyCadState } from '@hancad/legacy-bridge';
import { InputQueue } from '@hancad/editor';
import { PropertiesPalette } from './PropertiesPalette';
import { changeEntityProperty } from './entity-properties';
import { applyCurrentProperty, currentPropertyFields } from './properties-current';
import { isolatedObjectIds } from './object-isolation';
import { RolloverProperties } from './properties-rollover';
import { usePropertyCommands } from './usePropertyCommands';
import type { PropertyCommandOptions } from './usePropertyCommands';

interface Options extends PropertyCommandOptions {
  registry: CommandRegistry;
  sysvars: SystemVariables;
  getState: () => LegacyCadState;
  commitState: (label: string, state: LegacyCadState) => void;
  selectedIds: readonly string[];
  korean: boolean;
  execute?: (command: string) => void;
}
export function useProperties(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const [open, setOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [dismissed, setDismissed] = useState('');
  const commands = usePropertyCommands(options);
  const pointer = useRef({ x: 50, y: 120 });
  const [quickPosition, setQuickPosition] = useState(pointer.current);
  const [hovered, setHovered] = useState<{ id: string; screen: { x: number; y: number } } | null>(
    null,
  );
  const selectionKey = options.selectedIds.join('|');
  const hoverRequest = useRef<string | undefined>(undefined);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () =>
      options.sysvars.events.subscribe((event) => {
        if (
          event.name.startsWith('QP') ||
          [
            'PICKFIRST',
            'PICKADD',
            'ROLLOVERTIPS',
            'CLAYER',
            'CECOLOR',
            'CELTYPE',
            'CELTSCALE',
            'CELWEIGHT',
            'CETRANSPARENCY',
            'THICKNESS',
          ].includes(event.name)
        )
          setRevision((value) => value + 1);
      }),
    [options.sysvars],
  );
  useEffect(() => {
    const move = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);
  useEffect(() => {
    setQuickPosition(pointer.current);
  }, [selectionKey]);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
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
  const state = options.getPropertyState?.() ?? options.getState(),
    wanted = new Set(options.selectedIds),
    entities = state.entities.filter((entity) => wanted.has(entity.id));
  const autoQuick =
    options.sysvars.getNumber('QPMODE') > 0 &&
    options.sysvars.getNumber('PICKFIRST') === 1 &&
    entities.length > 0 &&
    dismissed !== selectionKey;
  // Retain a subscription render even when the selected array itself did not change.
  void revision;
  function apply(key: string, value: string, ids?: readonly string[]): void {
    const live = latest.current;
    if (!live.selectedIds.length) {
      applyCurrentProperty(live.sysvars, live.getPropertyState?.() ?? live.getState(), key, value);
      return;
    }
    (live.commitPropertyState ?? live.commitState)(
      'PROPERTIES',
      changeEntityProperty(
        live.getPropertyState?.() ?? live.getState(),
        ids ?? live.selectedIds,
        key,
        value,
      ),
    );
  }
  const currentProperties = currentPropertyFields(options.sysvars, state);
  const selectionTools = {
    plotStyleAvailable: options.sysvars.getNumber('PSTYLEMODE') === 0,
    execute:
      options.execute ??
      ((command: string) => {
        void options.registry.get(command)?.execute?.({
          database: options.sysvars.database,
          sysvars: options.sysvars,
          locale: options.korean ? 'ko-KR' : 'en-US',
          print: options.print ?? (() => {}),
          input: new InputQueue(),
        });
      }),
    pickAdd: options.sysvars.getNumber('PICKADD'),
    togglePickAdd: () =>
      options.sysvars.set('PICKADD', options.sysvars.getNumber('PICKADD') === 0 ? 2 : 0),
  };
  const hoverEntity = hovered && state.entities.find((entity) => entity.id === hovered.id);
  const panels = (
    <>
      {open && (
        <PropertiesPalette
          entities={entities}
          state={state}
          korean={options.korean}
          close={() => setOpen(false)}
          apply={apply}
          currentProperties={currentProperties}
          {...selectionTools}
        />
      )}
      {(quickOpen || autoQuick) && entities.length > 0 && (
        <PropertiesPalette
          entities={entities}
          state={state}
          korean={options.korean}
          quick
          apply={apply}
          {...(options.sysvars.getNumber('QPLOCATION') === 0
            ? {
                position: {
                  position: 'fixed',
                  right: 'auto',
                  left: Math.max(0, Math.min(quickPosition.x + 20, window.innerWidth - 280)),
                  top: Math.max(0, Math.min(quickPosition.y + 20, window.innerHeight - 240)),
                } as const,
              }
            : {})}
          close={() => {
            setQuickOpen(false);
            setDismissed(selectionKey);
          }}
        />
      )}
      {commands.panels}
      {hovered &&
        hoverEntity &&
        !commands.active &&
        options.sysvars.getNumber('ROLLOVERTIPS') !== 0 && (
          <RolloverProperties
            entity={hoverEntity}
            korean={options.korean}
            screen={hovered.screen}
          />
        )}
    </>
  );
  return {
    ...commands,
    panels,
    open,
    quickOpen: quickOpen || autoQuick,
    hiddenIds: isolatedObjectIds(state),
    hover: (id: string | undefined, screen: { x: number; y: number }) => {
      if (hoverRequest.current === id) return;
      hoverRequest.current = id;
      clearTimeout(hoverTimer.current);
      setHovered(null);
      if (id) hoverTimer.current = setTimeout(() => setHovered({ id, screen }), 500);
    },
  };
}
