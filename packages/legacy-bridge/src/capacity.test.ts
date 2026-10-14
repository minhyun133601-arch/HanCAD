import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAD_ENTITY_LIMIT,
  createEmptyCadState,
  getLegacyRuntime,
  normalizeCadState,
  readCadFile,
  drawingBounds,
  visibleCadEntities,
} from './index';
import { createTestRuntime } from './test-runtime';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

describe('large drawing capacity is explicit and consistent', () => {
  it('imports and restores 20,001 supported entities without the previous silent truncation', async () => {
    const count = 20001;
    const record = '0\nLINE\n10\n0\n20\n0\n11\n100\n21\n50\n';
    const dxf = '0\nSECTION\n2\nENTITIES\n' + record.repeat(count) + '0\nENDSEC\n0\nEOF\n';
    const result = await readCadFile(new File([dxf], 'large.dxf'));
    expect(result.report.imported).toBe(count);
    expect(result.report.skipped).toBe(0);
    expect(result.state.entities).toHaveLength(count);
    const reloaded = normalizeCadState(result.state);
    expect(reloaded.entities).toHaveLength(count);
    expect(reloaded.entities.at(-1)?.id).toBe(`import-${count}`);
    expect(getLegacyRuntime().core.cadEngine.ENTITY_LIMIT).toBe(CAD_ENTITY_LIMIT);
  });

  it('rejects over-capacity state explicitly without changing an existing drawing', () => {
    const existing = createEmptyCadState();
    const before = JSON.stringify(existing);
    const line = { type: 'line', a: { x: 0, y: 0 }, b: { x: 100, y: 50 } };
    const overflow = { ...existing, entities: Array(CAD_ENTITY_LIMIT + 1).fill(line) as unknown[] };
    expect(() => normalizeCadState(overflow)).toThrow(CAD_ENTITY_LIMIT.toLocaleString());
    expect(() => getLegacyRuntime().core.cadEngine.normalizeState(overflow)).toThrow(
      CAD_ENTITY_LIMIT.toLocaleString(),
    );
    expect(JSON.stringify(existing)).toBe(before);
  });

  it('streams large mixed drawing bounds and ignores hidden extents without changing geometry', () => {
    const lines = Array.from({ length: 20001 }, (_, index) => ({
      type: 'line',
      a: { x: index, y: 0 },
      b: { x: index + 5, y: 120 },
    }));
    const state = normalizeCadState({
      layers: [{ name: 'hidden', visible: false }],
      entities: [
        ...lines,
        { type: 'circle', center: { x: -100, y: 100 }, radius: 25 },
        {
          type: 'arc',
          center: { x: -300, y: -200 },
          radius: 40,
          startAngle: 0,
          endAngle: Math.PI / 2,
          clockwise: true,
        },
        {
          type: 'polyline',
          points: [
            { x: -350, y: -250 },
            { x: -100, y: 0 },
          ],
          closed: false,
        },
        { type: 'text', point: { x: -320, y: -200 }, text: '한글 검사', textSize: 2 },
        {
          type: 'dimension',
          kind: 'horizontal',
          a: { x: 0, y: 0 },
          b: { x: 100, y: 0 },
          offset: -20,
        },
        { type: 'line', a: { x: 1e9, y: 1e9 }, b: { x: 1e9 + 100, y: 1e9 + 100 }, layer: 'hidden' },
      ],
    });
    const expected = { minX: -350, minY: -250, maxX: 20005, maxY: 125 };
    expect(drawingBounds(state)).toMatchObject(expected);
    expect(getLegacyRuntime().core.cadEngine.bounds(visibleCadEntities(state))).toMatchObject(
      expected,
    );
    expect(getLegacyRuntime().core.cadExporters.boundsOf(state, false).maxX).toBe(1e9 + 100);
    expect(state.entities).toHaveLength(20007);
  });
});
