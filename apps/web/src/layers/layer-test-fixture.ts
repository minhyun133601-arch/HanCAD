import { DrawingDatabase } from '@hancad/db';
import { CommandRegistry } from '@hancad/commands';
import { SystemVariables } from '@hancad/sysvars';
import { createEmptyCadState, normalizeCadState } from '@hancad/legacy-bridge';
import { draftCircle, draftLine } from '@hancad/draft';
import { createLayers, changeLayerField } from './layer-model';
import { LayerController } from './layer-controller';
import type { LayerHost } from './layer-controller';
import { syncLayerRecords } from './layer-records';

export function fixture() {
  let state = createLayers(createEmptyCadState(), '벽체,치수,숨김');
  state.entities = [
    { ...draftLine(state.settings, { x: 0, y: 0 }, { x: 10, y: 0 }, 'line'), layer: '벽체' },
    { ...draftCircle(state.settings, { x: 10, y: -10 }, 5, 'circle'), layer: '치수' },
  ];
  state = changeLayerField(state, '숨김', 'visible', false);
  const database = new DrawingDatabase(),
    sysvars = new SystemVariables({ database });
  let selected: readonly string[] = [];
  const messages: string[] = [];
  const host: LayerHost = {
    registry: new CommandRegistry(),
    database,
    sysvars,
    korean: true,
    getState: () => state,
    commitState: (label, next, variables) => {
      database.transaction(label, (tx) => {
        syncLayerRecords(database, tx, next);
        for (const [name, value] of Object.entries(variables ?? {})) tx.setVariable(name, value);
        tx.setVariable('TEST_STATE', JSON.stringify(next));
      });
      state = normalizeCadState(next);
    },
    getSelectedIds: () => selected,
    selectIds: (ids) => {
      selected = [...new Set([...selected, ...ids])];
    },
    clearSelection: () => {
      selected = [];
    },
    print: (value) => messages.push(value),
  };
  database.events.subscribe((event) => {
    if (
      event.type === 'sysvar-changed' &&
      event.name === 'TEST_STATE' &&
      typeof event.value === 'string'
    )
      state = normalizeCadState(JSON.parse(event.value) as unknown);
  });
  host.commitState('INITIAL', state);
  database.clearHistory();
  const controller = new LayerController(
    () => host,
    () => {},
  );
  return {
    host,
    controller,
    state: () => state,
    select: (ids: readonly string[]) => {
      selected = ids;
    },
    messages,
  };
}
