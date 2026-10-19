import { DrawingDatabase } from '@hancad/db';
import { InputCancelled } from '@hancad/editor';
import type { CommandInput, InputQueue } from '@hancad/editor';
import { SystemVariableProfile, SystemVariables } from '@hancad/sysvars';
import type { SysvarValue } from '@hancad/sysvars';
import type { LegacyCadState } from '@hancad/legacy-bridge';
import { LayerController } from './layer-controller';
import type { LayerHost, NativeLayerChange } from './layer-host';
import { liveLayerState } from './layer-host';
import { syncLayerRecords } from './layer-records';

interface PendingCommit {
  state: LegacyCadState;
  variables: Readonly<Record<string, SysvarValue>>;
  native?: NativeLayerChange;
}
function text(value: CommandInput): string {
  if (Array.isArray(value)) return value.join(',');
  if (typeof value === 'boolean') return value ? 'Y' : 'N';
  return String(value);
}
/** Replay the interactive controller in an isolated drawing, then publish one validated command. */
export function runQueuedLayerTool(
  command: string,
  host: LayerHost,
  input: InputQueue,
  print: (message: string) => void,
): void {
  const database = new DrawingDatabase(host.database.snapshot());
  const profile = new SystemVariableProfile();
  for (const [name, value] of host.sysvars.profile.values)
    profile.values.set(name, structuredClone(value));
  const sysvars = new SystemVariables({ database, profile });
  let state = structuredClone(liveLayerState(host)),
    selected: readonly string[] = [...host.getSelectedIds()];
  let pending: PendingCommit | undefined;
  const messages: string[] = [];
  function stageCommit(
    label: string,
    next: LegacyCadState,
    variables: Readonly<Record<string, SysvarValue>> = {},
    native?: NativeLayerChange,
  ): void {
    database.transaction(label, (tx) => {
      syncLayerRecords(database, tx, next);
      for (const [name, value] of Object.entries(variables)) tx.setVariable(name, value);
    });
    state = next;
    pending = { state: next, variables, ...(native ? { native } : {}) };
  }
  const queued: LayerHost = {
    ...host,
    database,
    sysvars,
    getState: () => state,
    getSelectedIds: () => selected,
    selectIds: (ids) => {
      selected = [...new Set([...selected, ...ids])];
    },
    clearSelection: () => {
      selected = [];
    },
    commitState: stageCommit,
    commitNativeLayerChange: (label, next, variables, native) =>
      stageCommit(label, next, variables, native),
    cancelOthers: () => {},
    print: (message) => messages.push(message),
  };
  const controller = new LayerController(
    () => queued,
    () => {},
  );
  function known(id: string): boolean {
    return (
      state.entities.some((entity) => entity.id === id) || host.getEntityLayer?.(id) !== undefined
    );
  }
  function allIds(): string[] {
    const layersById = new Map(state.entities.map((entity) => [entity.id, entity.layer]));
    const layersByName = new Map(state.layers.map((layer) => [layer.name, layer]));
    const hidden = new Set(state.objectIsolation?.hiddenIds ?? []);
    return [
      ...new Set([
        ...(host.getAllEntityIds?.() ?? []),
        ...state.entities.map((entity) => entity.id),
      ]),
    ].filter((id) => {
      const layerName = layersById.get(id) ?? host.getEntityLayer?.(id);
      const layer = layerName ? layersByName.get(layerName) : undefined;
      return layer?.visible !== false && !layer?.frozen && !hidden.has(id);
    });
  }
  try {
    controller.begin(command);
    while (controller.snapshot) {
      if (!input.remaining) throw new InputCancelled();
      const value = input.take();
      if (value === undefined) throw new InputCancelled();
      const active = controller.snapshot,
        count = messages.length;
      if (active.inputMode === 'selection') {
        if (typeof value !== 'string')
          throw new Error('객체 ID 또는 ALL이 필요합니다. / Expected entity ID or ALL.');
        const key = value.trim().replace(/^_/, '').toUpperCase();
        if (key === 'ALL') selected = allIds();
        else if (!key) {
          if (!selected.length) throw new InputCancelled();
          controller.submit('');
        } else if (known(value.trim())) selected = [...new Set([...selected, value.trim()])];
        else if (['N', 'NAME', 'S', 'SETTINGS'].includes(key)) controller.submit(value);
        else throw new Error(`알 수 없는 객체 ID: ${value} / Unknown entity ID.`);
      } else controller.submit(text(value));
      if (messages.length > count) throw new Error(messages.at(-1));
    }
    while (input.remaining) {
      const value = input.take();
      if (value !== '' && value !== undefined)
        throw new Error('명령 입력이 너무 많습니다. / Too many command inputs.');
    }
    if (pending) {
      if (pending.native && host.commitNativeLayerChange)
        host.commitNativeLayerChange(command, pending.state, pending.variables, pending.native);
      else host.commitState(command, pending.state, pending.variables);
    }
    for (const [name, value] of profile.values)
      if (JSON.stringify(host.sysvars.profile.values.get(name)) !== JSON.stringify(value))
        host.sysvars.set(name, value);
    for (const message of messages) print(message);
  } finally {
    sysvars.dispose();
  }
}
