import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { draftCircle, draftLine } from '@hancad/draft';
import type { CadEntity } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import {
  defaultMatchSettings,
  matchEntityProperties,
  PropertyMatchSession,
} from './properties-match';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const state = createEmptyCadState();
  state.layers.push({ name: 'A', color: '#ffffff', visible: true, locked: false });
  state.layers.push({ name: 'LOCKED', color: '#ffffff', visible: true, locked: true });
  state.entities = [
    {
      ...draftLine(state.settings, { x: 0, y: 0 }, { x: 10, y: 0 }, 'source'),
      layer: 'A',
      aci: 256,
      linetype: 'DASHED',
      linetypeScale: 2,
      lineweight: 50,
      transparency: 25,
    },
    {
      ...draftCircle(state.settings, { x: 20, y: 0 }, 5, 'destination'),
      trueColor: 0xff0000,
      lineweight: 100,
    },
    {
      ...draftLine(state.settings, { x: 0, y: 0 }, { x: 5, y: 5 }, 'locked'),
      layer: 'LOCKED',
      aci: 3,
    },
  ];
  return state;
}
describe('MATCHPROP attribute transfer', () => {
  it('retains earlier destination changes when Settings or the selection changes later', () => {
    const state = fixture();
    state.entities.push({ ...draftCircle(state.settings, { x: 40, y: 0 }, 2, 'later'), aci: 3 });
    const session = new PropertyMatchSession(state, 'source');
    expect(session.accept(['destination'], defaultMatchSettings)).toBe(true);
    expect(session.accept(['destination'], { ...defaultMatchSettings, color: false })).toBe(false);
    session.accept(['later'], { ...defaultMatchSettings, color: false });
    expect(session.state.entities[1]).toMatchObject({ aci: 256 });
    expect(session.state.entities[3]).toMatchObject({ aci: 3, lineweight: 50 });
    expect(session.hasTargets).toBe(true);
    expect(state.entities[1]).toMatchObject({ trueColor: 0xff0000 });
  });
  it('copies supported special properties without text rotation/content or polyline elevation', () => {
    const state = fixture();
    const textBase = {
      ...state.settings,
      type: 'text' as const,
      textSize: 3,
      rotation: 0,
      point: { x: 0, y: 0 },
    };
    state.entities = [
      { ...textBase, id: 'source', text: 'Source', rotation: 1, textSize: 7, annotative: true },
      { ...textBase, id: 'target', text: 'Keep', rotation: 0.5, textSize: 4 },
    ];
    expect(matchEntityProperties(state, 'source', ['target']).entities[1]).toMatchObject({
      text: 'Keep',
      rotation: 0.5,
      textSize: 4,
      annotative: true,
    });
    const polyBase = {
      ...state.settings,
      type: 'polyline' as const,
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ],
      closed: false,
    };
    state.entities = [
      { ...polyBase, id: 'source', constantWidth: 5, elevation: 10, plinegen: true },
      { ...polyBase, id: 'target', constantWidth: 1, elevation: 3, startWidths: [1, 2] },
    ];
    const target = matchEntityProperties(state, 'source', ['target']).entities[1];
    expect(target).toMatchObject({ constantWidth: 5, elevation: 3, plinegen: true });
    expect((target as CadEntity & { startWidths?: number[] }).startWidths).toBeUndefined();
    Object.assign(state.entities[0]!, { startWidths: [1, 2] });
    expect(matchEntityProperties(state, 'source', ['target']).entities[1]).toMatchObject({
      constantWidth: 1,
      elevation: 3,
    });
  });
  it('matches raw inherited attributes, leaves geometry/source intact and skips locked destinations', () => {
    const state = fixture(),
      original = structuredClone(state);
    const next = matchEntityProperties(state, 'source', ['destination', 'locked', 'source']);
    expect(next.entities[1]).toMatchObject({
      type: 'circle',
      radius: 5,
      center: { x: 20, y: 0 },
      layer: 'A',
      aci: 256,
      linetype: 'DASHED',
      linetypeScale: 2,
      lineweight: 50,
      transparency: 25,
    });
    expect(next.entities[1]?.trueColor).toBeUndefined();
    expect(next.entities[0]).toEqual(original.entities[0]);
    expect(next.entities[2]).toEqual(original.entities[2]);
    expect(state).toEqual(original);
  });
  it('honors disabled settings and rejects a missing source without mutation', () => {
    const state = fixture();
    const next = matchEntityProperties(state, 'source', ['destination'], {
      ...defaultMatchSettings,
      color: false,
      layer: false,
    });
    expect(next.entities[1]).toMatchObject({ layer: '0', trueColor: 0xff0000, lineweight: 50 });
    expect(() => matchEntityProperties(state, 'missing', ['destination'])).toThrow(/Source/);
  });
});
