import { describe, expect, it } from 'vitest';
import { DrawingDatabase, entityFields } from '@hancad/db';
import { collectGeometry } from '../display/tessellate';
import { distanceToGeometry } from '../display/distance';
import { databaseObjectsToDisplay, databaseObjectToDisplay } from './database-source';

describe('native database display source', () => {
  it('maps DXF styles and persistent identities while preserving source fields', () => {
    const db = new DrawingDatabase();
    const object = db.transaction('LINE', (tx) =>
      tx.add({
        type: 'LINE',
        fields: entityFields({
          start: [2e8, 4.5e8, 12],
          end: [2e8 + 1, 4.5e8 + 2, 99],
          layer: 'walls',
          color: 3,
          trueColor: 0x123456,
          linetype: 'DASHED',
          lineweight: 50,
          linetypeScale: 2,
          transparency: 0x0200007f,
        }),
      }),
    );
    const before = structuredClone(object),
      result = databaseObjectToDisplay(object);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error(result.status);
    expect(result.entity).toMatchObject({
      id: object.handle,
      layer: 'walls',
      color: { kind: 'rgb', rgb: 0x123456 },
      transparency: 50,
      lineweight: 50,
      linetypeScale: 2,
      geometry: {
        type: 'line',
        start: { x: 2e8, y: 4.5e8 },
        end: { x: 2e8 + 1, y: 4.5e8 + 2 },
      },
    });
    expect(object).toEqual(before);
  });
  it('reads owned POLYLINE VERTEX records and propagates header widths/PLINEGEN', () => {
    const db = new DrawingDatabase();
    const polyline = db.transaction('PLINE', (tx) => {
      const parent = tx.add({
        type: 'POLYLINE',
        fields: entityFields({ flags: 128, startWidth: 2, endWidth: 4 }),
      });
      tx.add({ type: 'VERTEX', owner: parent.handle, fields: { position: [0, 0] } });
      tx.add({ type: 'VERTEX', owner: parent.handle, fields: { position: [10, 0] } });
      return parent;
    });
    const result = databaseObjectToDisplay(polyline, db.all());
    if (result.status !== 'ok' || result.entity.geometry.type !== 'polyline')
      throw new Error(result.status);
    expect(result.entity.plinegen).toBe(true);
    expect(Array.from(result.entity.geometry.vertices)).toEqual([0, 0, 0, 2, 4, 10, 0, 0, 2, 4]);
    expect(collectGeometry(result.entity.geometry, { tolerance: 0.01 }).triangles).toHaveLength(2);
  });
  it('preserves oblique geometry and normal orientation, with numerical projected picks and width interiors', () => {
    const db = new DrawingDatabase();
    const objects = db.transaction('curves', (tx) => [
      tx.add({
        type: 'ARC',
        fields: entityFields({
          center: [0, 0],
          radius: 10,
          startAngle: 0,
          endAngle: 90,
          extrusion: [0, 0, -1],
        }),
      }),
      tx.add({
        type: 'LWPOLYLINE',
        fields: entityFields({
          extrusion: [0, 1, 1],
          constantWidth: 4,
          vertices: [{ position: [0, 0] }, { position: [10, 0] }],
        }),
      }),
      tx.add({
        type: 'ELLIPSE',
        fields: entityFields({ center: [0, 0], majorAxis: [10, 0], ratio: 0.5 }),
      }),
    ]);
    const results = objects.map((object) => databaseObjectToDisplay(object));
    if (results.some((result) => result.status !== 'ok'))
      throw new Error('Expected valid geometry');
    const entities = databaseObjectsToDisplay(objects).entities;
    expect(entities[0]!.geometry).toMatchObject({
      type: 'arc',
      startAngle: Math.PI,
      sweepAngle: -Math.PI / 2,
    });
    expect(entities[1]!.geometry.type).toBe('curve');
    expect(distanceToGeometry(entities[1]!.geometry, { x: -5, y: 1 })).toBe(0);
    expect(distanceToGeometry(entities[1]!.geometry, { x: -5, y: 3 })).toBeCloseTo(
      3 - Math.SQRT2,
      6,
    );
    expect(distanceToGeometry(entities[2]!.geometry, { x: 0, y: 6 })).toBeCloseTo(1, 6);
  });
  it('reports hidden, malformed and opaque records explicitly', () => {
    const db = new DrawingDatabase();
    const objects = db.transaction('records', (tx) => [
      tx.add({ type: 'LINE', erased: true }),
      tx.add({ type: 'LINE', fields: { start: [0, 0] } }),
      tx.add({ type: 'DIMENSION' }),
    ]);
    expect(objects.map((object) => databaseObjectToDisplay(object).status)).toEqual([
      'hidden',
      'invalid',
      'unsupported',
    ]);
    expect(databaseObjectsToDisplay(objects).diagnostics).toHaveLength(2);
  });
});
