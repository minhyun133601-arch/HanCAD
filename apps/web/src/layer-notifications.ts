import type { DrawingDatabase } from '@hancad/db';
import type { LegacyCadState } from '@hancad/legacy-bridge';
import { getSystemVariableDefinition } from '@hancad/sysvars';
import type { SystemVariables } from '@hancad/sysvars';

// Autodesk 2026: GUID-FCE244C3-F642-4EF5-912E-C099EFF9C050 (LAYERNOTIFY),
// GUID-42F44696-D045-4468-ADEB-E18AEFBA77BF (LAYEREVAL), and
// GUID-4EE593AE-BBD3-43B3-8F31-1896399A55E0 (LAYEREVALCTL).
export const layerNotificationMasks = {
  plot: 1,
  open: 2,
  xref: 4,
  restore: 8,
  save: 16,
  insert: 32,
} as const;
export type LayerNotificationEvent = keyof typeof layerNotificationMasks;
export const layerNotificationVariable = 'HANCAD_LAYER_NOTIFICATION';
type VariableReader = Pick<SystemVariables, 'getNumber'>;
const readers = new WeakMap<DrawingDatabase, VariableReader>();
const activated = new WeakSet<DrawingDatabase>();
export interface LayerNotification {
  serial: number;
  event: LayerNotificationEvent;
  layerNames: string[];
}

/** Register the current profile reader without changing drawing/history state. */
export function bindLayerNotificationVariables(variables: SystemVariables): void {
  readers.set(variables.database, variables);
}
function settings(database: DrawingDatabase): VariableReader {
  return (
    readers.get(database) ?? {
      getNumber: (name: string) => {
        const value = database.getVariable(name) ?? getSystemVariableDefinition(name)?.default;
        return typeof value === 'number' ? value : 0;
      },
    }
  );
}
function evaluatedLayer(name: string, variables: VariableReader): boolean {
  return (
    variables.getNumber('LAYEREVALCTL') !== 0 &&
    (variables.getNumber('LAYEREVAL') === 2 ||
      (variables.getNumber('LAYEREVAL') === 1 && name.includes('|')))
  );
}
export function unreconciledLayerNames(state: LegacyCadState, variables: VariableReader): string[] {
  return state.layers
    .filter((layer) => layer.unreconciled && evaluatedLayer(layer.name, variables))
    .map((layer) => layer.name);
}

/** Call only for actual additions, not renames. Evaluation never itself raises an alert. */
export function evaluateAddedLayers(
  previous: LegacyCadState,
  next: LegacyCadState,
  variables: VariableReader,
): LegacyCadState {
  const known = new Set(previous.layers.map((layer) => layer.name.toUpperCase()));
  return {
    ...next,
    layers: next.layers.map((layer) =>
      known.has(layer.name.toUpperCase())
        ? layer
        : {
            ...layer,
            unreconciled: evaluatedLayer(layer.name, variables),
          },
    ),
  };
}

export function layerNotificationForEvent(
  state: LegacyCadState,
  variables: VariableReader,
  event: LayerNotificationEvent,
): string[] {
  return (variables.getNumber('LAYERNOTIFY') & layerNotificationMasks[event]) !== 0
    ? unreconciledLayerNames(state, variables)
    : [];
}
function storedNotification(database: DrawingDatabase): LayerNotification | undefined {
  const value = database.getVariable(layerNotificationVariable);
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    typeof value.serial !== 'number' ||
    typeof value.event !== 'string' ||
    !(value.event in layerNotificationMasks) ||
    !Array.isArray(value.layerNames) ||
    !value.layerNames.every((name): name is string => typeof name === 'string')
  )
    return;
  return {
    serial: value.serial,
    event: value.event as LayerNotificationEvent,
    layerNames: value.layerNames,
  };
}

/** A lifecycle fact is published after its command completes and never adds an undo entry. */
export function recordLayerNotification(
  database: DrawingDatabase,
  state: LegacyCadState,
  event: LayerNotificationEvent,
): LayerNotification | undefined {
  const layerNames = layerNotificationForEvent(state, settings(database), event);
  if (!layerNames.length) {
    if (event === 'open') activated.delete(database);
    return;
  }
  const notification: LayerNotification = {
    event,
    layerNames,
    serial: (storedNotification(database)?.serial ?? 0) + 1,
  };
  activated.add(database);
  database.writeUntrackedVariable(layerNotificationVariable, { ...notification }, true);
  return notification;
}

/** Existing unreconciled rows are not a notification until a configured event fired. */
export function currentLayerNotification(
  database: DrawingDatabase,
  state: LegacyCadState,
): LayerNotification | undefined {
  if (!activated.has(database)) return;
  const notification = storedNotification(database);
  if (!notification) return;
  const eligible = new Set(
    layerNotificationForEvent(state, settings(database), notification.event).map((name) =>
      name.toUpperCase(),
    ),
  );
  const layerNames = notification.layerNames.filter((name) => eligible.has(name.toUpperCase()));
  return layerNames.length ? { ...notification, layerNames } : undefined;
}
