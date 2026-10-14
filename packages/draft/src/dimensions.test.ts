import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyCadState,
  drawingToDxf,
  drawingToSvg,
  getLegacyRuntime,
  normalizeCadState,
} from '@hancad/legacy-bridge';
import type { CadDimension, CadEntity, CadSettings } from '@hancad/legacy-bridge';
import { SystemVariables } from '@hancad/sysvars';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import {
  DimensionSession,
  angularDimension,
  applyDimensionStyle,
  dimensionGeometry,
  dimensionSettingsFromVariables,
  linearDimension,
  radialDimension,
} from './index';
import type { DimensionTool } from './index';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

function setup(tool: DimensionTool, patch: Partial<CadSettings> = {}) {
  const commits: CadEntity[][] = [];
  const settings = { ...createEmptyCadState().settings, ...patch };
  const session = new DimensionSession(tool, settings, {
    onCommit: (entities) => commits.push(entities),
  });
  const result = () => {
    const entity = commits[0]?.[0];
    if (entity?.type !== 'dimension') throw new Error('Expected one dimension');
    return entity;
  };
  return { session, commits, result, settings };
}

describe('usable dimension command sessions', () => {
  it('creates one measured linear dimension after preview and keeps survey coordinates exact', () => {
    const { session, commits, result } = setup('DIMLINEAR');
    expect(session.acceptText('200000000,450000000').status).toBe('continue');
    session.acceptText('@100,50');
    session.moveCursor({ x: 200000060, y: -450000080 });
    const preview = session.getSnapshot().preview[0];
    expect(preview?.type).toBe('dimension');
    if (preview?.type === 'dimension') expect(dimensionGeometry(preview)?.measurement).toBe(100);
    expect(commits).toHaveLength(0);
    expect(session.acceptText('200000060,450000080').status).toBe('committed');
    expect(commits).toHaveLength(1);
    expect(result()).toMatchObject({
      kind: 'horizontal',
      a: { x: 200000000, y: -450000000 },
      b: { x: 200000100, y: -450000050 },
    });
    expect(dimensionGeometry(result())?.measurement).toBe(100);
    expect(session.getSnapshot().preview).toEqual([]);
    expect(session.acceptPoint({ x: 0, y: 0 })).toMatchObject({ error: 'closedSession' });
  });

  it('supports Horizontal, Vertical, Rotated and explicit text/text-angle options', () => {
    const vertical = setup('DIMLINEAR');
    vertical.session.acceptText('0,0');
    vertical.session.acceptText('100,50');
    vertical.session.acceptText('V');
    vertical.session.acceptText('150,25');
    expect(dimensionGeometry(vertical.result())?.measurement).toBeCloseTo(50);
    const rotated = setup('DIMLINEAR');
    rotated.session.acceptText('0,0');
    rotated.session.acceptText('100,100');
    rotated.session.acceptText('R');
    expect(rotated.session.getSnapshot().inputMode).toBe('number');
    expect(rotated.session.acceptText('bad')).toMatchObject({ error: 'invalidAngle' });
    rotated.session.acceptText('45');
    rotated.session.acceptText('T');
    expect(rotated.session.getSnapshot().inputMode).toBe('text');
    rotated.session.acceptText('실측 <> ±0.2');
    rotated.session.acceptText('A');
    rotated.session.acceptText('30');
    rotated.session.acceptText('50,100');
    expect(dimensionGeometry(rotated.result())?.measurement).toBeCloseTo(Math.sqrt(20000));
    expect(dimensionGeometry(rotated.result())?.label).toBe('실측 141.42 ±0.2');
    expect(dimensionGeometry(rotated.result())?.rotation).toBeCloseTo(-Math.PI / 6);
    const suppressed = setup('DIMLINEAR');
    suppressed.session.acceptText('0,0');
    suppressed.session.acceptText('100,0');
    suppressed.session.acceptText('T');
    suppressed.session.acceptText(' ');
    suppressed.session.acceptText('50,30');
    expect(dimensionGeometry(suppressed.result())?.label).toBe(' ');
  });

  it('aligned dimensions measure Euclidean distance; display scale never changes geometry or length', () => {
    const one = setup('DIMALIGNED');
    one.session.acceptText('0,0');
    one.session.acceptText('30,40');
    one.session.acceptText('30,60');
    const larger = setup('DIMALIGNED', { dimScale: 3 });
    larger.session.acceptText('0,0');
    larger.session.acceptText('30,40');
    larger.session.acceptText('30,60');
    const original = dimensionGeometry(one.result()),
      scaled = dimensionGeometry(larger.result());
    expect(original?.measurement).toBe(50);
    expect(scaled?.measurement).toBe(50);
    expect(scaled?.q1).toEqual(original?.q1);
    expect(scaled?.q2).toEqual(original?.q2);
    expect(scaled?.textSize).toBe((original?.textSize ?? 0) * 3);
    expect(scaled?.arrowSize).toBe((original?.arrowSize ?? 0) * 3);
    const cancel = setup('DIMALIGNED');
    cancel.session.acceptText('0,0');
    cancel.session.acceptText('30,40');
    cancel.session.moveCursor({ x: 30, y: -60 });
    cancel.session.cancel();
    expect(cancel.commits).toEqual([]);
    expect(cancel.session.getSnapshot().preview).toEqual([]);
  });

  it('picks lines, circles and arcs; smart DIM previews the documented default types', () => {
    const state = normalizeCadState({
      entities: [
        { type: 'line', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
        { type: 'circle', center: { x: 0, y: 0 }, radius: 20 },
        {
          type: 'arc',
          center: { x: 100, y: 0 },
          radius: 30,
          startAngle: 0,
          endAngle: -Math.PI / 2,
          clockwise: false,
        },
      ],
    });
    const [line, circle, arc] = state.entities;
    if (!line || !circle || !arc) throw new Error('Missing fixture');
    for (const [entity, kind, placement] of [
      [line, 'horizontal', { x: 50, y: -30 }],
      [circle, 'diameter', { x: 35, y: 0 }],
      [arc, 'radius', { x: 140, y: 0 }],
    ] as const) {
      const { session, result } = setup('DIM');
      session.moveCursor(placement, entity);
      expect(session.getSnapshot().preview[0]).toMatchObject({ type: 'dimension', kind });
      session.acceptEntity(entity, placement);
      expect(session.getSnapshot().mode).toBe(kind === 'horizontal' ? 'linear' : 'radial');
      session.acceptPoint(placement);
      expect(result().kind).toBe(kind);
    }
    const radial = setup('DIMRADIUS');
    expect(radial.session.acceptEntity(line)).toMatchObject({ error: 'selectCircle' });
    radial.session.acceptEntity(circle);
    radial.session.acceptText('30,0');
    expect(dimensionGeometry(radial.result())?.label).toBe('R20.00');
    const diameter = setup('DIMDIAMETER');
    diameter.session.acceptEntity(arc);
    diameter.session.acceptText('150,0');
    expect(dimensionGeometry(diameter.result())?.measurement).toBe(60);
    const selected = setup('DIMALIGNED');
    selected.session.finish();
    selected.session.acceptEntity(line);
    selected.session.acceptText('50,30');
    expect(dimensionGeometry(selected.result())?.measurement).toBe(100);
  });

  it('constructs angular dimensions from three points, two lines, arc endpoints and circle picks', () => {
    const three = setup('DIMANGULAR');
    three.session.finish();
    three.session.acceptText('0,0');
    three.session.acceptText('20,0');
    three.session.acceptText('0,20');
    three.session.acceptText('20,20');
    expect(dimensionGeometry(three.result())?.measurement).toBeCloseTo(90);
    const reflex = setup('DIMANGULAR');
    reflex.session.acceptText('0,0');
    reflex.session.acceptText('20,0');
    expect(reflex.session.acceptText('0,0')).toMatchObject({ error: 'zeroLength' });
    reflex.session.acceptText('0,20');
    reflex.session.acceptText('20,-20');
    expect(dimensionGeometry(reflex.result())?.measurement).toBeCloseTo(270);
    const fixture = normalizeCadState({
      entities: [
        { type: 'line', a: { x: -20, y: 0 }, b: { x: 20, y: 0 } },
        { type: 'line', a: { x: 0, y: -20 }, b: { x: 0, y: 20 } },
        { type: 'circle', center: { x: 0, y: 0 }, radius: 20 },
        {
          type: 'arc',
          center: { x: 0, y: 0 },
          radius: 20,
          startAngle: 0,
          endAngle: -Math.PI / 2,
          clockwise: false,
        },
      ],
    }).entities;
    const [first, second, circle, arc] = fixture;
    if (!first || !second || !circle || !arc) throw new Error('Missing angular fixture');
    const pair = setup('DIMANGULAR');
    pair.session.acceptEntity(first);
    expect(pair.session.acceptEntity(first)).toMatchObject({ error: 'parallelLines' });
    pair.session.acceptEntity(second);
    pair.session.acceptText('-20,20');
    expect(dimensionGeometry(pair.result())?.measurement).toBeCloseTo(90);
    const fromCircle = setup('DIMANGULAR');
    fromCircle.session.acceptEntity(circle, { x: 20, y: 0 });
    fromCircle.session.acceptText('0,20');
    fromCircle.session.acceptText('20,20');
    expect(dimensionGeometry(fromCircle.result())?.measurement).toBeCloseTo(90);
    const fromArc = setup('DIMANGULAR');
    fromArc.session.acceptEntity(arc);
    fromArc.session.acceptText('20,20');
    expect(dimensionGeometry(fromArc.result())?.measurement).toBeCloseTo(90);
  });

  it('applies live supported DIM variables without changing measured objects, and handles zero-sized arrows', () => {
    const vars = new SystemVariables();
    for (const [name, value] of Object.entries({
      DIMSCALE: 3,
      DIMTXT: 4,
      DIMASZ: 0,
      DIMDEC: 3,
      DIMEXO: 2,
      DIMEXE: 4,
      DIMGAP: 2,
      DIMLFAC: 2,
      DIMZIN: 12,
    }))
      vars.set(name, value);
    vars.set('DIMPOST', '폭 <> mm');
    const settings = dimensionSettingsFromVariables(
      createEmptyCadState().settings,
      (name) => vars.getNumber(name),
      (name) => String(vars.get(name)),
    );
    const entity = linearDimension(
      settings,
      'horizontal',
      { x: 0, y: 0 },
      { x: 1.25, y: 0 },
      { x: 0, y: -20 },
    );
    if (!entity) throw new Error('Missing styled dimension');
    const geometry = dimensionGeometry(entity);
    expect(geometry?.measurement).toBe(1.25);
    expect(geometry?.displayMeasurement).toBe(2.5);
    expect(geometry?.label).toBe('폭 2.5 mm');
    expect(geometry?.textSize).toBe(12);
    expect(geometry?.arrows).toEqual([]);
    expect(geometry?.lines[0]?.[0]).toEqual({ x: 0, y: -6 });
    expect(geometry?.lines[0]?.[1]).toEqual({ x: 0, y: -32 });
    const angular = angularDimension(
      settings,
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: -10 },
      { x: 10, y: -10 },
    );
    if (!angular) throw new Error('Missing angle');
    expect(dimensionGeometry(angular)?.displayMeasurement).toBeCloseTo(90);
    const restored = applyDimensionStyle(entity, {
      ...settings,
      dimMeasurementFactor: -2,
      dimPost: '',
      dimZeroSuppression: 0,
    });
    expect(dimensionGeometry(restored)?.label).toBe('1.250');
    expect(restored.a).toEqual(entity.a);
    expect(restored.b).toEqual(entity.b);
    expect(restored.id).toBe(entity.id);
  });

  it('round-trips all six kinds, measurement/style variables, Unicode text and rotation as editable DXF dimensions', () => {
    const settings = {
      ...createEmptyCadState().settings,
      dimScale: 2,
      dimTextSize: 3,
      arrowSize: 0,
      dimGap: 1.25,
      dimMeasurementFactor: 2,
      dimZeroSuppression: 8,
      dimPost: '검사 <> mm',
    };
    const a = { x: 0, y: 0 },
      b = { x: 100, y: -50 },
      p = { x: 10, y: -80 };
    const entities = [
      linearDimension(settings, 'horizontal', a, b, p, -Math.PI / 4),
      linearDimension(settings, 'vertical', a, b, p),
      linearDimension(settings, 'aligned', a, b, p),
      radialDimension(settings, 'radius', a, 20, { x: 40, y: 0 }),
      radialDimension(settings, 'diameter', a, 20, { x: 40, y: 0 }),
      angularDimension(settings, a, { x: 20, y: 0 }, { x: 0, y: -20 }, { x: 30, y: -30 }),
    ]
      .filter((entity): entity is CadDimension => Boolean(entity))
      .map((entity) => ({ ...entity, text: '공차 <> ±0.1', textRotation: -Math.PI / 6 }));
    const state = normalizeCadState({ ...createEmptyCadState(), entities });
    const dxf = drawingToDxf(state);
    expect(dxf).toContain('*D6');
    expect(dxf).toContain('DIMSTYLE');
    expect(dxf).toContain('공차');
    // Independent record inspection against Autodesk's DXF Reference, not our importer.
    const pairs = dxf.trimEnd().split(/\r?\n/);
    const tags: [number, string][] = [];
    for (let index = 0; index < pairs.length; index += 2)
      tags.push([Number(pairs[index]), pairs[index + 1] ?? '']);
    const records: [number, string][][] = [];
    for (const tag of tags) {
      if (tag[0] === 0) records.push([]);
      records.at(-1)?.push(tag);
    }
    const tagValue = (record: readonly [number, string][], code: number) =>
      record.find((tag) => tag[0] === code)?.[1];
    const dimensions = records.filter((record) => tagValue(record, 0) === 'DIMENSION');
    const styles = records.filter((record) => tagValue(record, 0) === 'DIMSTYLE');
    expect(dimensions.map((record) => Number(tagValue(record, 70)))).toEqual([
      32, 32, 33, 36, 35, 37,
    ]);
    expect(Number(tagValue(dimensions[0] ?? [], 50))).toBeCloseTo(45);
    for (const dimension of dimensions) {
      expect(Number(tagValue(dimension, 53))).toBeCloseTo(30);
      expect(
        records.some(
          (record) =>
            tagValue(record, 0) === 'BLOCK' && tagValue(record, 2) === tagValue(dimension, 2),
        ),
      ).toBe(true);
      const style = styles.find((record) => tagValue(record, 2) === tagValue(dimension, 3)) ?? [];
      expect(tagValue(style, 3)).toBe('검사 <> mm');
      expect(Number(tagValue(style, 40))).toBe(2);
      expect(Number(tagValue(style, 144))).toBe(2);
      expect(Number(tagValue(style, 147))).toBe(1.25);
      expect(Number(tagValue(style, 78))).toBe(8);
    }
    const associativity = tags.findIndex(([code, value]) => code === 9 && value === '$DIMASSOC');
    expect(tags[associativity + 1]).toEqual([280, '1']);
    expect(records.some((record) => tagValue(record, 0) === 'DIMASSOC')).toBe(false);
    const imported = getLegacyRuntime().core.cadImporters.parseDxf(dxf);
    expect(imported.report.skipped).toBe(0);
    expect(imported.state.entities).toHaveLength(6);
    imported.state.entities.forEach((entity, i) => {
      const original = entities[i];
      if (entity.type !== 'dimension' || !original) throw new Error('Expected editable dimension');
      expect(entity.kind).toBe(original.kind);
      expect(entity.arrowSize).toBe(0);
      expect(entity.textGap).toBe(1.25);
      expect(entity.measurementFactor).toBe(2);
      expect(entity.zeroSuppression).toBe(8);
      expect(dimensionGeometry(entity)?.measurement).toBeCloseTo(
        dimensionGeometry(original)?.measurement ?? 0,
        6,
      );
      expect(dimensionGeometry(entity)?.label).toBe(dimensionGeometry(original)?.label);
      expect(Math.cos(dimensionGeometry(entity)?.rotation ?? 0)).toBeCloseTo(
        Math.cos(-Math.PI / 6),
      );
    });
    const svg = drawingToSvg(imported.state);
    expect(svg).toContain('공차');
    expect(svg).toContain('±0.1');
    expect(svg).not.toContain('NaN');
  });
});
