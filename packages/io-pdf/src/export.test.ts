import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState, readCadFile } from '@hancad/legacy-bridge';
import { createTestRuntime, fixtureDxf } from '../../legacy-bridge/src/test-runtime';
import { createTestCanvas } from '../../legacy-bridge/src/test-canvas';
import { createDrawingRaster, createRasterPdf, exportCadDrawing } from './index';

beforeEach(() => {
  vi.stubGlobal('HeechangTool', createTestRuntime());
  vi.stubGlobal('document', { createElement: () => createTestCanvas().canvas });
});
afterEach(() => vi.unstubAllGlobals());

describe('local drawing conversion', () => {
  it('exports nonempty SVG/DXF/PNG/JPG/PDF with original drawing names and valid file signatures', async () => {
    const { state } = await readCadFile(new File([fixtureDxf()], '한글 도면.dxf'));
    for (const format of ['svg', 'dxf', 'png', 'jpg', 'pdf'] as const) {
      const result = await exportCadDrawing(state, format);
      expect(result.fileName).toBe(`한글 도면.${format}`);
      expect(result.blob.size).toBeGreaterThan(0);
      if (format === 'svg') expect(await result.blob.text()).toContain('<svg');
      if (format === 'dxf') expect(await result.blob.text()).toContain('ENTITIES');
      if (format === 'pdf') {
        expect(await result.blob.text()).toContain('%PDF-1.4');
        expect(await result.blob.text()).toContain('/DCTDecode');
      }
      if (format === 'png')
        expect(Array.from(new Uint8Array(await result.blob.arrayBuffer()).slice(0, 4))).toEqual([
          0x89, 0x50, 0x4e, 0x47,
        ]);
      if (format === 'jpg')
        expect(Array.from(new Uint8Array(await result.blob.arrayBuffer()).slice(0, 2))).toEqual([
          0xff, 0xd8,
        ]);
    }
    await expect(exportCadDrawing(createEmptyCadState(), 'pdf')).rejects.toThrow('먼저 DWG');
  });

  it('writes byte-accurate cross-reference offsets, stream lengths and centered A4 orientation', () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0x01, 0xff, 0xd9]);
    const pdf = createRasterPdf(jpeg, 2400, 1200);
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text).toContain('/MediaBox [0 0 841.88976 595.27559]');
    expect(text).toContain('/Width 2400 /Height 1200');
    const xref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(new TextDecoder().decode(pdf.slice(xref, xref + 4))).toBe('xref');
    const table = new TextDecoder().decode(pdf.slice(xref)).split('\n');
    for (let id = 1; id <= 5; id++) {
      const offset = Number(table[id + 2]?.slice(0, 10));
      expect(new TextDecoder().decode(pdf.slice(offset, offset + 7))).toBe(`${id} 0 obj`);
    }
    expect(new TextDecoder().decode(createRasterPdf(jpeg, 1200, 2400))).toContain(
      '/MediaBox [0 0 595.27559 841.88976]',
    );
    expect(() => createRasterPdf(jpeg, 0, 1)).toThrow('JPEG');
  });

  it('keeps screen-style pen widths readable at high raster export scales', async () => {
    const { state } = await readCadFile(new File([fixtureDxf()], 'test.dxf'));
    const fixture = createTestCanvas();
    vi.stubGlobal('document', { createElement: () => fixture.canvas });
    createDrawingRaster(state);
    const scale = Number(
      fixture.operations.find((operation) => operation.name === 'scale')?.args[0],
    );
    const penWidths = fixture.operations
      .filter((operation) => operation.name === 'set:lineWidth')
      .map((operation) => Number(operation.args[0]) * scale);
    expect(penWidths.length).toBeGreaterThan(0);
    expect(Math.max(...penWidths)).toBeLessThanOrEqual(6);
    expect(Math.min(...penWidths)).toBeGreaterThanOrEqual(1);
  });
});
