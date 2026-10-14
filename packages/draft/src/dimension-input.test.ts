import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState, normalizeCadState } from '@hancad/legacy-bridge';
import type { CadDimension, CadEntity } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { DimensionSession, dimensionGeometry } from './index';
import type { DimensionTool } from './index';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

function setup(tool: DimensionTool) {
  const commits: CadEntity[][] = [];
  const session = new DimensionSession(tool, createEmptyCadState().settings, {
    onCommit: (entities) => commits.push(entities),
  });
  const dimension = (): CadDimension => {
    const entity = commits[0]?.[0];
    if (entity?.type !== 'dimension') throw new Error('Expected one dimension');
    return entity;
  };
  return { session, commits, dimension };
}

describe('dimension point and object picking', () => {
  it('accepts direct distance along the cursor direction without changing model units', () => {
    const { session, dimension } = setup('DIMALIGNED');
    session.acceptPick({ x: 200000000, y: -450000000 });
    session.moveCursor({ x: 200000030, y: -450000040 });
    expect(session.acceptText('100').status).toBe('continue');
    expect(session.getSnapshot().points[1]).toEqual({ x: 200000060, y: -450000080 });
    session.acceptPick({ x: 200000100, y: -450000120 });
    expect(dimensionGeometry(dimension())?.measurement).toBeCloseTo(100);
  });

  it('does not fabricate a direction when the cursor is missing or on the previous point', () => {
    const { session, commits } = setup('DIMLINEAR');
    session.acceptText('0,0');
    expect(session.acceptText('100')).toMatchObject({ error: 'point' });
    session.moveCursor({ x: 0, y: 0 });
    expect(session.acceptText('100')).toMatchObject({ error: 'point' });
    expect(session.getSnapshot().prompt).toBe('secondPoint');
    expect(commits).toEqual([]);
  });

  it('keeps object-selection prompts active after an empty click', () => {
    for (const [tool, error] of [
      ['DIMLINEAR', 'selectDimensionObject'],
      ['DIMALIGNED', 'selectDimensionObject'],
      ['DIMRADIUS', 'selectCircle'],
      ['DIMDIAMETER', 'selectCircle'],
      ['DIMANGULAR', 'selectLineOrArc'],
    ] as const) {
      const { session, commits } = setup(tool);
      if (session.getSnapshot().prompt === 'firstPoint') session.finish();
      expect(session.acceptPick({ x: 30, y: 40 })).toMatchObject({ error });
      expect(session.getSnapshot()).toMatchObject({ prompt: 'selectObject', points: [] });
      expect(commits).toEqual([]);
    }
  });

  it('keeps smart DIM point entry and selected rectangle-edge measurement working', () => {
    const smart = setup('DIM');
    smart.session.acceptPick({ x: 0, y: 0 });
    smart.session.acceptPick({ x: 100, y: 0 });
    smart.session.acceptPick({ x: 50, y: -30 });
    expect(dimensionGeometry(smart.dimension())?.measurement).toBe(100);

    const rectangle = normalizeCadState({
      entities: [
        {
          type: 'rect',
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 60 },
            { x: 0, y: 60 },
          ],
          closed: true,
        },
      ],
    }).entities[0];
    if (!rectangle) throw new Error('Missing rectangle');
    const aligned = setup('DIMALIGNED');
    aligned.session.finish();
    aligned.session.acceptPick({ x: 99, y: 30 }, rectangle);
    aligned.session.acceptPick({ x: 130, y: 30 });
    expect(dimensionGeometry(aligned.dimension())?.measurement).toBe(60);
    expect(aligned.session.acceptPick({ x: 0, y: 0 })).toMatchObject({ error: 'closedSession' });
  });
});
