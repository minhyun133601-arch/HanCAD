import { expect, it } from 'vitest';
import { DrawingDatabase, entityFields } from '@hancad/db';
import type { DatabaseObject, DxfGroup, NewDatabaseObject } from '@hancad/db';
import { querySnapCandidates, SnapIndex } from '@hancad/draft';
import { nativeSnapSources } from './native-snap-sources';

function drawing(objects: NewDatabaseObject[]): {
  database: DrawingDatabase;
  added: DatabaseObject[];
} {
  const database = new DrawingDatabase(),
    added: DatabaseObject[] = [];
  database.transaction('fixture', (transaction) => {
    for (const object of objects)
      added.push(
        transaction.add({
          owner: database.find('BLOCK_RECORD', '*Model_Space')!.handle,
          ...object,
        }),
      );
  });
  return { database, added };
}
it('retains native ellipse, rational spline, bulge and elevated node snap geometry', () => {
  const { database } = drawing([
    {
      type: 'ELLIPSE',
      fields: entityFields({ center: [0, 0, 0], majorAxis: [10, 10, 0], ratio: 0.5 }),
    },
    {
      type: 'SPLINE',
      fields: entityFields({
        degree: 2,
        knots: [0, 0, 0, 1, 1, 1],
        controlPoints: [
          [0, 0, 0],
          [5, 10, 0],
          [10, 0, 0],
        ],
        weights: [1, 2, 1],
      }),
    },
    {
      type: 'LWPOLYLINE',
      fields: entityFields({
        vertices: [{ position: [-10, 0, 0], bulge: 1 }, { position: [10, 0, 0] }],
      }),
    },
    { type: 'POINT', fields: entityFields({ position: [20, 30, 4] }) },
  ]);
  const sources = nativeSnapSources(database.all());
  expect(sources.map((source) => source.geometry.type)).toEqual([
    'ELLIPSE',
    'SPLINE',
    'LWPOLYLINE',
    'POINT',
  ]);
  expect(querySnapCandidates(new SnapIndex(sources), { x: 20, y: -30 }, 1, 8)[0]?.point).toEqual({
    x: 20,
    y: -30,
    z: 4,
  });
  expect(querySnapCandidates(new SnapIndex(sources), { x: 10, y: -10 }, 1, 16)[0]?.point).toEqual({
    x: 10,
    y: -10,
  });
  const weighted = sources[1]!.geometry;
  expect(weighted.type === 'SPLINE' && weighted.weights).toEqual([1, 2, 1]);
});
it('excludes erased, hidden and frozen layers while keeping locked layers snappable', () => {
  const { database } = drawing([
    { type: 'LAYER', name: 'Hidden', fields: { visible: false } },
    { type: 'LAYER', name: 'Frozen', fields: { flags: 1 } },
    { type: 'LAYER', name: 'Locked', fields: { flags: 4 } },
    { type: 'LINE', fields: entityFields({ start: [0, 0, 0], end: [10, 0, 0], layer: 'Hidden' }) },
    { type: 'LINE', fields: entityFields({ start: [0, 0, 0], end: [10, 0, 0], layer: 'Frozen' }) },
    { type: 'LINE', erased: true, fields: entityFields({ start: [0, 0, 0], end: [10, 0, 0] }) },
    { type: 'LINE', fields: entityFields({ start: [0, 0, 0], end: [10, 0, 0], layer: 'Locked' }) },
  ]);
  expect(nativeSnapSources(database.all())).toHaveLength(1);
});
it('resolves nested block transforms, base points and insertion without making text nodes', () => {
  const database = new DrawingDatabase();
  let insertHandle = '';
  database.transaction('blocks', (transaction) => {
    const block = transaction.add({ type: 'BLOCK_RECORD', name: 'Part' });
    transaction.add({ type: 'BLOCK', owner: block.handle, fields: { basePoint: [2, 0, 0] } });
    transaction.add({
      type: 'LINE',
      owner: block.handle,
      fields: entityFields({ start: [2, 0, 0], end: [12, 0, 0] }),
    });
    const insert = transaction.add({
      type: 'INSERT',
      owner: database.find('BLOCK_RECORD', '*Model_Space')!.handle,
      fields: entityFields({
        blockName: 'Part',
        insertionPoint: [100, 50, 0],
        rotation: 90,
        scaleX: 2,
        scaleY: 3,
      }),
    });
    insertHandle = insert.handle;
    transaction.add({
      type: 'TEXT',
      owner: database.find('BLOCK_RECORD', '*Model_Space')!.handle,
      fields: entityFields({ insertionPoint: [20, 30, 0] }),
    });
  });
  const sources = nativeSnapSources(database.all()),
    index = new SnapIndex(sources);
  expect(querySnapCandidates(index, { x: 100, y: -50 }, 0.1, 64)[0]?.entityId).toBe(insertHandle);
  const end = querySnapCandidates(index, { x: 100, y: -70 }, 0.1, 1)[0];
  expect(end?.point.x).toBeCloseTo(100, 8);
  expect(end?.point.y).toBeCloseTo(-70, 8);
  expect(end?.entityId).toBe(insertHandle);
  expect(querySnapCandidates(index, { x: 20, y: -30 }, 0.1, 8 | 512)).toEqual([]);
  expect(querySnapCandidates(index, { x: 20, y: -30 }, 0.1, 64)[0]?.kind).toBe('insertion');
});
it('uses OCS normals for INSERT/TEXT insertion and WCS for MTEXT', () => {
  const { database } = drawing([
    { type: 'TEXT', fields: entityFields({ insertionPoint: [10, 20, 30], extrusion: [0, 1, 0] }) },
    { type: 'MTEXT', fields: entityFields({ insertionPoint: [10, 20, 30], extrusion: [0, 1, 0] }) },
  ]);
  const sources = nativeSnapSources(database.all());
  expect(sources[0]?.insertion).toEqual({ x: -10, y: 30, z: 20 });
  expect(sources[1]?.insertion).toEqual({ x: 10, y: 20, z: 30 });
});
it('exposes dimension definition points and text origins as Node snaps', () => {
  const { database } = drawing([
    {
      type: 'DIMENSION',
      fields: entityFields({
        definitionPoint: [10, 20, 0],
        textMidpoint: [30, 40, 0],
        definitionPoint1: [0, 0, 0],
        definitionPoint2: [50, 0, 0],
      }),
    },
  ]);
  const index = new SnapIndex(nativeSnapSources(database.all()));
  expect(querySnapCandidates(index, { x: 10, y: -20 }, 1, 8)[0]?.kind).toBe('node');
  expect(querySnapCandidates(index, { x: 30, y: -40 }, 1, 8)[0]?.kind).toBe('node');
});
const groups = (values: readonly (readonly [number, number])[]): DxfGroup[] =>
  values.map(([code, value]) => ({ code, value }));
it('exposes native HATCH polyline boundaries only when OSOPTIONS permits them', () => {
  const { database } = drawing([
    {
      type: 'HATCH',
      groups: groups([
        [10, 0],
        [20, 0],
        [30, 2],
        [91, 1],
        [92, 2],
        [72, 0],
        [73, 1],
        [93, 4],
        [10, 0],
        [20, 0],
        [10, 10],
        [20, 0],
        [10, 10],
        [20, 10],
        [10, 0],
        [20, 10],
        [97, 0],
        [75, 0],
      ]),
    },
  ]);
  const sources = nativeSnapSources(database.all()),
    index = new SnapIndex(sources);
  expect(sources).toHaveLength(1);
  expect(sources[0]?.hatch).toBe(true);
  expect(querySnapCandidates(index, { x: 0, y: 0 }, 1, 1)).toEqual([]);
  expect(querySnapCandidates(index, { x: 0, y: 0 }, 1, 1, { osoptions: 0 })[0]?.point).toEqual({
    x: 0,
    y: -0,
    z: 2,
  });
});
it('preserves native HATCH line, circular, elliptical and spline edges for snapping', () => {
  const { database } = drawing([
    {
      type: 'HATCH',
      groups: groups([
        [91, 1],
        [92, 0],
        [93, 4],
        [72, 1],
        [10, 0],
        [20, 0],
        [11, 10],
        [21, 0],
        [72, 2],
        [10, 0],
        [20, 0],
        [40, 10],
        [50, 0],
        [51, 90],
        [73, 1],
        [72, 3],
        [10, 0],
        [20, 0],
        [11, 10],
        [21, 0],
        [40, 0.5],
        [50, 0],
        [51, 90],
        [73, 1],
        [72, 4],
        [94, 2],
        [73, 0],
        [74, 0],
        [95, 6],
        [96, 3],
        [40, 0],
        [40, 0],
        [40, 0],
        [40, 1],
        [40, 1],
        [40, 1],
        [10, 0],
        [20, 0],
        [10, 5],
        [20, 10],
        [10, 10],
        [20, 0],
        [97, 0],
        [97, 0],
        [75, 0],
      ]),
    },
  ]);
  expect(nativeSnapSources(database.all()).map((source) => source.geometry.type)).toEqual([
    'LINE',
    'ARC',
    'ELLIPSE',
    'SPLINE',
  ]);
});
