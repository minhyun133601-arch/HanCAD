import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { entityFields } from '@hancad/db';
import type { JsonObject } from '@hancad/db';
import { createTestRuntime } from '../../../../packages/legacy-bridge/src/test-runtime';
import { nativePropertyState } from '../native-property-state';
import { LayerCopySession } from './layer-copy';
import { fixture } from './layer-test-fixture';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
function nativePreview(type: string, fields: JsonObject) {
  const f = fixture(),
    database = f.host.database;
  const model = database.find('BLOCK_RECORD', '*Model_Space')!;
  database.transaction('NATIVE', (tx) =>
    tx.add({ type, owner: model.handle, fields: entityFields({ layer: '벽체', ...fields }) }),
  );
  const entities = () => nativePropertyState(database, f.state()).entities;
  const source = entities().find((entity) => entity.sourceType === type);
  if (!source?.curve) throw new Error('Expected an exact native curve inquiry proxy.');
  const original = structuredClone(source);
  const host = { ...f.host, getPreviewEntities: entities };
  const copy = new LayerCopySession(
    () => host,
    () => {},
    () => {},
  );
  copy.begin([source.id], '치수');
  expect(copy.pick({ x: 0, y: 0 })).toBe(true);
  copy.cursor({ x: 20, y: -30 });
  return { f, copy, original, source };
}
it('COPYTOLAYER previews an exact native ellipse proxy without journaling it into the legacy drawing', () => {
  const { f, copy, source, original } = nativePreview('ELLIPSE', {
    center: [10, 20, 5],
    majorAxis: [8, 0, 0],
    ratio: 0.5,
    startParameter: 0,
    endParameter: Math.PI * 2,
  });
  expect(f.state().entities.some((entity) => entity.id === source.id)).toBe(false);
  expect(copy.preview).toHaveLength(1);
  expect(copy.preview[0]).toMatchObject({
    id: source.id,
    sourceType: 'ELLIPSE',
    layer: '치수',
    points: [],
    curve: {
      type: 'ELLIPSE',
      center: { x: 30, y: 50, z: 5 },
      majorAxis: { x: 8, y: 0, z: 0 },
      minorAxis: { x: 0, y: 4, z: 0 },
    },
  });
  expect(source).toEqual(original);
  expect(f.host.database.find('ELLIPSE')?.fields.center).toEqual([10, 20, 5]);
});
it('COPYTOLAYER retains exact native spline knots and weights while moving its preview control points', () => {
  const { copy, source, original } = nativePreview('SPLINE', {
    degree: 2,
    flags: 0,
    knots: [0, 0, 0, 1, 1, 1],
    weights: [1, 0.75, 1],
    controlPoints: [
      [1, 2, 3],
      [5, 7, 3],
      [10, 2, 3],
    ],
  });
  expect(copy.preview[0]).toMatchObject({
    id: source.id,
    sourceType: 'SPLINE',
    layer: '치수',
    points: [],
    curve: {
      type: 'SPLINE',
      degree: 2,
      knots: [0, 0, 0, 1, 1, 1],
      weights: [1, 0.75, 1],
      controlPoints: [
        { x: 21, y: 32, z: 3 },
        { x: 25, y: 37, z: 3 },
        { x: 30, y: 32, z: 3 },
      ],
    },
  });
  expect(source).toEqual(original);
});
