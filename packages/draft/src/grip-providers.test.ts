import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyCadState, getLegacyRuntime, normalizeCadState } from '@hancad/legacy-bridge';
import type { CadEntity, CadPolyline } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { draftCircle, draftEntityBase, draftLine, draftPolyline } from './entities';
import {
  collectEntityGrips,
  defaultGripProvider,
  gripPolylineMidpoint,
  nearestEntityGrip,
} from './grip-providers';
import { applyGripAction } from './grip-actions';
import { GripSession } from './grip-session';
import { transformGripEntity } from './grip-transform';
import { legacyEntitySnapSources } from './snap-legacy-sources';
import { SnapIndex } from './snap-index';
import { querySnapCandidates } from './snap-query';
import { snapModeBits } from './snap-types';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

it('provides grips for every current entity family, suppresses locked/hidden/over-limit selections and honors GRIPS levels', () => {
  const state = createEmptyCadState(),
    base = draftEntityBase(state.settings, 'base');
  state.entities = [
    draftLine(state.settings, { x: 0, y: 0 }, { x: 100, y: 0 }, 'line'),
    draftPolyline(
      state.settings,
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
      ],
      false,
      false,
      'polyline',
    ),
    draftPolyline(
      state.settings,
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 0, y: 50 },
      ],
      true,
      true,
      'rect',
    ),
    draftCircle(state.settings, { x: 20, y: 20 }, 10, 'circle'),
    {
      ...base,
      id: 'arc',
      type: 'arc',
      center: { x: 30, y: 30 },
      radius: 10,
      startAngle: 0,
      endAngle: Math.PI,
      clockwise: true,
    },
    {
      ...base,
      id: 'text',
      type: 'text',
      point: { x: 40, y: 40 },
      text: '가나다',
      textSize: 10,
      rotation: 0,
    },
    {
      ...base,
      id: 'dim',
      type: 'dimension',
      kind: 'aligned',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      offset: 20,
      precision: 2,
      dimScale: 1,
      textSize: 5,
      arrowSize: 3,
      extensionGap: 1,
      extensionOvershoot: 2,
      unit: 'mm',
    },
  ];
  const ids = state.entities.map((entity) => entity.id),
    settings = { grips: 2, limit: 100, multifunctional: 3 };
  const grips = collectEntityGrips(state, ids, settings);
  expect(new Set(grips.map((grip) => grip.entityId))).toEqual(new Set(ids));
  expect(grips.filter((grip) => grip.entityId === 'polyline')).toHaveLength(5);
  expect(collectEntityGrips(state, ['polyline'], { ...settings, grips: 1 })).toHaveLength(3);
  expect(collectEntityGrips(state, ids, { ...settings, grips: 0 })).toEqual([]);
  expect(collectEntityGrips(state, ids, { ...settings, limit: 1 })).toEqual([]);
  expect(collectEntityGrips(state, ids, { ...settings, limit: 0 })).toHaveLength(grips.length);
  expect(nearestEntityGrip(grips, { x: 0.1, y: 0.1 }, 0.2)?.point).toEqual({ x: 0, y: 0 });
  state.layers[0]!.locked = true;
  expect(collectEntityGrips(state, ids, settings)).toEqual([]);
  state.layers[0]!.locked = false;
  state.layers[0]!.visible = false;
  expect(collectEntityGrips(state, ids, settings)).toEqual([]);
});

it('edits circle radius, arc three-point definition, text insertion and dimension definition/offset grips precisely', () => {
  const state = createEmptyCadState(),
    base = draftEntityBase(state.settings);
  const circle = draftCircle(state.settings, { x: 10, y: 20 }, 10, 'circle');
  expect(defaultGripProvider.stretch(circle, ['q0'], { x: 10, y: 0 })).toMatchObject({
    radius: 20,
    center: { x: 10, y: 20 },
  });
  expect(defaultGripProvider.stretch(circle, ['center'], { x: 10, y: 0 })).toMatchObject({
    radius: 10,
    center: { x: 20, y: 20 },
  });
  state.entities = [circle];
  const grip = defaultGripProvider.grips(circle, true)[1]!;
  const session = new GripSession(state, ['circle'], [grip], grip);
  session.acceptText('25');
  expect(session.getResult().entities[0]).toMatchObject({ radius: 25 });
  const arc: CadEntity = {
    ...base,
    type: 'arc',
    center: { x: 0, y: 0 },
    radius: 10,
    startAngle: 0,
    endAngle: Math.PI,
    clockwise: true,
  };
  const stretched = defaultGripProvider.stretch(arc, ['mid'], { x: 0, y: 10 });
  if (stretched.type !== 'arc') throw new Error('Expected arc');
  expect(stretched.radius).toBeCloseTo(12.5, 12);
  expect(stretched.center.x).toBeCloseTo(0, 12);
  expect(stretched.center.y).toBeCloseTo(7.5, 12);
  expect(stretched.clockwise).toBe(true);
  const start = defaultGripProvider.stretch(arc, ['start'], { x: 5, y: -5 });
  if (start.type !== 'arc') throw new Error('Expected arc');
  expect(start.center.x + start.radius * Math.cos(start.startAngle)).toBeCloseTo(15, 9);
  expect(start.center.y + start.radius * Math.sin(start.startAngle)).toBeCloseTo(-5, 9);
  const text: CadEntity = {
    ...base,
    type: 'text',
    point: { x: 1, y: 2, z: 3 },
    text: '한국어',
    textSize: 5,
    rotation: 0,
  };
  expect(defaultGripProvider.stretch(text, ['point'], { x: 10, y: -20, z: 30 })).toMatchObject({
    point: { x: 11, y: -18, z: 33 },
  });
  const dimension: CadEntity = {
    ...base,
    type: 'dimension',
    kind: 'aligned',
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
    offset: 20,
    precision: 2,
    dimScale: 1,
    textSize: 5,
    arrowSize: 3,
    extensionGap: 1,
    extensionOvershoot: 2,
    unit: 'mm',
  };
  expect(defaultGripProvider.stretch(dimension, ['a'], { x: 10, y: 5 })).toMatchObject({
    a: { x: 10, y: 5 },
    b: { x: 100, y: 0 },
    offset: 20,
  });
  expect(defaultGripProvider.stretch(dimension, ['offset'], { x: 10, y: 5 })).toMatchObject({
    offset: 25,
  });
});

it('retains converted polyline bulges through normalization, exact arc midpoint snapping and supported DXF round trips', () => {
  const state = createEmptyCadState();
  const polyline = draftPolyline(
    state.settings,
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ],
    false,
    false,
    'polyline',
  );
  const grip = defaultGripProvider.grips(polyline, true)[0]!;
  const curved = applyGripAction(polyline, grip, 'convertArc', { x: 50, y: -50 }) as CadPolyline;
  expect(curved.bulges?.[0]).toBeCloseTo(1, 12);
  const mid = gripPolylineMidpoint(curved, 0);
  expect(mid.x).toBeCloseTo(50, 9);
  expect(mid.y).toBeCloseTo(-50, 9);
  state.entities = [curved];
  const restored = normalizeCadState(JSON.parse(JSON.stringify(state)));
  expect((restored.entities[0] as CadPolyline).bulges).toEqual(curved.bulges);
  const snap = querySnapCandidates(
    new SnapIndex(legacyEntitySnapSources(restored.entities[0]!)),
    { x: 50, y: -50 },
    0.01,
    snapModeBits.midpoint,
  )[0];
  expect(snap?.point.x).toBeCloseTo(50, 9);
  expect(snap?.point.y).toBeCloseTo(-50, 9);
  const runtime = getLegacyRuntime();
  const dxf = runtime.core.cadExporters.toDxf(restored);
  const loaded = runtime.core.cadImporters.parseDxf(dxf).state.entities[0] as CadPolyline;
  expect(loaded.type).toBe('polyline');
  expect(JSON.stringify(loaded.points)).toEqual(JSON.stringify(curved.points));
  expect(loaded.bulges?.[0]).toBeCloseTo(1, 12);
  const stretched = defaultGripProvider.stretch(curved, ['s0'], { x: 0, y: -25 }) as CadPolyline;
  expect(stretched.points).toEqual(curved.points);
  expect(stretched.bulges?.[0]).toBeCloseTo(1.5, 9);
  const arcMid = gripPolylineMidpoint(stretched, 0);
  expect(arcMid.x).toBeCloseTo(50, 9);
  expect(arcMid.y).toBeCloseTo(-75, 9);
});

it('mirrors polyline bulges and arcs, scales radii/styles, and respects MIRRTEXT', () => {
  const state = createEmptyCadState(),
    base = draftEntityBase(state.settings);
  const polyline: CadPolyline = {
    ...base,
    type: 'polyline',
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    closed: false,
    bulges: [1, 0],
  };
  expect(transformGripEntity(polyline, 'MIRROR', { x: 0, y: 0 }, { x: 10, y: 0 })).toMatchObject({
    bulges: [-1, -0],
  });
  const circle = draftCircle(state.settings, { x: 10, y: 0 }, 5);
  expect(transformGripEntity(circle, 'SCALE', { x: 0, y: 0 }, 2)).toMatchObject({
    center: { x: 20, y: 0 },
    radius: 10,
  });
  const text: CadEntity = {
    ...base,
    type: 'text',
    point: { x: 10, y: 20 },
    text: '한글',
    textSize: 5,
    rotation: Math.PI / 6,
  };
  expect(transformGripEntity(text, 'MIRROR', { x: 0, y: 0 }, { x: 10, y: 0 }, false)).toMatchObject(
    { point: { x: 10, y: -20 }, rotation: Math.PI / 6 },
  );
  expect(transformGripEntity(text, 'MIRROR', { x: 0, y: 0 }, { x: 10, y: 0 }, true)).toMatchObject({
    rotation: -Math.PI / 6,
  });
});

it('uses one block insertion grip with GRIPBLOCK=0, children with 1, and retains transformed/copied block metadata', () => {
  const state = createEmptyCadState();
  state.entities = [
    draftLine(state.settings, { x: 0, y: 0 }, { x: 100, y: 0 }, 'line'),
    draftCircle(state.settings, { x: 30, y: -20 }, 5, 'circle'),
  ];
  state.clipboardBlocks = [
    { name: '*U1', basePoint: { x: 10, y: -10 }, entityIds: ['line', 'circle'] },
  ];
  const settings = { grips: 2, limit: 1, multifunctional: 3, block: 0 };
  const grips = collectEntityGrips(state, ['line', 'circle'], settings);
  expect(grips).toHaveLength(1);
  expect(grips[0]).toMatchObject({
    key: 'block:*U1',
    point: { x: 10, y: -10 },
    entityIds: ['line', 'circle'],
  });
  expect(collectEntityGrips(state, ['line', 'circle'], { ...settings, block: 1 })).toHaveLength(8);
  const grip = grips[0]!,
    session = new GripSession(state, ['line', 'circle'], [grip], grip);
  session.acceptPoint({ x: 60, y: -30 });
  expect(session.getResult().entities[0]).toMatchObject({
    a: { x: 50, y: -20 },
    b: { x: 150, y: -20 },
  });
  expect(session.getResult().entities[1]).toMatchObject({ center: { x: 80, y: -40 } });
  expect(session.getResult().clipboardBlocks?.[0]?.basePoint).toEqual({ x: 60, y: -30 });
  const copy = new GripSession(state, ['line', 'circle'], [grip], grip);
  copy.setMode('SCALE');
  copy.acceptText('C');
  copy.acceptText('2');
  expect(copy.getResult().clipboardBlocks).toHaveLength(2);
  const copiedBlock = copy.getResult().clipboardBlocks![1]!;
  expect(copiedBlock.name).not.toBe('*U1');
  expect(copiedBlock.basePoint).toEqual({ x: 10, y: -10 });
  expect(copiedBlock.entityIds).toEqual(
    copy
      .getResult()
      .entities.slice(2)
      .map((entity) => entity.id),
  );
  copy.acceptText('U');
  expect(copy.getResult().clipboardBlocks).toHaveLength(1);
});

it('uses the group bounding center grip for GROUPDISPLAYMODE 1/2 and object grips for 0 or disabled PICKSTYLE', () => {
  const state = createEmptyCadState();
  state.entities = [
    draftLine(state.settings, { x: 0, y: 0 }, { x: 100, y: 0 }, 'a'),
    draftLine(state.settings, { x: 0, y: 40 }, { x: 100, y: 40 }, 'b'),
  ];
  state.groups = [{ name: 'Frame', description: '', selectable: true, ids: ['a', 'b'] }];
  const settings = { grips: 2, limit: 100, multifunctional: 3, groupMode: 2, pickstyle: 1 };
  const grips = collectEntityGrips(state, ['a', 'b'], settings);
  expect(grips).toHaveLength(1);
  expect(grips[0]).toMatchObject({
    point: { x: 50, y: 20 },
    key: 'group:Frame',
    entityIds: ['a', 'b'],
  });
  expect(collectEntityGrips(state, ['a', 'b'], { ...settings, groupMode: 1 })).toHaveLength(1);
  expect(collectEntityGrips(state, ['a', 'b'], { ...settings, groupMode: 0 })).toHaveLength(6);
  expect(collectEntityGrips(state, ['a', 'b'], { ...settings, pickstyle: 0 })).toHaveLength(6);
  const grip = grips[0]!,
    session = new GripSession(state, ['a', 'b'], [grip], grip);
  session.acceptPoint({ x: 70, y: 40 });
  expect(session.getResult().entities).toMatchObject([
    { a: { x: 20, y: 20 }, b: { x: 120, y: 20 } },
    { a: { x: 20, y: 60 }, b: { x: 120, y: 60 } },
  ]);
  const copy = new GripSession(state, ['a', 'b'], [grip], grip);
  copy.setMode('MOVE');
  copy.acceptText('C');
  copy.acceptPoint({ x: 70, y: 40 });
  copy.acceptPoint({ x: 90, y: 60 });
  expect(copy.getResult().groups).toHaveLength(3);
  expect(new Set(copy.getResult().groups!.map((group) => group.name)).size).toBe(3);
  expect(copy.getResult().groups![1]!.ids).toEqual(
    copy
      .getResult()
      .entities.slice(2, 4)
      .map((entity) => entity.id),
  );
  expect(copy.getSnapEntities()).toHaveLength(4);
  copy.acceptText('U');
  expect(copy.getResult().groups).toHaveLength(2);
  expect(copy.getSnapEntities()).toHaveLength(2);
});
