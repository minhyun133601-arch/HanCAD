import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { decodeDxfFields, editDxfFields, entityFields, getDxfObjectSchema } from '@hancad/db';
import type { DatabaseObject, JsonObject } from '@hancad/db';
import { evaluateGeometry, geometryFromFields } from '@hancad/geom';
import type { CurveGeometry } from '@hancad/geom';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { SystemVariables } from '@hancad/sysvars';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import { translateNativeCopy } from './native-copy-geometry';
import { commitNativeLayerChange, patchNativeProperties } from './native-layer-change';
import { nativePropertyIds } from './native-property-state';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
function object(type: string, fields: JsonObject): DatabaseObject {
  const mapped = new Set(getDxfObjectSchema(type)?.fields.map((field) => field.name));
  const raw = Object.fromEntries(
    Object.entries(fields).filter(
      ([key, value]) => mapped.has(key) && !(key === 'plotStyle' && value === 'ByLayer'),
    ),
  );
  return {
    type,
    handle: 'A',
    owner: null,
    erased: false,
    fields,
    groups: editDxfFields(type, [], raw),
    reactors: [],
    extensionDictionary: null,
    xdata: { APP: [{ code: 1000, value: 'retained' }] },
  };
}
function curve(item: DatabaseObject, children: readonly DatabaseObject[] = []): CurveGeometry {
  const fields = { ...decodeDxfFields(item.type, item.groups), ...item.fields };
  if (item.type === 'POLYLINE' && fields.vertices === undefined)
    fields.vertices = children
      .filter((child) => child.type === 'VERTEX')
      .map((child) => ({ ...decodeDxfFields(child.type, child.groups), ...child.fields }));
  const parsed = geometryFromFields(item.type, fields);
  if (parsed.status !== 'ok') throw new Error(JSON.stringify(parsed));
  return parsed.geometry;
}
function displaced(a: CurveGeometry, b: CurveGeometry): void {
  for (const t of [0, 0.13, 0.5, 0.91, 1]) {
    const first = evaluateGeometry(a, t),
      second = evaluateGeometry(b, t);
    expect(second.x).toBeCloseTo(first.x + 5, 8);
    expect(second.y).toBeCloseTo(first.y + 3, 8);
    expect(second.z).toBeCloseTo(first.z + 2, 8);
  }
}
const delta = { x: 5, y: -3, z: 2 };
it('translates elevated OCS LWPOLYLINE bulges/widths while retaining raw vendor data and source identity', () => {
  const source = object(
    'LWPOLYLINE',
    entityFields({
      flags: 1,
      elevation: 7,
      extrusion: [0, 0, -1],
      vertices: [
        { position: [0, 0], bulge: 0.5, startWidth: 2, endWidth: 4, id: 6, vendor: 'kept' },
        { position: [10, 0], bulge: 0, id: 7 },
      ],
    }),
  );
  source.groups.push({ code: 999, value: 'vendor-tail' });
  const before = structuredClone(source);
  const copy = translateNativeCopy(source, delta, [], patchNativeProperties);
  displaced(curve(source), curve(copy.object));
  expect(copy.object.fields.vertices).toMatchObject([
    { position: [-5, 3], bulge: 0.5, startWidth: 2, endWidth: 4, id: 6, vendor: 'kept' },
    { position: [5, 3], id: 7 },
  ]);
  expect(copy.object.fields.elevation).toBe(5);
  expect(copy.object.groups.filter((group) => group.code === 999)).toEqual([
    { code: 999, value: 'vendor-tail' },
  ]);
  expect(copy.object.xdata).toEqual(source.xdata);
  expect(copy.object.handle).toBe(source.handle);
  expect(source).toEqual(before);
});
it.each([false, true])(
  'translates rational/control or fit-only SPLINE without changing its representation (fit=%s)',
  (fit) => {
    const fields: JsonObject = fit
      ? {
          degree: 3,
          fitPoints: [
            [0, 0, 0],
            [4, 3, 1],
            [10, 0, 2],
          ],
          fitTolerance: 0.01,
        }
      : {
          degree: 2,
          knots: [0, 0, 0, 1, 1, 1],
          weights: [1, 0.5, 1],
          controlPoints: [
            [0, 0, 1],
            [5, 10, 2],
            [10, 0, 3],
          ],
          startTangent: [1, 2, 3],
          endTangent: [-1, 2, 3],
        };
    const source = object('SPLINE', entityFields(fields));
    source.groups.push({ code: 999, value: 'spline-vendor' });
    const copy = translateNativeCopy(source, delta, [], patchNativeProperties).object;
    displaced(curve(source), curve(copy));
    const original = { ...decodeDxfFields(source.type, source.groups), ...source.fields };
    for (const name of ['knots', 'weights', 'degree', 'startTangent', 'endTangent', 'fitTolerance'])
      expect(copy.fields[name]).toEqual(original[name]);
    expect(copy.fields.controlPoints === undefined).toBe(fit);
    expect(copy.groups.filter((group) => group.code === 999)).toEqual(
      source.groups.filter((group) => group.code === 999),
    );
  },
);
it.each([0, 8])(
  'clones owned POLYLINE VERTEX/SEQEND graphs with translated points and fresh stable handles (flags=%s)',
  (flags) => {
    const vars = new SystemVariables(),
      db = vars.database,
      state = createEmptyCadState();
    state.layers.push({ name: 'TARGET', color: '#00ff00', visible: true, locked: false });
    const original = db.transaction('fixture', (tx) => {
      const parent = tx.add({
        type: 'POLYLINE',
        owner: db.find('BLOCK_RECORD', '*Model_Space')!.handle,
        fields: entityFields({
          flags,
          position: [0, 0, 8],
          extrusion: [0, 1, 1],
          startWidth: 2,
          endWidth: 4,
        }),
      });
      for (const [i, position] of [
        [0, [0, 0, 0]],
        [1, [10, 0, 2]],
        [2, [10, 10, 3]],
      ] as const) {
        const f = {
          position: [...position],
          bulge: flags ? 0 : i === 0 ? 0.5 : 0,
          startWidth: i === 0 ? 0 : 2,
          id: i,
        };
        tx.add({
          type: 'VERTEX',
          owner: parent.handle,
          fields: f,
          groups: [
            ...editDxfFields('VERTEX', [], f),
            { code: 330, value: parent.handle },
            { code: 999, value: `v${i}` },
          ],
          xdata: { APP: [{ code: 1005, value: parent.handle }] },
        });
      }
      tx.add({
        type: 'SEQEND',
        owner: parent.handle,
        groups: [{ code: 330, value: parent.handle }],
      });
      return parent;
    });
    const beforeObjects = db.all(),
      originalChildren = beforeObjects.filter((o) => o.owner === original.handle),
      before = db.serialize();
    const id = nativePropertyIds(db, state).get(original.handle)!;
    db.clearHistory();
    commitNativeLayerChange(
      vars,
      'COPYTOLAYER',
      state,
      state,
      {},
      { kind: 'copy', ids: [id], target: 'TARGET', delta },
      (label, next) => db.transaction(label, (tx) => tx.setVariable('view', JSON.stringify(next))),
    );
    const copy = db.all().find((o) => o.type === 'POLYLINE' && o.handle !== original.handle)!;
    const copiedChildren = db.all().filter((o) => o.owner === copy.handle);
    displaced(curve(original, originalChildren), curve(copy, copiedChildren));
    expect(copy.fields.layer).toBe('TARGET');
    expect(copiedChildren).toHaveLength(4);
    expect(
      copiedChildren.map((o) => o.handle).some((h) => originalChildren.some((o) => o.handle === h)),
    ).toBe(false);
    for (const child of copiedChildren)
      expect(child.groups.find((g) => g.code === 330)?.value).toBe(copy.handle);
    for (const child of copiedChildren.filter((o) => o.type === 'VERTEX')) {
      expect(child.xdata.APP?.[0]?.value).toBe(copy.handle);
      expect(child.groups.some((g) => g.code === 999)).toBe(true);
    }
    expect(db.get(original.handle)).toEqual(original);
    expect(db.undoCount).toBe(1);
    const after = db.serialize();
    db.undo();
    expect(db.serialize()).toBe(before);
    db.redo();
    expect(db.serialize()).toBe(after);
    vars.dispose();
  },
);
it('translates inline 3D polyline vertices, rays, xlines and canonical helix positions', () => {
  const sources = [
    object('POLYLINE', {
      flags: 8,
      vertices: [{ position: [0, 0, 1] }, { position: [10, 20, 30] }],
    }),
    object('RAY', { basePoint: [2, 3, 4], direction: [1, 2, 0] }),
    object('XLINE', { basePoint: [2, 3, 4], direction: [1, 0, 1] }),
    object('HELIX', { center: [0, 0, 0], baseRadius: 5, topRadius: 3, turns: 2, height: 10 }),
  ];
  for (const source of sources) {
    const copy = translateNativeCopy(source, delta, [], patchNativeProperties).object;
    displaced(curve(source), curve(copy));
  }
});
it('translates HELIX spline/axis positions while retaining vectors and application-owned raw records', () => {
  const source = object('HELIX', {
    center: [0, 0, 0],
    baseRadius: 5,
    topRadius: 3,
    turns: 2,
    height: 10,
  });
  source.groups = [
    { code: 100, value: 'AcDbSpline' },
    { code: 10, value: 1 },
    { code: 20, value: 2 },
    { code: 30, value: 3 },
    { code: 11, value: 4 },
    { code: 21, value: 5 },
    { code: 31, value: 6 },
    { code: 12, value: 7 },
    { code: 100, value: 'AcDbHelix' },
    { code: 10, value: 0 },
    { code: 20, value: 0 },
    { code: 30, value: 0 },
    { code: 11, value: 5 },
    { code: 21, value: 0 },
    { code: 31, value: 0 },
    { code: 12, value: 0 },
    { code: 22, value: 0 },
    { code: 32, value: 1 },
    { code: 102, value: '{VENDOR' },
    { code: 10, value: 99 },
    { code: 102, value: '}' },
    { code: 1001, value: 'APP' },
    { code: 1010, value: 42 },
  ];
  const copy = translateNativeCopy(source, delta, [], patchNativeProperties).object;
  displaced(curve(source), curve(copy));
  expect(copy.groups.map((g) => g.value)).toEqual([
    'AcDbSpline',
    6,
    5,
    5,
    9,
    8,
    8,
    7,
    'AcDbHelix',
    5,
    3,
    2,
    10,
    3,
    2,
    0,
    0,
    1,
    '{VENDOR',
    99,
    '}',
    'APP',
    42,
  ]);
});
it('retains opaque INSERT/TEXT OCS displacement and updates only their raw coordinate fields', () => {
  for (const type of ['INSERT', 'TEXT']) {
    const source = object(type, {});
    source.groups = [
      { code: 100, value: 'AcDbEntity' },
      { code: 8, value: '0' },
      { code: 100, value: type === 'INSERT' ? 'AcDbBlockReference' : 'AcDbText' },
      { code: 10, value: 10 },
      { code: 20, value: 0 },
      { code: 30, value: 0 },
      { code: 210, value: 0 },
      { code: 220, value: 0 },
      { code: 230, value: -1 },
      { code: 999, value: 'retained' },
    ];
    const copy = translateNativeCopy(source, delta, [], patchNativeProperties).object;
    expect(copy.fields.insertionPoint).toEqual([5, 3, -2]);
    expect(copy.groups.find((g) => g.code === 10)?.value).toBe(5);
    expect(copy.groups.find((g) => g.code === 30)?.value).toBe(-2);
    expect(copy.groups.find((g) => g.code === 999)?.value).toBe('retained');
  }
});
it('rejects unsupported displaced opaque geometry before any graph changes', () => {
  const source = object('ACAD_PROXY_ENTITY', { raw: 'kept' }),
    before = structuredClone(source);
  expect(() => translateNativeCopy(source, delta, [], patchNativeProperties)).toThrow(
    /아직 지원하지/,
  );
  expect(source).toEqual(before);
});
