import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState, normalizeCadState } from '@hancad/legacy-bridge';
import { draftCircle, draftLine, transformCadSelection } from '@hancad/draft';
import { DrawingDatabase } from '@hancad/db';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import {
  copyDrawingSelection,
  parseDrawingClipboard,
  pasteDrawingClipboard,
} from './drawing-clipboard';
import { syncClipboardBlockRecords } from './clipboard-block-records';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const state = createEmptyCadState();
  state.entities = [
    draftLine(
      state.settings,
      { x: 200000000.125, y: -100.25, z: 5 },
      { x: 200000020.125, y: -80.25, z: 9 },
      'line',
    ),
    draftCircle(state.settings, { x: 200000010.125, y: -90.25 }, 2, 'circle'),
  ];
  return state;
}
describe('drawing Clipboard commands', () => {
  it('uses an existing destination MLINE style for both named metadata and actual rail geometry', () => {
    const source = createEmptyCadState(),
      target = createEmptyCadState();
    source.mlineStyles = [{ name: 'Custom', description: 'Source style', offsets: [0.5, -0.5] }];
    source.entities = [
      {
        id: 'mline',
        type: 'polyline',
        layer: '0',
        color: '#ffffff',
        lineWidth: 1,
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        closed: false,
        sourceType: 'MLINE',
        drawPaths: [
          [
            { x: 0, y: -1 },
            { x: 10, y: -1 },
          ],
          [
            { x: 0, y: 1 },
            { x: 10, y: 1 },
          ],
        ],
        mline: {
          vertices: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ],
          offsets: [0.5, -0.5],
          scale: 2,
          justification: 1,
          style: 'Custom',
          closed: false,
        },
      },
    ];
    target.mlineStyles = [{ name: 'CUSTOM', description: 'Destination style', offsets: [2, -2] }];
    const packet = copyDrawingSelection(source, ['mline'], { x: 0, y: 0 })!;
    const pasted = pasteDrawingClipboard(target, parseDrawingClipboard(JSON.stringify(packet)), {
      x: 100,
      y: -100,
    }).state;
    expect(pasted.mlineStyles).toEqual(target.mlineStyles);
    expect(pasted.entities[0]?.mline).toMatchObject({
      style: 'CUSTOM',
      offsets: [2, -2],
      vertices: [
        { x: 100, y: -100 },
        { x: 110, y: -100 },
      ],
    });
    expect(pasted.entities[0]?.drawPaths).toMatchObject([
      [
        { x: 100, y: -104 },
        { x: 110, y: -104 },
      ],
      [
        { x: 100, y: -96 },
        { x: 110, y: -96 },
      ],
    ]);
    expect(source.entities[0]?.mline?.offsets).toEqual([0.5, -0.5]);
  });
  it('transports exact curves, region loops, mask paths and MLINE style dependencies across drawings', () => {
    const source = createEmptyCadState();
    const base = {
      layer: '0',
      color: '#ffffff',
      lineWidth: 1,
      type: 'polyline' as const,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      closed: false,
    };
    const vec = (x: number, y: number) => ({ x, y, z: 0 });
    source.entities = [
      {
        ...base,
        id: 'ellipse',
        sourceType: 'ELLIPSE',
        curve: {
          type: 'ELLIPSE',
          center: vec(0, 0),
          majorAxis: vec(10, 0),
          minorAxis: vec(0, 5),
          startParameter: 0,
          sweepParameter: 2 * Math.PI,
        },
      },
      {
        ...base,
        id: 'region',
        sourceType: 'REGION',
        regionArea: 100,
        regionLoops: [
          [
            { type: 'LINE', start: vec(0, 0), end: vec(10, 0) },
            { type: 'LINE', start: vec(10, 0), end: vec(10, 10) },
            { type: 'LINE', start: vec(10, 10), end: vec(0, 10) },
            { type: 'LINE', start: vec(0, 10), end: vec(0, 0) },
          ],
        ],
      },
      {
        ...base,
        id: 'mask',
        sourceType: 'WIPEOUT',
        drawFill: [
          [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: -10 },
          ],
        ],
        frameMode: 2,
      },
      {
        ...base,
        id: 'mline',
        sourceType: 'MLINE',
        drawPaths: [
          [
            { x: 0, y: 1 },
            { x: 10, y: 1 },
          ],
        ],
        mline: {
          vertices: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ],
          offsets: [-0.5, 0.5],
          scale: 2,
          justification: 0,
          style: 'Custom',
          closed: false,
        },
      },
    ];
    source.mlineStyles = [
      { name: 'Custom', description: 'Clipboard dependency', offsets: [-0.5, 0.5] },
    ];
    const copied = copyDrawingSelection(
      source,
      source.entities.map((entity) => entity.id),
      { x: 10, y: -20 },
    )!;
    const transported = parseDrawingClipboard(JSON.stringify(copied));
    expect(transported.state.entities.map((entity) => entity.sourceType)).toEqual([
      'ELLIPSE',
      'REGION',
      'WIPEOUT',
      'MLINE',
    ]);
    const pasted = pasteDrawingClipboard(createEmptyCadState(), transported, {
      x: 100,
      y: -200,
    }).state;
    expect(pasted.entities[0]?.curve).toMatchObject({
      center: { x: 90, y: 180, z: 0 },
      majorAxis: vec(10, 0),
    });
    expect(pasted.entities[1]).toMatchObject({
      regionArea: 100,
      regionLoops: [[{ start: { x: 90, y: 180, z: 0 } }, {}, {}, {}]],
    });
    expect(pasted.entities[2]?.drawFill?.[0]?.[0]).toMatchObject({ x: 90, y: -180 });
    expect(pasted.entities[3]?.mline?.vertices[0]).toMatchObject({ x: 90, y: -180 });
    expect(pasted.mlineStyles).toEqual(source.mlineStyles);
    expect(source.entities[0]?.curve).toMatchObject({ center: vec(0, 0) });
  });
  it('copies exact double coordinates and explicit COPYBASE origin across another drawing', () => {
    const source = fixture(),
      original = structuredClone(source);
    const copied = copyDrawingSelection(source, ['line', 'circle'], {
      x: 200000000.125,
      y: -100.25,
      z: 5,
    })!;
    const transported = parseDrawingClipboard(JSON.stringify(copied));
    const pasted = pasteDrawingClipboard(createEmptyCadState(), transported, {
      x: 50,
      y: -70,
      z: 10,
    });
    expect(pasted.state.entities[0]).toMatchObject({
      a: { x: 50, y: -70, z: 10 },
      b: { x: 70, y: -50, z: 14 },
    });
    expect(pasted.ids).toHaveLength(2);
    expect(pasted.ids).not.toContain('line');
    expect(source).toEqual(original);
    const originalPaste = pasteDrawingClipboard(
      createEmptyCadState(),
      transported,
      transported.basePoint,
    );
    expect(originalPaste.state.entities[0]).toMatchObject({
      a: source.entities[0]?.type === 'line' ? source.entities[0].a : {},
    });
  });
  it('uses lower-left bounds for COPYCLIP and excludes hidden or locked objects', () => {
    const source = fixture();
    expect(copyDrawingSelection(source, ['line', 'circle'])?.basePoint).toEqual({
      x: 200000000.125,
      y: -80.25,
    });
    source.layers[0]!.locked = true;
    expect(copyDrawingSelection(source, ['line'])).toBeUndefined();
    source.layers[0]!.locked = false;
    source.layers[0]!.visible = false;
    expect(copyDrawingSelection(source, ['line'])).toBeUndefined();
  });
  it('merges source definitions without replacing a target definition with the same name', () => {
    const source = fixture(),
      target = createEmptyCadState();
    source.layers.push({ name: '부품', color: '#ff0000', visible: true, locked: false });
    source.entities[0]!.layer = '부품';
    source.linetypes = [{ name: 'CUSTOM', description: 'source', pattern: [2, -1] }];
    source.groups = [
      { id: 'source-group', name: 'SOURCE', description: '', selectable: true, ids: ['line'] },
    ];
    target.linetypes = [{ name: 'CUSTOM', description: 'target', pattern: [5, -2] }];
    const copied = copyDrawingSelection(source, ['line'])!;
    const next = pasteDrawingClipboard(target, copied, { x: 0, y: 0 });
    expect(next.state.layers).toContainEqual(source.layers[1]);
    expect(next.state.linetypes).toEqual(target.linetypes);
    expect(next.state.groups?.[0]?.id).not.toBe('source-group');
    expect(next.state.groups?.[0]?.ids).toEqual(next.ids);
  });
  it('rejects malformed/unsupported payloads and invalid geometry before editing a target', () => {
    const copy = copyDrawingSelection(fixture(), ['line'])!;
    expect(() => parseDrawingClipboard('plain text')).toThrow();
    expect(() => parseDrawingClipboard(JSON.stringify({ ...copy, version: 2 }))).toThrow();
    expect(() =>
      parseDrawingClipboard(JSON.stringify({ ...copy, basePoint: { x: null, y: 0 } })),
    ).toThrow();
    expect(() =>
      parseDrawingClipboard(
        JSON.stringify({ ...copy, state: { ...copy.state, entities: [{ type: 'line' }] } }),
      ),
    ).toThrow();
  });
  it('keeps PASTEBLOCK identity through recovery, moving, copying and native undo/redo', () => {
    const copied = copyDrawingSelection(fixture(), ['line', 'circle'])!;
    const pasted = pasteDrawingClipboard(createEmptyCadState(), copied, { x: 0, y: 0 }, true);
    expect(pasted.state.clipboardBlocks?.[0]?.entityIds).toEqual(pasted.ids);
    const restored = normalizeCadState(JSON.parse(JSON.stringify(pasted.state)));
    const moved = transformCadSelection(restored, pasted.ids, { x: 100, y: -50 });
    expect(moved.state.clipboardBlocks?.[0]?.basePoint).toEqual({ x: 100, y: -50 });
    const duplicate = transformCadSelection(moved.state, pasted.ids, { x: 10, y: 10 }, true);
    expect(duplicate.state.clipboardBlocks).toHaveLength(2);
    expect(duplicate.state.clipboardBlocks?.[1]?.entityIds).toEqual(duplicate.ids);
    const database = new DrawingDatabase();
    database.transaction('PASTEBLOCK', (tx) =>
      syncClipboardBlockRecords(database, tx, pasted.state),
    );
    expect(database.all().filter((object) => object.type === 'INSERT')).toHaveLength(1);
    expect(database.find('BLOCK_RECORD', pasted.state.clipboardBlocks![0]!.name)).toBeDefined();
    const child = database.all().find((object) => object.type === 'LINE');
    expect(child?.fields.start).toEqual([0, 20, 5]);
    expect(database.undo()).toBe(1);
    expect(database.all().filter((object) => object.type === 'INSERT')).toHaveLength(0);
    expect(database.redo()).toBe(1);
    expect(database.all().filter((object) => object.type === 'INSERT')).toHaveLength(1);
    database.transaction('ERASE', (tx) =>
      syncClipboardBlockRecords(database, tx, {
        ...pasted.state,
        entities: [],
        clipboardBlocks: [],
      }),
    );
    expect(database.all().filter((object) => object.type === 'INSERT')).toHaveLength(0);
  });
  it('retains native block, INSERT and member handles through moves and member-property edits', () => {
    const copied = copyDrawingSelection(fixture(), ['line', 'circle'])!;
    const pasted = pasteDrawingClipboard(createEmptyCadState(), copied, { x: 0, y: 0 }, true);
    const database = new DrawingDatabase();
    database.transaction('PASTEBLOCK', (tx) =>
      syncClipboardBlockRecords(database, tx, pasted.state),
    );
    const before = database.all().filter((object) => object.fields.hancadClipboardBlock);
    const moved = transformCadSelection(pasted.state, pasted.ids, { x: 100, y: -50 });
    database.transaction('MOVE', (tx) => syncClipboardBlockRecords(database, tx, moved.state));
    const after = database.all().filter((object) => object.fields.hancadClipboardBlock);
    expect(after.map((object) => object.handle).sort()).toEqual(
      before.map((object) => object.handle).sort(),
    );
    expect(after.find((object) => object.type === 'INSERT')?.fields.insertionPoint).toEqual([
      100, 50, 0,
    ]);
    const circle = moved.state.entities.find((entity) => entity.type === 'circle')!;
    if (circle.type !== 'circle') throw new Error('Expected circle');
    const changed = {
      ...moved.state,
      entities: moved.state.entities.map((entity) =>
        entity.id === circle.id ? { ...circle, radius: 9 } : entity,
      ),
    };
    database.transaction('PROPERTIES', (tx) => syncClipboardBlockRecords(database, tx, changed));
    const native = database
      .all()
      .find((object) => object.fields.hancadClipboardEntityId === circle.id)!;
    expect(native.handle).toBe(before.find((object) => object.type === 'CIRCLE')?.handle);
    expect(native.fields.radius).toBe(9);
    expect(database.undo()).toBe(1);
    expect(database.get(native.handle)?.fields.radius).toBe(2);
    expect(database.undo()).toBe(1);
    expect(
      database.all().find((object) => object.type === 'INSERT')?.fields.insertionPoint,
    ).toEqual([0, -0, 0]);
  });
});
