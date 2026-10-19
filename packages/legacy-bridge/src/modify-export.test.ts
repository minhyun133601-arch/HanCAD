import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRuntime } from './test-runtime';
import {
  createEmptyCadState,
  drawingToDxf,
  drawingToSvg,
  getLegacyRuntime,
  normalizeCadState,
  readCadFile,
} from './bridge';
import type { CadEntity, CadText } from './types';
import { outlineContext, outlineRun } from '../../draft/src/draw-outline-fixtures';
import { mirrorProgram } from '../../draft/src/modify-transform-stretch';
import { modifyProperty } from '../../draft/src/modify-properties';
import { legacyDisplayGeometry, distanceToGeometry, boundsOfGeometry } from '@hancad/render';
import { textCorners } from '../../render/src/display/text';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
const text: CadText = {
  id: 'text',
  type: 'text',
  layer: '0',
  color: '#ffffff',
  lineWidth: 1,
  point: { x: 10, y: 0 },
  text: 'ABC 한글',
  textSize: 5,
  rotation: 0,
};
const line: CadEntity = {
  id: 'line',
  type: 'line',
  layer: '0',
  color: '#00ff00',
  lineWidth: 1,
  a: { x: 0, y: 0 },
  b: { x: 100, y: 0 },
};
function nativeOnly(source: string): string {
  return source.replace(/0\r\nSECTION\r\n2\r\nOBJECTS\r\n[\s\S]*?0\r\nENDSEC\r\n/, '');
}
function tags(source: string, type: string): Map<number, string> {
  const lines = source.split(/\r?\n/),
    index = lines.findIndex((s, i) => s === '0' && lines[i + 1] === type),
    result = new Map<number, string>();
  for (let i = index + 2; i < lines.length - 1 && lines[i] !== '0'; i += 2)
    result.set(Number(lines[i]), lines[i + 1]!);
  return result;
}
function canvas() {
  const strokes: {
      color: string | CanvasGradient | CanvasPattern;
      opacity: number;
      width: number;
    }[] = [],
    dash = vi.fn(),
    scale = vi.fn(),
    fillText = vi.fn();
  const context = {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale,
    fillText,
    setLineDash: dash,
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: () =>
      strokes.push({
        color: context.strokeStyle,
        opacity: context.globalAlpha,
        width: context.lineWidth,
      }),
  };
  return {
    context: context as unknown as CanvasRenderingContext2D,
    strokes,
    dash,
    scale,
    fillText,
  };
}
describe('Phase07 modify properties survive actual supported exports', () => {
  it.each([0, 1])(
    'MIRRTEXT %i preserves its result in native TEXT71, SVG, raster, display and recovery',
    async (mirrtext) => {
      const context = outlineContext({ MIRRTEXT: mirrtext });
      context.entities = [text];
      context.selectedIds = [text.id];
      const mirrored = outlineRun(mirrorProgram, [{ x: 0, y: -10 }, { x: 0, y: 10 }, 'Y'], context)
        .entities[0];
      if (mirrored?.type !== 'text') throw new Error('Expected text');
      expect(mirrored.mirroredX ?? false).toBe(mirrtext === 1);
      const state = createEmptyCadState();
      state.entities = [mirrored];
      const dxf = drawingToDxf(state);
      expect(tags(dxf, 'TEXT').get(71) ?? '0').toBe(mirrtext ? '2' : '0');
      const native = await readCadFile(new File([nativeOnly(dxf)], 'mirror-native.dxf')),
        restored = native.state.entities[0];
      expect(restored).toMatchObject({ type: 'text', text: text.text });
      if (restored?.type !== 'text') throw new Error('Expected text');
      expect(restored.mirroredX ?? false).toBe(mirrtext === 1);
      expect(native.report.approximated).toBe(0);
      expect(drawingToSvg(state).includes('scale(-1 1)')).toBe(mirrtext === 1);
      const f = canvas();
      getLegacyRuntime().core.cadExporters.drawEntity(f.context, mirrored, {});
      expect(f.scale.mock.calls.some(([x, y]) => x === -1 && y === 1)).toBe(mirrtext === 1);
      expect(f.fillText).toHaveBeenCalledWith('ABC 한글', 0, 0);
      expect(normalizeCadState(JSON.parse(JSON.stringify(state))).entities[0]).toEqual(mirrored);
      const geometry = legacyDisplayGeometry(mirrored);
      if (geometry.type !== 'text') throw new Error('Expected display text');
      expect(geometry.mirroredX ?? false).toBe(mirrtext === 1);
      const corners = textCorners(geometry),
        box = boundsOfGeometry(geometry);
      expect(box?.minX).toBeLessThanOrEqual(Math.min(...corners.map((p) => p.x)));
      expect(distanceToGeometry(geometry, corners[0]!, { tolerance: 0.1 })).toBeLessThan(1e-8);
    },
  );
  it('exports CHPROP ACI, linetype, scale, weight, opacity and thickness as native fields and actual SVG/raster style', async () => {
    const context = outlineContext(),
      state = createEmptyCadState();
    let edited: CadEntity[] = [line];
    for (const [property, value] of [
      ['COLOR', '1'],
      ['LTYPE', 'DASHED'],
      ['LTSCALE', '2.5'],
      ['LWEIGHT', '1'],
      ['TRANSPARENCY', '60'],
      ['THICKNESS', '9'],
    ])
      edited = modifyProperty(context, edited, property!, value!)!;
    state.entities = edited;
    const dxf = drawingToDxf(state),
      record = tags(dxf, 'LINE');
    expect(record.get(62)).toBe('1');
    expect(record.has(420)).toBe(false);
    expect(record.get(6)).toBe('DASHED');
    expect(record.get(48)).toBe('2.5');
    expect(record.get(370)).toBe('100');
    expect(record.get(440)).toBe(String(0x02000000 | 102));
    expect(record.get(39)).toBe('9');
    const result = await readCadFile(new File([nativeOnly(dxf)], 'chprop-native.dxf'));
    expect(result.state.entities[0]).toMatchObject({
      aci: 1,
      color: '#FF0000',
      linetype: 'DASHED',
      linetypeScale: 2.5,
      lineweight: 100,
      transparency: 60,
      thickness: 9,
    });
    expect(result.state.linetypes?.find((t) => t.name === 'DASHED')?.pattern).toEqual([
      12.7, -6.35,
    ]);
    const svg = drawingToSvg(state);
    expect(svg).toContain('stroke="#ff0000"');
    expect(svg).toContain('stroke-dasharray="31.75 15.875"');
    expect(svg).toContain('opacity="0.4"');
    expect(svg).toContain('stroke-width="4"');
    const f = canvas();
    getLegacyRuntime().core.cadExporters.drawEntity(f.context, edited[0]!, {
      state,
      exporting: true,
    });
    expect(f.strokes).toEqual([{ color: '#ff0000', opacity: 0.4, width: 4 }]);
    expect(f.dash).toHaveBeenCalledWith([31.75, 15.875]);
    const recovered = normalizeCadState(JSON.parse(JSON.stringify(state)));
    expect(recovered.entities[0]).toEqual(edited[0]);
  });
  it('keeps TrueColor precedence, symbolic ByLayer/ByBlock color and transparency after native roundtrip', async () => {
    const state = createEmptyCadState();
    state.layers[0] = { ...state.layers[0]!, aci: 3, color: '#0000ff' };
    state.entities = [
      { ...line, id: 'rgb', aci: 1, trueColor: 0x123456, transparency: 'byblock' },
      { ...line, id: 'layer', aci: 256, transparency: 'bylayer' },
      { ...line, id: 'block', aci: 0, transparency: 0 },
    ];
    const dxf = drawingToDxf(state),
      result = await readCadFile(new File([nativeOnly(dxf)], 'color-native.dxf'));
    expect(result.state.entities[0]).toMatchObject({
      aci: 1,
      trueColor: 0x123456,
      color: '#123456',
      transparency: 'byblock',
    });
    expect(result.state.entities[1]).toMatchObject({
      aci: 256,
      color: '#00FF00',
      transparency: 'bylayer',
    });
    expect(result.state.entities[2]).toMatchObject({ aci: 0, transparency: 0 });
    const svg = drawingToSvg(state);
    expect(svg).toContain('stroke="#123456"');
    expect(svg).toContain('stroke="#00ff00"');
    expect(svg).toContain('stroke="#000000"');
  });
  it('uses current native style edits over retained exact metadata without reviving a stale text mirror', async () => {
    const state = createEmptyCadState();
    state.entities = [
      {
        ...text,
        mirroredX: true,
        aci: 1,
        linetype: 'DASHED',
        linetypeScale: 2.5,
        lineweight: 100,
        transparency: 60,
      },
    ];
    const dxf = drawingToDxf(state),
      changed = dxf
        .replace('62\r\n1\r\n6\r\nDASHED', '62\r\n3\r\n6\r\nCONTINUOUS')
        .replace('48\r\n2.5\r\n370\r\n100', '48\r\n1\r\n370\r\n50')
        .replace(`440\r\n${0x02000000 | 102}`, `440\r\n${0x02000000 | 204}`);
    expect(changed).not.toBe(dxf);
    const result = await readCadFile(new File([changed], 'external-style.dxf'));
    expect(result.state.entities[0]).toMatchObject({
      type: 'text',
      mirroredX: true,
      aci: 3,
      linetype: 'CONTINUOUS',
      linetypeScale: 1,
      lineweight: 50,
      transparency: 20,
    });
    expect(drawingToSvg(result.state)).toContain('stroke="#00ff00"');
    const unmirrored = changed.replace('71\r\n2\r\n100\r\nAcDbText', '71\r\n0\r\n100\r\nAcDbText');
    expect(unmirrored).not.toBe(changed);
    const external = await readCadFile(new File([unmirrored], 'external-mirror.dxf'));
    expect(external.state.entities[0]).not.toHaveProperty('mirroredX', true);
  });
  it('writes native thickness on supported point and solid records as well as preserving recovery metadata', async () => {
    const state = createEmptyCadState(),
      polygon = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];
    state.entities = [
      {
        ...line,
        id: 'point',
        curve: { type: 'POINT', position: { x: 0, y: 0, z: 0 } },
        sourceType: 'POINT',
        thickness: -7,
      },
      {
        id: 'solid',
        type: 'polyline',
        layer: '0',
        color: '#ffffff',
        lineWidth: 1,
        points: polygon,
        closed: true,
        sourceType: 'SOLID',
        drawFill: [polygon],
        thickness: 9,
      },
    ];
    const dxf = drawingToDxf(state);
    expect(tags(dxf, 'POINT').get(39)).toBe('-7');
    expect(tags(dxf, 'SOLID').get(39)).toBe('9');
    const result = await readCadFile(new File([dxf], 'thickness.dxf'));
    expect(result.state.entities.map((e) => e.thickness)).toEqual([-7, 9]);
    expect(
      normalizeCadState(JSON.parse(JSON.stringify(state))).entities.map((e) => e.thickness),
    ).toEqual([-7, 9]);
  });
  it('retains legacy readable bounded pens while preserving explicit native white and maximum lineweight', () => {
    const state = createEmptyCadState();
    state.entities = [
      { ...line, id: 'legacy', color: '#ffffff', lineWidth: 100 },
      { ...line, id: 'aci', aci: 7, lineweight: 211 },
      { ...line, id: 'rgb', trueColor: 0xffffff, lineweight: 0 },
      { ...line, id: 'thin', lineWidth: 0.1 },
    ];
    const svg = drawingToSvg(state);
    expect(svg).toContain('color="#000000" stroke="#000000" stroke-width="6"');
    expect(svg).toContain('color="#000000" stroke="#000000" stroke-width="9"');
    expect(svg).toContain('color="#ffffff" stroke="#ffffff" stroke-width="1"');
    expect(svg).toContain('color="#006b00" stroke="#006b00" stroke-width="1"');
    const f = canvas();
    getLegacyRuntime().core.cadExporters.drawEntity(f.context, state.entities[0]!, {
      state,
      exporting: true,
    });
    expect(f.strokes).toEqual([{ color: '#000000', opacity: 1, width: 6 }]);
  });
  it('keeps white display text and uncapped display pens separate from white-background exports', () => {
    const state = createEmptyCadState(),
      entity = { ...line, color: '#ffffff', lineWidth: 100 };
    const display = canvas(),
      exported = canvas();
    getLegacyRuntime().core.cadExporters.drawEntity(display.context, entity, { state });
    getLegacyRuntime().core.cadExporters.drawEntity(exported.context, entity, {
      state,
      exporting: true,
    });
    expect(display.strokes).toEqual([{ color: '#ffffff', opacity: 1, width: 100 }]);
    expect(exported.strokes).toEqual([{ color: '#000000', opacity: 1, width: 6 }]);
    const nativeDisplay = canvas(),
      nativeExport = canvas(),
      native = { ...entity, aci: 7, lineweight: 25 };
    getLegacyRuntime().core.cadExporters.drawEntity(nativeDisplay.context, native, { state });
    getLegacyRuntime().core.cadExporters.drawEntity(nativeExport.context, native, {
      state,
      exporting: true,
    });
    expect(nativeDisplay.strokes[0]?.color).toBe('#ffffff');
    expect(nativeExport.strokes[0]?.color).toBe('#000000');
  });
});
