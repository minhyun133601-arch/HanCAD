import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingDatabase } from '@hancad/db';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { SystemVariables } from '@hancad/sysvars';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import {
  bindLayerNotificationVariables,
  currentLayerNotification,
  evaluateAddedLayers,
  layerNotificationForEvent,
  layerNotificationMasks,
  layerNotificationVariable,
  recordLayerNotification,
  unreconciledLayerNames,
} from './layer-notifications';
import type { LayerNotificationEvent } from './layer-notifications';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const variables = new SystemVariables(),
    state = createEmptyCadState();
  variables.set('LAYEREVAL', 2);
  variables.set('LAYERNOTIFY', 63);
  state.layers.push(
    ...['Local', 'Ref|New'].map((name) => ({
      name,
      color: '#ffffff',
      locked: false,
      visible: true,
      unreconciled: true,
    })),
  );
  bindLayerNotificationVariables(variables);
  return { state, variables, database: variables.database };
}
describe('new-layer notification lifecycle', () => {
  it('implements each Autodesk event bit independently and combined masks', () => {
    const { state, variables } = fixture();
    const events = Object.keys(layerNotificationMasks) as LayerNotificationEvent[];
    for (const wanted of events) {
      variables.set('LAYERNOTIFY', layerNotificationMasks[wanted]);
      for (const event of events)
        expect(layerNotificationForEvent(state, variables, event)).toEqual(
          event === wanted ? ['Local', 'Ref|New'] : [],
        );
    }
    variables.set('LAYERNOTIFY', 18);
    expect(layerNotificationForEvent(state, variables, 'open')).toHaveLength(2);
    expect(layerNotificationForEvent(state, variables, 'save')).toHaveLength(2);
    expect(layerNotificationForEvent(state, variables, 'plot')).toEqual([]);
  });
  it('applies LAYEREVAL xref/all eligibility and the profile global-off override', () => {
    const { state, variables, database } = fixture();
    variables.set('LAYEREVAL', 1);
    expect(unreconciledLayerNames(state, variables)).toEqual(['Ref|New']);
    variables.set('LAYEREVALCTL', 0);
    expect(recordLayerNotification(database, state, 'save')).toBeUndefined();
    variables.set('LAYEREVALCTL', 1);
    expect(recordLayerNotification(database, state, 'save')?.layerNames).toEqual(['Ref|New']);
    variables.set('LAYEREVAL', 0);
    expect(currentLayerNotification(database, state)).toBeUndefined();
  });
  it('evaluates actual new local/xref layers without flagging the baseline or raising an alert', () => {
    const { state, variables, database } = fixture(),
      baseline = createEmptyCadState();
    variables.set('LAYEREVAL', 1);
    const xrefOnly = evaluateAddedLayers(baseline, state, variables);
    expect(xrefOnly.layers.find((layer) => layer.name === 'Local')?.unreconciled).toBe(false);
    expect(xrefOnly.layers.find((layer) => layer.name === 'Ref|New')?.unreconciled).toBe(true);
    expect(xrefOnly.layers[0]).toEqual(baseline.layers[0]);
    variables.set('LAYEREVAL', 2);
    expect(evaluateAddedLayers(baseline, state, variables).layers[1]?.unreconciled).toBe(true);
    expect(currentLayerNotification(database, state)).toBeUndefined();
    expect(database.getVariable(layerNotificationVariable)).toBeUndefined();
  });
  it('records only configured events without adding undo and removes reconciled/deleted names from the notice', () => {
    const { state, variables, database } = fixture();
    variables.set('LAYERNOTIFY', 16);
    const undoCount = database.undoCount;
    expect(recordLayerNotification(database, state, 'open')).toBeUndefined();
    expect(database.getVariable(layerNotificationVariable)).toBeUndefined();
    const observed: string[] = [];
    database.events.subscribe((event) => {
      if (event.type === 'sysvar-changed') observed.push(event.name);
    });
    expect(recordLayerNotification(database, state, 'save')).toMatchObject({
      serial: 1,
      event: 'save',
      layerNames: ['Local', 'Ref|New'],
    });
    expect(database.undoCount).toBe(undoCount);
    expect(observed).toEqual([layerNotificationVariable]);
    const changed = {
      ...state,
      layers: state.layers
        .filter((layer) => layer.name !== 'Ref|New')
        .map((layer) => ({ ...layer, unreconciled: false })),
    };
    changed.layers.push({
      name: 'Later',
      color: '#ffffff',
      visible: true,
      locked: false,
      unreconciled: true,
    });
    expect(currentLayerNotification(database, changed)).toBeUndefined();
    expect(recordLayerNotification(database, changed, 'save')).toMatchObject({
      serial: 2,
      layerNames: ['Later'],
    });
  });
  it('does not replay an earlier saved alert merely because the reopened drawing has an enabled non-Open bit', () => {
    const { state, variables, database } = fixture();
    variables.set('LAYERNOTIFY', 16);
    recordLayerNotification(database, state, 'save');
    const reopened = new DrawingDatabase(database.snapshot());
    bindLayerNotificationVariables(
      new SystemVariables({ database: reopened, profile: variables.profile }),
    );
    expect(currentLayerNotification(reopened, state)).toBeUndefined();
    expect(recordLayerNotification(reopened, state, 'open')).toBeUndefined();
    expect(currentLayerNotification(reopened, state)).toBeUndefined();
  });
});
