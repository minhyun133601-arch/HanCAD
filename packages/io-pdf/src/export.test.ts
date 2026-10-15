import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState, readCadFile } from '@hancad/legacy-bridge';
import { createTestRuntime, fixtureDxf } from '../../legacy-bridge/src/test-runtime';
import { createTestCanvas } from '../../legacy-bridge/src/test-canvas';
import { createDrawingRaster, createRasterPdf, exportCadDrawing, PdfExportError } from './index';

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

  it('identifies export failures without changing drawing geometry or existing diagnostics', async () => {
    const { state } = await readCadFile(new File([fixtureDxf()], 'source.dxf'));
    const before = JSON.stringify(state);
    const empty = createEmptyCadState();
    await expect(exportCadDrawing(empty, 'pdf')).rejects.toMatchObject({
      name: 'PdfExportError',
      code: 'no-visible-entities',
      message: '변환할 도면 객체가 없습니다. 먼저 DWG / DXF 파일을 여세요.',
    });
    const hidden = {
      ...state,
      layers: state.layers.map((layer) => ({ ...layer, visible: false })),
    };
    await expect(exportCadDrawing(hidden, 'png')).rejects.toMatchObject({
      code: 'no-visible-entities',
    });
    for (const size of [Number.NaN, 127, 8193]) {
      try {
        createDrawingRaster(state, size);
        expect.fail('Invalid raster dimensions must be rejected.');
      } catch (error) {
        expect(error).toBeInstanceOf(PdfExportError);
        expect(error).toMatchObject({
          code: 'invalid-image-size',
          message: '이미지 크기가 올바르지 않습니다.',
        });
      }
    }
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
    expect(() => createDrawingRaster(state)).toThrow(PdfExportError);
    await expect(exportCadDrawing(state, 'png')).rejects.toMatchObject({
      code: 'canvas-unavailable',
      message: '도면 이미지 캔버스를 만들지 못했습니다.',
    });
    const canvas = createTestCanvas().canvas;
    canvas.toBlob = (callback) => callback(null);
    vi.stubGlobal('document', { createElement: () => canvas });
    await expect(exportCadDrawing(state, 'png')).rejects.toMatchObject({
      code: 'image-conversion-failed',
      message: '도면 이미지 변환에 실패했습니다.',
    });
    const jpeg = Uint8Array.from([0xff, 0xd8, 0x01, 0xff, 0xd9]);
    for (const [data, width, margin, code, message] of [
      [new Uint8Array(), 100, 10, 'invalid-jpeg', 'PDF에 넣을 JPEG 이미지가 올바르지 않습니다.'],
      [jpeg, 0, 10, 'invalid-jpeg', 'PDF에 넣을 JPEG 이미지가 올바르지 않습니다.'],
      [jpeg, 100, -1, 'invalid-pdf-margin', 'PDF 여백이 올바르지 않습니다.'],
      [jpeg, 100, 105, 'invalid-pdf-margin', 'PDF 여백이 올바르지 않습니다.'],
    ] as const) {
      try {
        createRasterPdf(data, width, 100, { marginMm: margin });
        expect.fail('Invalid PDF image or margin must be rejected.');
      } catch (error) {
        expect(error).toBeInstanceOf(PdfExportError);
        expect(error).toMatchObject({ code, message });
      }
    }
    expect(JSON.stringify(state)).toBe(before);
  });
});
