import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingDatabase, entityFields } from '@hancad/db';
import type { DatabaseObject, DxfGroup } from '@hancad/db';
import { evaluateGeometry } from '@hancad/geom';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { draftLine, selectCadArea, nativeObjectSelectionId } from '@hancad/draft';
import { SystemVariables } from '@hancad/sysvars';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import { outlineContext, outlineRun } from '../../../packages/draft/src/draw-outline-fixtures';
import { mirrorProgram } from '../../../packages/draft/src/modify-transform-stretch';
import { mirrorNativeHatch } from '../../../packages/draft/src/native-hatch-mirror';
import { nativeHatchSnapCurves } from './native-hatch-snap-sources';
import {
  mirrorNativeObjects,
  nativeHatchSelectionState,
  pickNativeHatch,
  nativeHatchEditorIds,
} from './native-hatch-selection';
import { completeDrawCommand } from './complete-draw-command';

const groups = (values: readonly (readonly [number, number | string])[]): DxfGroup[] =>
  values.map(([code, value]) => ({ code, value }));
const pattern: DxfGroup[] = groups([
  [75, 0],
  [76, 1],
  [52, 30],
  [41, 2],
  [77, 0],
  [78, 1],
  [53, 75],
  [43, 2],
  [44, 3],
  [45, -4],
  [46, 5],
  [79, 3],
  [49, 2],
  [49, -1],
  [49, 0],
  [98, 1],
  [10, 5],
  [20, 4],
  [999, 'opaque payload'],
]);
function hatch(database = new DrawingDatabase(), boundary?: DxfGroup[]): DatabaseObject {
  let object!: DatabaseObject;
  database.transaction('fixture', (tx) => {
    object = tx.add({
      type: 'HATCH',
      owner: database.find('BLOCK_RECORD', '*Model_Space')!.handle,
      fields: entityFields({
        color: 3,
        trueColor: 0x123456,
        elevation: 7,
        lineweight: 25,
        vendorValue: 'keep',
      }),
      xdata: {
        TEST: groups([
          [1000, 'opaque'],
          [1070, 5],
        ]),
      },
      groups: [
        ...groups([
          [10, 0],
          [20, 0],
          [30, 7],
          [2, 'USER_PATTERN'],
          [70, 0],
          [71, 0],
          [91, 1],
        ]),
        ...(boundary ??
          groups([
            [92, 2],
            [72, 1],
            [73, 1],
            [93, 4],
            [10, 2],
            [20, 1],
            [42, 0.25],
            [10, 8],
            [20, 1],
            [10, 8],
            [20, 6],
            [10, 2],
            [20, 6],
            [97, 0],
          ])),
        ...structuredClone(pattern),
      ],
    });
  });
  return object;
}
const value = (object: DatabaseObject, code: number) =>
  object.groups.find((g) => g.code === code)?.value;
beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
describe('native HATCH MIRROR definition and command integration', () => {
  it.each([false, true])(
    'honors MIRRHATCH=%s and preserves pattern scale, dashes, styles and opaque data',
    (mirror) => {
      const original = hatch(),
        before = structuredClone(original),
        result = mirrorNativeHatch(original, { x: 0, y: 0 }, { x: 0, y: -100 }, mirror);
      expect(original).toEqual(before);
      expect(value(result, 52)).toBeCloseTo(mirror ? 150 : 30, 9);
      expect(value(result, 53)).toBeCloseTo(mirror ? 105 : 75, 9);
      expect(value(result, 43)).toBeCloseTo(-2, 9);
      expect(value(result, 44)).toBeCloseTo(3, 9);
      expect(value(result, 45)).toBeCloseTo(mirror ? 4 : -4, 9);
      expect(value(result, 46)).toBeCloseTo(5, 9);
      expect(value(result, 42)).toBe(-0.25);
      expect(result.groups.filter((g) => [41, 49, 999].includes(g.code))).toEqual(
        original.groups.filter((g) => [41, 49, 999].includes(g.code)),
      );
      expect(result.fields).toEqual(before.fields);
      expect(result.xdata).toEqual(before.xdata);
      const seed = result.groups.findIndex((g) => g.code === 98);
      expect(result.groups[seed + 1]!.value).toBeCloseTo(-5, 9);
      expect(result.groups[seed + 2]!.value).toBeCloseTo(4, 9);
      const curve = nativeHatchSnapCurves(result)[0]!;
      expect(evaluateGeometry(curve, 0)).toMatchObject({
        x: expect.closeTo(-2, 8),
        y: expect.closeTo(1, 8),
        z: 7,
      });
    },
  );
  it('reflects line, circular arc, elliptical arc, spline controls, fits and tangent vectors exactly', () => {
    const original = hatch(
      undefined,
      groups([
        [92, 0],
        [93, 4],
        [72, 1],
        [10, 0],
        [20, 0],
        [11, 10],
        [21, 0],
        [72, 2],
        [10, 10],
        [20, 5],
        [40, 5],
        [50, 270],
        [51, 360],
        [73, 1],
        [72, 3],
        [10, 10],
        [20, 5],
        [11, 5],
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
        [10, 10],
        [20, 7.5],
        [10, 0],
        [20, 10],
        [10, 0],
        [20, 0],
        [97, 1],
        [11, 4],
        [21, 5],
        [12, 2],
        [22, 3],
        [13, -2],
        [23, 4],
        [97, 0],
      ]),
    );
    const result = mirrorNativeHatch(original, { x: 3, y: -2 }, { x: 4, y: -3 }, true),
      before = nativeHatchSnapCurves(original),
      after = nativeHatchSnapCurves(result);
    expect(after.map((c) => c.type)).toEqual(['LINE', 'ARC', 'ELLIPSE', 'SPLINE']);
    before.forEach((curve, i) => {
      for (const t of [0, 0.17, 0.5, 0.83, 1]) {
        const p = evaluateGeometry(curve, t),
          q = evaluateGeometry(after[i]!, t);
        expect(q.x).toBeCloseTo(p.y + 1, 8);
        expect(q.y).toBeCloseTo(p.x - 1, 8);
        expect(q.z).toBeCloseTo(p.z, 8);
      }
    });
    expect(value(result, 12)).toBeCloseTo(3, 9);
    expect(value(result, 22)).toBeCloseTo(2, 9);
    expect(result.groups.filter((g) => [40, 42, 94, 95, 96].includes(g.code))).toEqual(
      original.groups.filter((g) => [40, 42, 94, 95, 96].includes(g.code)),
    );
  });
  it('keeps oblique OCS planes and elevation through WCS reflection', () => {
    const original = hatch();
    original.fields.extrusion = [0, 0.6, 0.8];
    const result = mirrorNativeHatch(original, { x: 20, y: 0 }, { x: 20, y: -100 }, true),
      source = nativeHatchSnapCurves(original)[0]!,
      target = nativeHatchSnapCurves(result)[0]!;
    for (const t of [0, 0.13, 0.5, 0.8, 1]) {
      const p = evaluateGeometry(source, t),
        q = evaluateGeometry(target, t);
      expect(q.x).toBeCloseTo(40 - p.x, 8);
      expect(q.y).toBeCloseTo(p.y, 8);
      expect(q.z).toBeCloseTo(p.z, 8);
    }
  });
  it('uses boundary adapters for exact window/crossing inquiries without adding legacy entities', () => {
    const database = new DrawingDatabase(),
      object = hatch(database),
      state = createEmptyCadState(),
      objects = mirrorNativeObjects(database, state),
      adapter = nativeHatchSelectionState(state, objects);
    expect(selectCadArea(adapter, { x: 0, y: 0 }, { x: 10, y: -8 }, 'window')).toEqual([
      nativeObjectSelectionId(object.handle),
    ]);
    expect(selectCadArea(adapter, { x: 7, y: -2 }, { x: 9, y: -5 }, 'crossing')).toEqual([
      nativeObjectSelectionId(object.handle),
    ]);
    expect(selectCadArea(adapter, { x: 7, y: -2 }, { x: 9, y: -5 }, 'window')).toEqual([]);
    expect(pickNativeHatch(objects, { x: 8, y: -3 }, 0.1)).toBe(
      nativeObjectSelectionId(object.handle),
    );
    expect(state.entities).toEqual([]);
  });
  it.each(['associative', 'gradient', 'edge'])(
    'reports unsupported %s definitions without touching either model',
    (kind) => {
      const object = hatch();
      if (kind === 'associative') object.groups.find((g) => g.code === 71)!.value = 1;
      else if (kind === 'gradient') object.groups.push({ code: 450, value: 1 });
      else
        object.groups.splice(
          object.groups.findIndex((g) => g.code === 92),
          0,
          { code: 92, value: 0 },
        );
      const result = outlineRun(mirrorProgram, [], {
        ...outlineContext(),
        selectedIds: [nativeObjectSelectionId(object.handle)],
        nativeObjects: [object],
      });
      expect(result.entities).toEqual([]);
      expect(result.nativeCopies).toBeUndefined();
      expect(result.messages?.[0]?.ko).toContain('HATCH 대칭을 수행할 수 없습니다');
    },
  );
  it('commits a mixed legacy/native edit with cloned extension metadata in one U and exact REDO', () => {
    const sysvars = new SystemVariables(),
      database = sysvars.database,
      object = hatch(database),
      source = createEmptyCadState();
    source.entities = [draftLine(source.settings, { x: 20, y: -10 }, { x: 40, y: -20 }, 'LINE')];
    database.transaction('metadata', (tx) => {
      const dictionary = tx.add({ type: 'DICTIONARY', owner: object.handle });
      const record = tx.add({
        type: 'XRECORD',
        owner: dictionary.handle,
        groups: groups([
          [1000, 'vendor data'],
          [330, object.handle],
        ]),
      });
      tx.modify(dictionary.handle, (d) => {
        d.fields.entries = [{ name: 'vendor', handle: record.handle }];
      });
      tx.modify(object.handle, (h) => {
        h.extensionDictionary = dictionary.handle;
      });
      tx.setVariable('_STATE', JSON.stringify(source));
    });
    const native = database.get(object.handle)!,
      before = database.serialize();
    database.clearHistory();
    const result = outlineRun(mirrorProgram, [{ x: 0, y: 0 }, { x: 0, y: -100 }, 'Y'], {
      ...outlineContext({ MIRRHATCH: 1 }),
      entities: source.entities,
      selectedIds: ['LINE', nativeObjectSelectionId(native.handle)],
      nativeObjects: [native],
    });
    completeDrawCommand(
      {
        tool: 'MIRROR',
        sysvars,
        getState: () => source,
        commitState: (label, state) =>
          database.transaction(label, (tx) => tx.setVariable('_STATE', JSON.stringify(state))),
        print: vi.fn(),
        korean: true,
        rememberSelection: vi.fn(),
        committedMessage: String,
      },
      result,
      new Map(),
    );
    expect(database.undoCount).toBe(1);
    const after = database.serialize(),
      copy = database.all().find((o) => o.type === 'HATCH')!;
    expect(copy.handle).not.toBe(native.handle);
    expect(database.get(native.handle, true)?.erased).toBe(true);
    expect(copy.extensionDictionary).not.toBe(native.extensionDictionary);
    const dictionary = database.get(copy.extensionDictionary!)!,
      entries = dictionary.fields.entries as { name: string; handle: string }[];
    expect(dictionary.owner).toBe(copy.handle);
    expect(database.get(entries[0]!.handle)?.groups[1]?.value).toBe(copy.handle);
    database.undo();
    expect(database.serialize()).toBe(before);
    database.redo();
    expect(database.serialize()).toBe(after);
  });
  it.each(['raw handle', 'reserved prefix'])(
    'keeps native boundary picks separate from a legacy %s identity',
    (collision) => {
      const database = new DrawingDatabase(),
        object = hatch(database),
        state = createEmptyCadState(),
        legacyId =
          collision === 'raw handle' ? object.handle : nativeObjectSelectionId(object.handle);
      state.entities = [
        draftLine(state.settings, { x: 100, y: -100 }, { x: 110, y: -100 }, legacyId),
      ];
      const reserved = new Set([legacyId]),
        stableIds = nativeHatchEditorIds(database, state),
        nativeId = stableIds.get(object.handle)!,
        objects = mirrorNativeObjects(database, state),
        adapter = nativeHatchSelectionState(state, objects, stableIds),
        picked = pickNativeHatch(objects, { x: 8, y: -3 }, 0.1, reserved, stableIds);
      expect(picked).toBe(nativeId);
      expect(nativeId).not.toBe(legacyId);
      expect(selectCadArea(adapter, { x: 0, y: 0 }, { x: 10, y: -8 }, 'window')).toEqual([
        nativeId,
      ]);
      const context = {
          ...outlineContext({ MIRRHATCH: 1 }),
          entities: state.entities,
          nativeObjects: objects,
          nativeSelectionIds: stableIds,
        },
        inputs = [{ x: 0, y: 0 }, { x: 0, y: -100 }, 'Y'];
      const nativeOnly = outlineRun(mirrorProgram, inputs, { ...context, selectedIds: [picked!] });
      expect(nativeOnly.entities).toEqual([]);
      expect(nativeOnly.eraseIds).toEqual([]);
      expect(nativeOnly.nativeCopies).toHaveLength(1);
      expect(nativeOnly.nativeCopies?.[0]?.sourceHandle).toBe(object.handle);
      const legacyOnly = outlineRun(mirrorProgram, inputs, { ...context, selectedIds: [legacyId] });
      expect(legacyOnly.nativeCopies).toBeUndefined();
      expect(legacyOnly.entities).toHaveLength(1);
      expect(legacyOnly.eraseIds).toEqual([legacyId]);
      expect(database.get(object.handle)).toEqual(object);
      const afterLegacyErasure = { ...state, entities: [] },
        stable = nativeHatchEditorIds(database, afterLegacyErasure);
      const after = outlineRun(mirrorProgram, inputs, {
        ...context,
        entities: [],
        nativeSelectionIds: stable,
        selectedIds: [nativeId],
      });
      expect(after.nativeCopies).toHaveLength(1);
      expect(after.nativeCopies?.[0]?.sourceHandle).toBe(object.handle);
    },
  );
});
