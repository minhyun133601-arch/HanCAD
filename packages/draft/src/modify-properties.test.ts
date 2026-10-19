import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { CadEntity } from '@hancad/legacy-bridge';
import { normalizeCadState } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import { draftLine, draftPolyline } from './entities';
import { propertyFactories, modifyProperty } from './modify-properties';
import { overkillEntities, overkillFactories } from './modify-overkill';
import type { OverkillOptions } from './modify-overkill';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const context = outlineContext();
  const line = draftLine(context.settings, { x: 0, y: 0 }, { x: 10, y: 0 }, 'a');
  return {
    ...context,
    entities: [line],
    selectedIds: ['a'],
    layers: [
      { name: '0', color: '#fff', locked: false, visible: true },
      { name: '치수', color: '#f00', locked: false, visible: true },
    ],
  };
}
const cleanup = (): OverkillOptions => ({
  tolerance: 1e-6,
  ignore: new Set(),
  optimizePolylines: true,
  ignoreWidths: false,
  keepPolylines: true,
  partialOverlap: true,
  endToEnd: true,
  maintainAssociativity: true,
});
describe('Phase07 properties, display order and cleanup', () => {
  it('CHPROP edits Korean layer, true color and rounded predefined lineweight in one result', () => {
    const c = fixture();
    const result = outlineRun(
      propertyFactories.CHPROP!,
      ['LA', '치수', 'C', 'T', '12,34,56', 'LW', '0.26', 'TR', '35', ''],
      c,
    );
    expect(result.eraseIds).toEqual(['a']);
    expect(result.entities[0]).toMatchObject({
      id: 'a',
      layer: '치수',
      color: '#0c2238',
      trueColor: 0x0c2238,
      lineweight: 25,
      transparency: 35,
    });
    expect(c.entities[0]).toMatchObject({ layer: '0' });
  });
  it('invalid property values do not mutate source geometry; ByLayer clears true color', () => {
    const c = fixture();
    expect(modifyProperty(c, c.entities, 'LAYER', 'missing')).toBeUndefined();
    expect(modifyProperty(c, c.entities, 'TRANSPARENCY', '91')).toBeUndefined();
    const rgb = modifyProperty(c, c.entities, 'COLOR', '#abcdef')!;
    expect(modifyProperty(c, rgb, 'COLOR', 'ByLayer')![0]).toMatchObject({ aci: 256 });
    expect(modifyProperty(c, rgb, 'COLOR', 'ByLayer')![0]?.trueColor).toBeUndefined();
  });
  it('CHANGE moves the nearest LINE endpoint and Properties changes elevation without XY drift', () => {
    const c = fixture();
    expect(outlineRun(propertyFactories.CHANGE!, [{ x: 12, y: -4 }], c).entities[0]).toMatchObject({
      a: { x: 0, y: 0 },
      b: { x: 12, y: -4 },
    });
    expect(
      outlineRun(propertyFactories.CHANGE!, ['P', 'E', '20', ''], c).entities[0],
    ).toMatchObject({ a: { x: 0, y: 0, z: 20 }, b: { x: 10, y: 0, z: 20 } });
  });
  it('DRAWORDER changes relative order with Above and absolute order with Back', () => {
    const c = fixture(),
      b: CadEntity = { ...c.entities[0]!, id: 'b' },
      d: CadEntity = { ...b, id: 'd' };
    c.entities = [b, ...c.entities, d];
    expect(
      outlineRun(propertyFactories.DRAWORDER!, ['A', { entity: d, point: { x: 0, y: 0 } }, ''], c)
        .orderIds,
    ).toEqual(['b', 'd', 'a']);
    expect(outlineRun(propertyFactories.DRAWORDER!, [''], c).orderIds).toEqual(['a', 'b', 'd']);
  });
  it('OVERKILL merges reversed overlaps and contiguous LINEs while respecting ignored properties', () => {
    const c = fixture(),
      a = c.entities[0]!;
    if (a.type !== 'line') throw Error('Expected LINE');
    const b = { ...a, id: 'b', a: { x: 20, y: 0 }, b: { x: 8, y: 0 } },
      d = { ...a, id: 'd', a: { x: 20, y: 0 }, b: { x: 30, y: 0 }, layer: '치수' };
    const options = cleanup();
    expect(overkillEntities([a, b, d], options)).toHaveLength(2);
    options.ignore = new Set(['LAYER']);
    expect(overkillEntities([a, b, d], options)).toMatchObject([
      { a: { x: 0, y: 0 }, b: { x: 30, y: 0 } },
    ]);
    expect(
      outlineRun(overkillFactories.OVERKILL!, [''], {
        ...c,
        entities: [a, b],
        selectedIds: ['a', 'b'],
      }).entities,
    ).toHaveLength(1);
  });
  it('OVERKILL compares reversed and rotated closed polylines with widths', () => {
    const c = fixture(),
      a = draftPolyline(
        c.settings,
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        true,
        false,
        'p',
      );
    if (a.type !== 'polyline') throw Error('Expected polyline');
    const b = { ...a, id: 'q', points: [...a.points.slice(1), a.points[0]!] };
    expect(overkillEntities([a, b], cleanup())).toHaveLength(1);
    const wide = { ...b, constantWidth: 2 };
    expect(overkillEntities([a, wide], cleanup())).toHaveLength(2);
    expect(overkillEntities([a, wide], { ...cleanup(), ignoreWidths: true })).toHaveLength(1);
  });
  it('material, thickness and annotative metadata survive recovery normalization', () => {
    const c = fixture();
    const result = outlineRun(
      propertyFactories.CHPROP!,
      ['T', '12', 'M', 'Steel', 'A', 'Y', ''],
      c,
    );
    expect(normalizeCadState({ ...c, entities: result.entities }).entities[0]).toMatchObject({
      thickness: 12,
      material: 'Steel',
      annotative: true,
    });
  });
});
