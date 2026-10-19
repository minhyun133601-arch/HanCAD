import { describe, expect, it } from 'vitest';
import { geometryEvaluation } from '@hancad/geom';
import type { CadEntity, CadLine, CadPoint, CadText } from '@hancad/legacy-bridge';
import { draftCircle, draftLine, draftPolyline } from './entities';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import { DrawSession } from './draw-session';
import { transformFactories } from './modify-transform';
import { alignmentMatrix, affineEntity } from './modify-transform-align';
import { stretchEntities } from './modify-transform-stretch';
import type { DrawContext, DrawResult, DrawValue } from './draw-program';

const p = (x: number, y: number, z?: number): CadPoint => ({
  x,
  y: -y,
  ...(z === undefined ? {} : { z }),
});
function fixture(values: Record<string, number> = {}) {
  const c = outlineContext(values),
    line = draftLine(c.settings, p(0, 0), p(10, 0), 'L');
  return { ...c, entities: [line], selectedIds: [line.id] };
}
function run(name: string, inputs: DrawValue[], context: DrawContext = fixture()): DrawResult {
  return outlineRun(transformFactories[name]!, inputs, context);
}
const firstLine = (result: DrawResult): CadLine => {
  const e = result.entities[0];
  if (e?.type !== 'line') throw Error('Expected LINE');
  return e;
};
function close(p: CadPoint, x: number, y: number, z = 0) {
  expect(p.x).toBeCloseTo(x, 9);
  expect(-p.y).toBeCloseTo(y, 9);
  expect(p.z ?? 0).toBeCloseTo(z, 9);
}
describe('Phase 07 immutable transform command scripts', () => {
  it('MOVE uses first point as displacement, explicit Displacement, or two points and retains identity', () => {
    for (const inputs of [
      [p(2, 3), ''],
      ['D', p(2, 3)],
      [p(4, 5), p(6, 8)],
    ] as DrawValue[][]) {
      const result = run('MOVE', inputs);
      expect(result.eraseIds).toEqual(['L']);
      expect(firstLine(result).id).toBe('L');
      close(firstLine(result).a, 2, 3);
      close(firstLine(result).b, 12, 3);
    }
  });
  it('COPYMODE Single creates one fresh entity and mode Multiple stages one final batch', () => {
    const c = fixture({ COPYMODE: 1 }),
      single = run('COPY', [p(0, 0), p(5, 5)], c);
    expect(single.eraseIds).toBeUndefined();
    expect(single.entities).toHaveLength(1);
    expect(single.entities[0]!.id).not.toBe('L');
    const multiple = run('COPY', ['O', 'M', p(0, 0), p(5, 0), p(10, 0), 'U', p(15, 0), ''], c);
    expect(c.get('COPYMODE')).toBe(0);
    expect(multiple.entities).toHaveLength(2);
    close((multiple.entities[1] as CadLine).a, 15, 0);
    expect(new Set(multiple.entities.map((e) => e.id)).size).toBe(2);
  });
  it('COPY Array counts the source and supports equal incremental and Fit placement', () => {
    const c = fixture({ COPYMODE: 1 });
    const normal = run('COPY', [p(0, 0), 'A', '4', p(12, 0)], c),
      fit = run('COPY', [p(0, 0), 'A', '4', 'F', p(12, 0)], c);
    expect(normal.entities.map((e) => (e as CadLine).a.x)).toEqual([12, 24, 36]);
    expect(fit.entities.map((e) => (e as CadLine).a.x)).toEqual([4, 8, 12]);
  });
  it('COPY Esc retains only accepted copies and calls the transaction consumer once', () => {
    const commits: DrawResult[] = [],
      c = fixture({ COPYMODE: 0 });
    const session = new DrawSession('COPY', transformFactories.COPY!, {
      context: c,
      onComplete: (r) => commits.push(r),
    });
    session.acceptPoint(p(0, 0));
    session.acceptPoint(p(4, 0));
    session.acceptPoint(p(8, 0));
    session.moveCursor(p(12, 0));
    expect(commits).toHaveLength(0);
    expect(session.getSnapshot().preview).toHaveLength(3);
    session.cancel();
    expect(commits).toHaveLength(1);
    expect(commits[0]!.entities).toHaveLength(2);
    expect(commits[0]!.eraseIds).toEqual([]);
  });
  it('ROTATE Copy and Reference Points agree with an independent vector result', () => {
    const copied = run('ROTATE', [p(0, 0), 'C', '90']);
    expect(copied.eraseIds).toBeUndefined();
    close(firstLine(copied).b, 0, 10);
    const result = run('ROTATE', [p(0, 0), 'R', p(0, 0), p(1, 1), 'P', p(2, 3), p(2, 9)]);
    close(firstLine(result).b, Math.sqrt(50), Math.sqrt(50));
  });
  it('SCALE Copy and Reference accept two reference points and new length', () => {
    const result = run('SCALE', [p(2, 0), 'C', 'R', p(0, 0), p(10, 0), '25']);
    expect(result.eraseIds).toBeUndefined();
    close(firstLine(result).a, -3, 0);
    close(firstLine(result).b, 22, 0);
    close(firstLine(run('SCALE', [p(0, 0), 'R', '10', 'P', p(5, 0), p(5, 20)])).b, 20, 0);
  });
  it('MIRROR uses MIRRTEXT, reverses bulges, and optionally erases its sources', () => {
    const c = fixture({ MIRRTEXT: 1 }),
      text: CadText = {
        id: 'T',
        type: 'text',
        layer: '0',
        color: '#fff',
        lineWidth: 1,
        point: p(2, 0),
        rotation: 0,
        textSize: 2.5,
        text: '한글 ABC',
      };
    c.entities = [text];
    c.selectedIds = ['T'];
    const result = run('MIRROR', [p(0, 0), p(0, 10), 'Y'], c),
      mirrored = result.entities[0] as CadText;
    expect(result.eraseIds).toEqual(['T']);
    expect(mirrored.mirroredX).toBe(true);
    close(mirrored.point, -2, 0);
    expect(Math.cos(mirrored.rotation) * -1).toBeCloseTo(-1, 9);
    const curve = { ...draftPolyline(c.settings, [p(1, 0), p(4, 0)]), bulges: [1, 0] };
    c.entities = [curve];
    c.selectedIds = [curve.id];
    const poly = run('MIRROR', [p(0, 0), p(1, 0), ''], c).entities[0];
    expect(poly && 'bulges' in poly ? poly.bulges : []).toEqual([-1, -0]);
  });
  it('STRETCH combines crossing polygons, leaves external endpoints fixed, and moves circles by center', () => {
    const c = fixture(),
      circle = draftCircle(c.settings, p(8, 4), 1, 'C');
    c.entities.push(circle);
    c.selectedIds.push('C');
    const context: DrawContext = {
      ...c,
      selectionWindows: [
        { points: [p(9, -1), p(12, -1), p(12, 1), p(9, 1)], crossing: true },
        { points: [p(7, 3), p(9, 3), p(9, 5), p(7, 5)], crossing: true },
      ],
    };
    const result = run('STRETCH', [p(0, 0), p(5, 2)], context);
    close(firstLine(result).a, 0, 0);
    close(firstLine(result).b, 15, 2);
    const moved = result.entities[1];
    if (moved?.type !== 'circle') throw Error('Expected CIRCLE');
    close(moved.center, 13, 6);
    expect(firstLine(run('STRETCH', [p(0, 0), p(5, 2)], c)).a.x).toBe(5);
  });
  it('STRETCH edits exact polyline vertices and preserves widths and bulges', () => {
    const c = fixture(),
      poly: CadEntity = {
        ...(draftPolyline(c.settings, [p(0, 0), p(10, 0), p(10, 5)]) as Extract<
          CadEntity,
          { type: 'polyline' | 'rect' }
        >),
        bulges: [0.25, 0, 0],
        constantWidth: 2,
      };
    const context: DrawContext = {
      ...c,
      selectionWindows: [{ points: [p(9, -1), p(12, -1), p(12, 6), p(9, 6)], crossing: true }],
    };
    const result = stretchEntities(context, [poly], p(3, 0))[0]!;
    expect('points' in result ? result.points.map((v) => v.x) : []).toEqual([0, 13, 13]);
    expect('constantWidth' in result ? result.constantWidth : 0).toBe(2);
    expect('bulges' in result ? result.bulges : []).toEqual([0.25, 0, 0]);
  });
  it('STRETCH moves individually picked objects wholly while applying crossing masks to other objects', () => {
    const c = fixture(),
      second = draftLine(c.settings, p(0, 20), p(10, 20), 'S');
    const context: DrawContext = {
      ...c,
      entities: [...c.entities, second],
      selectedIds: ['L', 'S'],
      individuallySelectedIds: ['S'],
      selectionWindows: [{ points: [p(9, -1), p(12, -1), p(12, 1), p(9, 1)], crossing: true }],
    };
    const result = run('STRETCH', [p(0, 0), p(5, 2)], context);
    close(firstLine(result).a, 0, 0);
    close(firstLine(result).b, 15, 2);
    const moved = result.entities[1] as CadLine;
    close(moved.a, 5, 22);
    close(moved.b, 15, 22);
  });
  it('ALIGN two pairs scales only after Yes and three pairs map a full 3D frame without scaling', () => {
    const result = run('ALIGN', [p(0, 0), p(20, 30), p(10, 0), p(20, 50), '', 'Y']);
    close(firstLine(result).a, 20, 30);
    close(firstLine(result).b, 20, 50);
    const c = fixture(),
      source = [p(0, 0, 0), p(1, 0, 0), p(0, 1, 0)],
      target = [p(2, 3, 4), p(2, 3, 5), p(2, 4, 4)],
      matrix = alignmentMatrix(source, target)!;
    const e = affineEntity(
      {
        ...c.entities[0]!,
        curve: { type: 'LINE', start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } },
      },
      matrix,
    );
    const end = geometryEvaluation(e.curve!, 1).point;
    expect(end.x).toBeCloseTo(2, 9);
    expect(end.y).toBeCloseTo(3, 9);
    expect(end.z).toBeCloseTo(5, 9);
    const actual = run('ALIGN', [
      source[0]!,
      target[0]!,
      source[1]!,
      target[1]!,
      source[2]!,
      target[2]!,
    ]);
    close(firstLine(actual).b, 2, 3, 14);
  });
  it('ALIGN opposite planar directions rotates around Z and rejects collinear third pairs', () => {
    const matrix = alignmentMatrix([p(0, 0), p(1, 0)], [p(0, 0), p(-1, 0)])!;
    close(
      (affineEntity(draftLine(fixture().settings, p(0, 1), p(1, 1)), matrix) as CadLine).a,
      0,
      -1,
    );
    expect(
      alignmentMatrix([p(0, 0), p(1, 0), p(2, 0)], [p(0, 0), p(1, 0), p(0, 1)]),
    ).toBeUndefined();
  });
  it('every replacement command emits exactly one immutable erase-and-replace batch', () => {
    for (const [name, inputs] of [
      ['MOVE', [p(0, 0), p(1, 1)]],
      ['ROTATE', [p(0, 0), '90']],
      ['SCALE', [p(0, 0), '2']],
      ['STRETCH', [p(0, 0), p(1, 1)]],
      ['ALIGN', [p(0, 0), p(1, 1), '']],
    ] as [string, DrawValue[]][]) {
      const c = fixture(),
        before = structuredClone(c.entities),
        result = run(name, inputs, c);
      expect(c.entities).toEqual(before);
      expect(result.eraseIds).toEqual(['L']);
      expect(result.entities).toHaveLength(1);
    }
  });
});
