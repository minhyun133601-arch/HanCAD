import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bulgeArc } from '@hancad/geom';
import { createEmptyCadState, normalizeCadState } from '@hancad/legacy-bridge';
import type { CadPoint, CadPolyline } from '@hancad/legacy-bridge';
import { SystemVariables } from '@hancad/sysvars';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { cloudEntity } from './draw-cloud-geometry';
import { outlineContext } from './draw-outline-fixtures';
import { collectEntityGrips, gripProvider } from './grip-providers';
import { GripSession } from './grip-session';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

function fixture(reversed = false) {
  const entity = cloudEntity(
    outlineContext(),
    [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 20 },
      { x: 0, y: 20 },
    ],
    true,
    { chord: 5, calligraphy: true, variance: false, reversed },
    'cloud',
  );
  const state = { ...createEmptyCadState(), entities: [entity] },
    variables = new SystemVariables();
  const grips = (level = 2) =>
    collectEntityGrips(state, [entity.id], {
      grips: level,
      limit: 100,
      multifunctional: 3,
      revcloudGrips: variables.getNumber('REVCLOUDGRIPS'),
    });
  return { entity, state, variables, grips };
}

function expectValid(entity: CadPolyline): void {
  expect(normalizeCadState({ ...createEmptyCadState(), entities: [entity] }).entities[0]).toEqual(
    entity,
  );
}

describe('live REVCLOUDGRIPS display and exact individual arc editing', () => {
  it('switches the same selected cloud from corner grips to each arc and respects GRIPS levels', () => {
    const { entity, variables, grips } = fixture();
    expect(variables.getNumber('REVCLOUDGRIPS')).toBe(1);
    expect(grips().map((grip) => grip.key)).toEqual(['cloud0', 'cloud1', 'cloud2', 'cloud3']);
    variables.set('REVCLOUDGRIPS', 0);
    const individual = grips();
    expect(individual.filter((grip) => grip.kind === 'vertex')).toHaveLength(entity.points.length);
    expect(individual.filter((grip) => grip.kind === 'midpoint')).toHaveLength(
      entity.points.length,
    );
    expect(grips(1).map((grip) => grip.key)).toEqual(entity.points.map((_, i) => `v${i}`));
    expect(grips(0)).toEqual([]);
    variables.set('REVCLOUDGRIPS', 1);
    expect(grips()).toHaveLength(4);
  });

  it('changes a chord endpoint without redistributing scallops or losing calligraphy widths', () => {
    const { entity } = fixture(),
      original = structuredClone(entity),
      result = gripProvider(entity).stretch(entity, ['v0'], { x: 1, y: -2, z: 3 });
    if (result.type !== 'polyline') throw new Error('Missing cloud');
    expect(result.points[0]).toEqual({ x: 1, y: -2, z: 3 });
    expect(result.points.slice(1)).toEqual(entity.points.slice(1));
    expect(result.cloudVertices?.[0]).toEqual(result.points[0]);
    expect(result.cloudVertices?.slice(1)).toEqual(entity.cloudVertices?.slice(1));
    expect(result.bulges).toEqual(entity.bulges);
    expect(result.startWidths).toEqual(entity.startWidths);
    expect(result.endWidths).toEqual(entity.endWidths);
    expect(entity).toEqual(original);
    expectValid(result);
  });

  it('changes only the picked circular scallop through its moved midpoint in either direction', () => {
    for (const reversed of [false, true]) {
      const { entity, variables, grips } = fixture(reversed);
      variables.set('REVCLOUDGRIPS', 0);
      const middle = grips().find((grip) => grip.key === 's0')!.point,
        moved = { x: middle.x + 0.25, y: middle.y + (reversed ? 0.5 : -0.5) },
        result = gripProvider(entity).stretch(entity, ['s0'], {
          x: moved.x - middle.x,
          y: moved.y - middle.y,
        });
      if (result.type !== 'polyline') throw new Error('Missing cloud');
      expect(result.points).toEqual(entity.points);
      expect(result.bulges?.slice(1)).toEqual(entity.bulges?.slice(1));
      expect(result.bulges?.[0]).not.toBe(entity.bulges?.[0]);
      const arc = bulgeArc(result.points[0]!, result.points[1]!, result.bulges![0]!);
      if (!arc) throw new Error('Missing circular scallop');
      for (const point of [result.points[0]!, moved, result.points[1]!])
        expect(Math.hypot(point.x - arc.center.x, point.y - arc.center.y)).toBeCloseTo(
          arc.radius,
          10,
        );
      expect(Math.sign(arc.sweepAngle)).toBe(reversed ? -1 : 1);
      expect(result.cloudVertices).toEqual(entity.cloudVertices);
      expect(result.endWidths).toEqual(entity.endWidths);
      expectValid(result);
    }
  });

  it('routes an individual arc grip through preview and one accepted grip operation', () => {
    const { entity, state, variables, grips } = fixture();
    variables.set('REVCLOUDGRIPS', 0);
    const picked = grips().find((grip) => grip.key === 's0')!,
      session = new GripSession(state, [entity.id], [picked], picked),
      target: CadPoint = { x: picked.point.x, y: picked.point.y - 1 };
    session.moveCursor(target);
    const preview = session.getSnapshot().preview;
    expect(preview).toHaveLength(1);
    expect(state.entities[0]).toBe(entity);
    expect(session.acceptPoint(target)).toMatchObject({ finish: true, accepted: true });
    const result = session.getResult();
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]).toEqual(preview[0]);
    expect(result.entities[0]).not.toEqual(entity);
    expectValid(result.entities[0] as CadPolyline);
  });
});
