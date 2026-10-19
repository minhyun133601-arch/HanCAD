import { describe, expect, it } from 'vitest';
import { DrawingDatabase, entityFields } from '@hancad/db';
import { databaseBlockDisplayEntities } from './blocks-source';
import type { BlockDisplayDiagnostic } from './blocks-source';
import { drawingStyleTables } from './style-tables';
import { resolveDisplayColor } from '../style/aci';

function fixture() {
  const db = new DrawingDatabase();
  const handles = db.transaction('nested fixture', (tx) => {
    tx.add({
      type: 'LAYER',
      owner: db.tables.LAYER,
      name: 'WALLS',
      fields: { color: 1, linetype: 'DASHED', lineweight: 50, transparency: 0x02000099 },
    });
    tx.add({
      type: 'LAYER',
      owner: db.tables.LAYER,
      name: 'DETAIL',
      fields: { color: 3, linetype: 'HIDDEN', lineweight: 70 },
    });
    const piece = tx.add({ type: 'BLOCK_RECORD', owner: db.tables.BLOCK_RECORD, name: 'piece' });
    tx.add({ type: 'BLOCK', owner: piece.handle, fields: { basePoint: [1, 1, 0] } });
    const line = tx.add({
      type: 'LINE',
      owner: piece.handle,
      fields: entityFields({
        start: [1, 1, 0],
        end: [3, 1, 0],
        color: 0,
        linetype: 'BYBLOCK',
        lineweight: -2,
        transparency: 0x01000000,
      }),
    });
    const outer = tx.add({ type: 'BLOCK_RECORD', owner: db.tables.BLOCK_RECORD, name: 'outer' });
    tx.add({ type: 'BLOCK', owner: outer.handle, fields: { basePoint: [0, 0, 0] } });
    const nested = tx.add({
      type: 'INSERT',
      owner: outer.handle,
      fields: entityFields({
        blockName: 'piece',
        insertionPoint: [10, 0, 0],
        scale: [2, 2, 1],
        rotation: 90,
        color: 0,
        linetype: 'BYBLOCK',
        lineweight: -2,
        transparency: 0x01000000,
      }),
    });
    const root = tx.add({
      type: 'INSERT',
      owner: db.find('BLOCK_RECORD', '*Model_Space')!.handle,
      fields: entityFields({ blockName: 'outer', insertionPoint: [100, 50, 0], layer: 'WALLS' }),
    });
    return {
      line: line.handle,
      root: root.handle,
      nested: nested.handle,
      piece: piece.handle,
      outer: outer.handle,
    };
  });
  return { db, handles };
}
describe('native nested block display', () => {
  it('expands Phase 01 graphs with basepoints, scale and rotation while resolving all inherited properties', () => {
    const { db, handles } = fixture(),
      before = db.serialize(),
      objects = db.all();
    const output = databaseBlockDisplayEntities(objects, drawingStyleTables(objects).layers);
    expect(output).toHaveLength(1);
    expect(output[0]).toMatchObject({
      sourceId: handles.root,
      layer: 'WALLS',
      color: { kind: 'aci', index: 1 },
      linetype: 'DASHED',
      lineweight: 50,
      transparency: 40,
      visible: true,
      geometry: { type: 'line', start: { x: 110, y: 50 }, end: { x: 110, y: 54 } },
    });
    expect(db.serialize()).toBe(before);
  });
  it('preserves explicit child layers and true color; frozen insert layers hide their descendants', () => {
    const { db, handles } = fixture();
    db.transaction('override', (tx) =>
      tx.modify(handles.line, (o) => {
        Object.assign(o.fields, {
          layer: 'DETAIL',
          color: 256,
          trueColor: 0xffffff,
          linetype: 'BYLAYER',
          lineweight: -1,
          transparency: 0,
        });
      }),
    );
    let objects = db.all(),
      output = databaseBlockDisplayEntities(objects, drawingStyleTables(objects).layers);
    expect(output[0]).toMatchObject({
      layer: 'DETAIL',
      color: { kind: 'rgb', rgb: 0xffffff },
      linetype: 'HIDDEN',
      lineweight: 70,
      transparency: 0,
    });
    expect(
      resolveDisplayColor(output[0]!.color, { layer: output[0]!.color, background: 0xffffff }),
    ).toBe(0xffffff);
    db.transaction('freeze', (tx) =>
      tx.modify(db.find('LAYER', 'WALLS')!.handle, (o) => {
        o.fields.flags = 1;
      }),
    );
    objects = db.all();
    output = databaseBlockDisplayEntities(objects, drawingStyleTables(objects).layers);
    expect(output[0]?.visible).toBe(false);
  });
  it('keeps unique occurrence identities when nested definitions are inserted more than once', () => {
    const { db, handles } = fixture();
    db.transaction('repeated', (tx) => {
      const middle = tx.add({
        type: 'BLOCK_RECORD',
        owner: db.tables.BLOCK_RECORD,
        name: 'middle',
      });
      tx.add({ type: 'INSERT', owner: middle.handle, fields: entityFields({ name: 'piece' }) });
      tx.modify(handles.nested, (o) => {
        o.fields.blockName = 'middle';
      });
      tx.add({
        type: 'INSERT',
        owner: handles.outer,
        fields: entityFields({ name: 'middle', insertionPoint: [40, 0, 0] }),
      });
    });
    const objects = db.all(),
      output = databaseBlockDisplayEntities(objects, drawingStyleTables(objects).layers);
    expect(output).toHaveLength(2);
    expect(new Set(output.map((e) => e.id)).size).toBe(2);
    expect(new Set(output.map((e) => e.sourceId))).toEqual(new Set([handles.root]));
  });
  it('propagates a locked insertion layer to descendants on an unlocked named layer', () => {
    const { db, handles } = fixture();
    db.transaction('lock parent', (tx) => {
      tx.modify(db.find('LAYER', 'WALLS')!.handle, (object) => {
        object.fields.flags = 4;
      });
      tx.modify(handles.line, (object) => {
        object.fields.layer = 'DETAIL';
      });
    });
    const objects = db.all(),
      output = databaseBlockDisplayEntities(objects, drawingStyleTables(objects).layers);
    expect(output[0]).toMatchObject({ layer: 'DETAIL', visible: true, locked: true });
    expect(drawingStyleTables(objects).layers.get('DETAIL')?.locked).toBe(false);
  });
  it('reads opaque INSERT DXF groups and reports cycles without inventing geometry', () => {
    const { db, handles } = fixture();
    db.transaction('raw insert', (tx) => {
      tx.modify(handles.root, (o) => {
        o.fields = {};
        o.groups = [
          { code: 2, value: 'piece' },
          { code: 8, value: 'WALLS' },
          { code: 10, value: 5 },
          { code: 20, value: 9 },
          { code: 41, value: 2 },
          { code: 42, value: 1 },
        ];
      });
    });
    let objects = db.all(),
      output = databaseBlockDisplayEntities(objects, drawingStyleTables(objects).layers);
    expect(output[0]?.geometry).toMatchObject({
      type: 'line',
      start: { x: 5, y: 9 },
      end: { x: 9, y: 9 },
    });
    db.transaction('cyclic definition', (tx) => {
      tx.add({ type: 'INSERT', owner: handles.piece, fields: { name: 'piece' } });
    });
    const diagnostics: BlockDisplayDiagnostic[] = [];
    objects = db.all();
    output = databaseBlockDisplayEntities(objects, drawingStyleTables(objects).layers, 25, (d) =>
      diagnostics.push(d),
    );
    expect(output).toHaveLength(1);
    expect(diagnostics.some((d) => d.reason.includes('Cyclic'))).toBe(true);
  });
});
