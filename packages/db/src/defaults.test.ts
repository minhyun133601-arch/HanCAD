import { describe, expect, it } from 'vitest';
import { createMetricSnapshot } from './defaults';
import { DrawingDatabase } from './database';
import { validateSnapshot } from './validation';

describe('metric default reference graph', () => {
  it('provides owned dictionary entries, reciprocal layout records and three persistent block definitions', () => {
    const database = new DrawingDatabase();
    const root = database.get(database.namedObjectDictionary)!;
    expect(root.type).toBe('DICTIONARY');
    expect(root.fields.entries).toEqual(
      expect.arrayContaining(
        [
          'ACAD_LAYOUT',
          'ACAD_GROUP',
          'ACAD_MLINESTYLE',
          'ACAD_MLEADERSTYLE',
          'ACAD_TABLESTYLE',
          'ACAD_PLOTSETTINGS',
          'ACAD_SCALELIST',
        ].map((name) => expect.objectContaining({ name, hardOwner: true })),
      ),
    );
    for (const [index, name] of ['Model', 'Layout1', 'Layout2'].entries()) {
      const layout = database.find('LAYOUT', name)!;
      const block = database.get(String(layout.fields.blockRecord))!;
      expect(block.fields.layout).toBe(layout.handle);
      expect(block.name).toBe(['*Model_Space', '*Paper_Space', '*Paper_Space0'][index]);
      expect(database.get(String(block.fields.blockBegin))).toMatchObject({
        type: 'BLOCK',
        owner: block.handle,
      });
      expect(database.get(String(block.fields.blockEnd))).toMatchObject({
        type: 'ENDBLK',
        owner: block.handle,
      });
      if (index > 0)
        expect(database.get(String(layout.fields.lastViewport))).toMatchObject({
          type: 'VIEWPORT',
          owner: block.handle,
        });
    }
    expect(database.find('VPORT', '*Active')).toBeDefined();
    expect(database.getVariable('LIMMAX')).toEqual([420, 297]);
    expect(database.getVariable('GRIDUNIT')).toEqual([10, 10]);
    expect(database.getVariable('SNAPUNIT')).toEqual([10, 10]);
    expect(database.getVariable('LUNITS')).toBe(2);
    expect(database.getVariable('LUPREC')).toBe(4);
    expect(database.find('SCALE', '1:1200')?.fields).toMatchObject({
      paperUnits: 1,
      drawingUnits: 1200,
    });
    expect(() => validateSnapshot(database.snapshot())).not.toThrow();
  });

  it('rejects broken known graph metadata while retaining legacy/unknown opaque fields', () => {
    const snapshot = createMetricSnapshot();
    const brokenEntry = structuredClone(snapshot);
    const root = brokenEntry.objects.find(
      (object) => object.handle === snapshot.namedObjectDictionary,
    )!;
    root.fields.entries = [{ name: 'bad', handle: 'FFFF', hardOwner: true }];
    expect(() => validateSnapshot(brokenEntry)).toThrow('dictionary entry');
    const brokenLayout = structuredClone(snapshot);
    const layout = brokenLayout.objects.find((object) => object.type === 'LAYOUT')!;
    layout.fields.blockRecord = brokenLayout.namedObjectDictionary;
    expect(() => validateSnapshot(brokenLayout)).toThrow(/layout/i);
    const cycle = structuredClone(snapshot);
    const dictionary = cycle.objects.find(
      (object) => object.handle === cycle.namedObjectDictionary,
    )!;
    dictionary.owner = dictionary.handle;
    expect(() => validateSnapshot(cycle)).toThrow('Circular');
    const groups = structuredClone(snapshot);
    groups.objects[0]!.groups = [{ code: 1.5, value: 'invalid' }];
    expect(() => validateSnapshot(groups)).toThrow('DXF group');
    const legacy = structuredClone(snapshot);
    for (const object of legacy.objects) {
      if (object.type === 'DICTIONARY') delete object.fields.entries;
      if (object.type === 'BLOCK_RECORD') delete object.fields.layout;
    }
    expect(() => validateSnapshot(legacy)).not.toThrow();
    expect(DrawingDatabase.deserialize(JSON.stringify(legacy)).snapshot()).toEqual(legacy);
  });
});
