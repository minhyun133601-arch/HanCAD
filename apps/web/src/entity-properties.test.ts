import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { draftCircle, draftLine, draftPolyline } from '@hancad/draft';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import { changeEntityProperty, entityProperties } from './entity-properties';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const state = createEmptyCadState();
  state.entities = [
    draftLine(state.settings, { x: 10, y: -20 }, { x: 40, y: -60 }, 'line'),
    draftCircle(state.settings, { x: 25, y: -40 }, 5, 'circle'),
    draftPolyline(
      state.settings,
      [
        { x: 0, y: 0 },
        { x: 20, y: -10 },
        { x: 40, y: 0 },
      ],
      false,
      false,
      'poly',
    ),
  ];
  return state;
}
describe('basic selected-object Properties', () => {
  it('reports WCS coordinates and edits geometry and common values immutably', () => {
    const state = fixture();
    const fields = entityProperties([state.entities[0]!]);
    expect(fields.find((field) => field.key === 'a.y')?.value).toBe('20');
    expect(fields.find((field) => field.key === 'length')).toMatchObject({
      value: '50',
      readOnly: true,
    });
    const next = changeEntityProperty(state, ['line'], 'a.y', '30');
    expect(next.entities[0]).toMatchObject({ a: { x: 10, y: -30 } });
    expect(state.entities[0]).toMatchObject({ a: { x: 10, y: -20 } });
    const resized = changeEntityProperty(next, ['circle'], 'radius', '12.5');
    expect(resized.entities[1]).toMatchObject({ radius: 12.5 });
    expect(changeEntityProperty(state, ['poly'], 'closed', 'true').entities[2]).toMatchObject({
      closed: true,
    });
  });
  it('shows only common fields for mixed selection and applies one common edit to all', () => {
    const state = fixture();
    expect(entityProperties(state.entities).find((field) => field.key === 'type')?.value).toBe(
      '*VARIES*',
    );
    expect(entityProperties(state.entities).some((field) => field.key === 'radius')).toBe(false);
    const next = changeEntityProperty(state, ['line', 'circle'], 'color', '#ff0000');
    expect(
      next.entities
        .slice(0, 2)
        .every((entity) => entity.color === '#ff0000' && entity.trueColor === 0xff0000),
    ).toBe(true);
    const bylayer = changeEntityProperty(next, ['line', 'circle'], 'color', 'ByLayer');
    expect(bylayer.entities[0]).toMatchObject({ aci: 256 });
    expect(bylayer.entities[0]?.trueColor).toBeUndefined();
  });
  it('rejects locked, invalid and degenerate edits before committing the snapshot', () => {
    const state = fixture();
    for (const [field, value] of [
      ['radius', '-1'],
      ['radius', 'NaN'],
      ['radius', '0'],
    ])
      expect(() => changeEntityProperty(state, ['circle'], field!, value!)).toThrow();
    expect(() => changeEntityProperty(state, ['line'], 'length', '90')).toThrow();
    expect(() => changeEntityProperty(state, ['line'], 'layer', 'missing')).toThrow();
    expect(() => changeEntityProperty(state, ['line'], 'lineweight', '999')).toThrow();
    expect(() => changeEntityProperty(state, ['line'], 'transparency', '91')).toThrow();
    state.layers[0]!.locked = true;
    expect(() => changeEntityProperty(state, ['line'], 'color', '#ff0000')).toThrow(/locked/);
  });
});
