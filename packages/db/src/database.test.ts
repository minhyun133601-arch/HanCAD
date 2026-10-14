import { describe, expect, it } from 'vitest';
import { DrawingDatabase, EventBus, deserializeHcd, entityFields, serializeHcd } from './index';
import type { DatabaseTransaction } from './index';

describe('drawing database command transactions', () => {
  it('creates persistent metric symbol tables and model/paper layouts', () => {
    const database = new DrawingDatabase();
    expect(Object.keys(database.tables)).toHaveLength(9);
    expect(
      database
        .all()
        .filter((object) => object.type === 'LAYOUT')
        .map((object) => object.name),
    ).toEqual(['Model', 'Layout1', 'Layout2']);
    expect(database.find('DIMSTYLE', 'ISO-25')).toBeDefined();
    expect(database.find('LAYER', '0')).toBeDefined();
    expect(database.all().every((object) => /^[0-9A-F]+$/.test(object.handle))).toBe(true);
  });

  it('undoes 1,000 seeded random create/modify/erase operations, then redoes the identical final database', () => {
    const database = new DrawingDatabase();
    const initial = database.serialize();
    let seed = 0x51c0ffee;
    const random = (): number => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 0x100000000;
    };
    for (let index = 0; index < 1000; index++) {
      const entities = database.all(true).filter((object) => object.type === 'LINE');
      const choice = random();
      database.transaction(`edit-${index}`, (transaction) => {
        if (!entities.length || choice < 0.4) {
          transaction.add({
            type: 'LINE',
            owner: database.find('BLOCK_RECORD', '*Model_Space')?.handle ?? null,
            fields: entityFields({
              start: [random() * 1e8, random() * 1e8, 0],
              end: [random() * 1e8, random() * 1e8, 0],
            }),
          });
        } else {
          const entity = entities[Math.floor(random() * entities.length)];
          if (!entity) throw new Error('Random entity missing.');
          if (choice < 0.75)
            transaction.modify(entity.handle, (object) => {
              object.fields.start = [random() * 1e8, random() * 1e8, 0];
            });
          else
            transaction.modify(entity.handle, (object) => {
              object.erased = !object.erased;
            });
        }
      });
    }
    const final = database.serialize();
    expect(database.undoCount).toBe(1000);
    expect(database.undo(1000)).toBe(1000);
    expect(database.serialize()).toBe(initial);
    expect(database.redo(1000)).toBe(1000);
    expect(database.serialize()).toBe(final);
  });

  it('atomically rolls back all changes and handseed after a failed command', () => {
    const database = new DrawingDatabase();
    const initial = database.serialize();
    const events: string[] = [];
    database.events.subscribe((event) => events.push(event.type));
    expect(() =>
      database.transaction('failed', (transaction) => {
        transaction.add({ type: 'LINE', fields: { point: [1, 2, 3] } });
        transaction.setVariable('LUPREC', 2);
        throw new Error('Cancelled before commit');
      }),
    ).toThrow('Cancelled');
    expect(database.serialize()).toBe(initial);
    expect(database.undoCount).toBe(0);
    expect(events).toEqual([]);
  });

  it('groups multiple operations into one undo, invalidates redo after a branch and rejects escaped transactions', () => {
    const database = new DrawingDatabase();
    let escaped: DatabaseTransaction | undefined;
    database.transaction('group', (transaction) => {
      escaped = transaction;
      const object = transaction.add({ type: 'POINT' });
      transaction.modify(object.handle, (record) => {
        record.fields.position = [1, 2, 0];
      });
      transaction.erase(object.handle);
    });
    expect(database.undoCount).toBe(1);
    expect(() => escaped?.add({ type: 'POINT' })).toThrow('closed');
    database.undo();
    database.transaction('branch', (transaction) => transaction.add({ type: 'CIRCLE' }));
    expect(database.redoCount).toBe(0);
    expect(database.all(true).filter((object) => object.type === 'POINT')).toHaveLength(0);
  });

  it('isolates throwing observers and cloned event values from committed undo/redo data', () => {
    const database = new DrawingDatabase();
    const observed: string[] = [];
    database.events.subscribe((event) => {
      if (event.type === 'sysvar-changed' && Array.isArray(event.value)) event.value[0] = 999;
      throw new Error('Observer failed');
    });
    database.events.subscribe((event) => observed.push(event.type));
    expect(() =>
      database.transaction('SNAPUNIT', (transaction) =>
        transaction.setVariable('SNAPUNIT', [10, 20]),
      ),
    ).not.toThrow();
    database.undo();
    database.redo();
    expect(database.getVariable('SNAPUNIT')).toEqual([10, 20]);
    expect(database.events.failures).toHaveLength(6);
    expect(observed).toHaveLength(6);
    expect(database.events.takeFailures()).toHaveLength(6);
    expect(database.events.failures).toHaveLength(0);
    const reported: unknown[] = [];
    const bus = new EventBus<number>((failure) => reported.push(failure.error));
    bus.subscribe(() => {
      throw new Error('Recorded');
    });
    bus.publish(1);
    expect(reported).toHaveLength(1);
  });

  it('rejects async/nested transactions without losing existing drawing content', () => {
    const database = new DrawingDatabase();
    const before = database.serialize();
    expect(() =>
      database.transaction('nested', () =>
        database.transaction('inner', (transaction) => transaction.add({ type: 'POINT' })),
      ),
    ).toThrow('Nested');
    expect(() => database.transaction('async', () => Promise.resolve(3))).toThrow('synchronous');
    expect(database.serialize()).toBe(before);
  });
});

describe('lossless local persistence', () => {
  it('round trips opaque objects, handles, owner, reactors, XDATA, extension dictionaries, unknown groups and binary blobs', () => {
    const database = new DrawingDatabase();
    database.transaction('proxy', (transaction) => {
      const dictionary = transaction.add({
        type: 'DICTIONARY',
        owner: database.namedObjectDictionary,
      });
      transaction.add({
        type: 'VENDOR_UNKNOWN_ENTITY',
        owner: database.find('BLOCK_RECORD', '*Model_Space')?.handle ?? null,
        handle: 'FFF0',
        reactors: [dictionary.handle],
        extensionDictionary: dictionary.handle,
        xdata: {
          HANAPP: [
            { code: 1000, value: '한글 + raw data' },
            { code: 1004, value: [0, 127, 255] },
          ],
        },
        groups: [
          { code: 100, value: 'AcDbOpaque' },
          { code: 9999, value: { vendor: ['data', 4.5] } },
        ],
        fields: { nested: { binaryReference: 'opaque.bin', untouched: true } },
      });
    });
    const jsonReload = DrawingDatabase.deserialize(database.serialize());
    expect(jsonReload.snapshot()).toEqual(database.snapshot());
    const blob = Uint8Array.from([0, 1, 127, 255]);
    const hcd = serializeHcd(database, new Map([['한글/opaque.bin', blob]]));
    expect(Array.from(hcd.slice(0, 4))).toEqual([0x50, 0x4b, 3, 4]);
    const reloaded = deserializeHcd(hcd);
    expect(reloaded.database.serialize()).toBe(database.serialize());
    expect(reloaded.blobs.get('한글/opaque.bin')).toEqual(blob);
    expect(reloaded.database.handseed).toBe('FFF1');
  });

  it('rejects corrupt HCD and malformed database schemas', () => {
    const database = new DrawingDatabase();
    const archive = serializeHcd(database);
    const view = new DataView(archive.buffer);
    const contentOffset = 30 + view.getUint16(26, true);
    archive[contentOffset] = (archive[contentOffset] ?? 0) ^ 1;
    expect(() => deserializeHcd(archive)).toThrow('checksum');
    expect(() => deserializeHcd(archive.slice(0, 15))).toThrow('Invalid');
    expect(() => serializeHcd(database, new Map([['../bad', new Uint8Array()]]))).toThrow(
      'Invalid',
    );
    const snapshot = database.snapshot();
    expect(() => DrawingDatabase.deserialize(JSON.stringify({ ...snapshot, tables: {} }))).toThrow(
      'Missing symbol table',
    );
    expect(() =>
      DrawingDatabase.deserialize(
        JSON.stringify({ ...snapshot, objects: [...snapshot.objects, snapshot.objects[0]] }),
      ),
    ).toThrow('Duplicate handle');
  });
});
