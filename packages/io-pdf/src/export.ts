import {
  drawingBounds,
  drawingToDxf,
  drawingToSvg,
  getLegacyRuntime,
  readableCadColor,
  visibleCadEntities,
} from '@hancad/legacy-bridge';
import type { LegacyCadState } from '@hancad/legacy-bridge';
import { createRasterPdf } from './raster-pdf';

export type CadExportFormat = 'pdf' | 'png' | 'jpg' | 'svg' | 'dxf';
export interface CadExportResult {
  blob: Blob;
  fileName: string;
}

export async function exportCadDrawing(
  state: LegacyCadState,
  format: CadExportFormat,
): Promise<CadExportResult> {
  if (!visibleCadEntities(state).length)
    throw new Error('변환할 도면 객체가 없습니다. 먼저 DWG / DXF 파일을 여세요.');
  const fileName = `${exportBaseName(state.name)}.${format}`;
  if (format === 'svg')
    return {
      blob: new Blob([drawingToSvg(state)], { type: 'image/svg+xml;charset=utf-8' }),
      fileName,
    };
  if (format === 'dxf')
    return {
      blob: new Blob([drawingToDxf(state)], { type: 'application/dxf;charset=utf-8' }),
      fileName,
    };
  const canvas = createDrawingRaster(state);
  if (format === 'png') return { blob: await canvasBlob(canvas, 'image/png'), fileName };
  const jpeg = await canvasBlob(canvas, 'image/jpeg', 0.95);
  if (format === 'jpg') return { blob: jpeg, fileName };
  const pdf = createRasterPdf(
    new Uint8Array(await jpeg.arrayBuffer()),
    canvas.width,
    canvas.height,
  );
  return { blob: new Blob([pdf.buffer], { type: 'application/pdf' }), fileName };
}

export function createDrawingRaster(
  state: LegacyCadState,
  maximumDimension = 2400,
): HTMLCanvasElement {
  if (!Number.isFinite(maximumDimension) || maximumDimension < 128 || maximumDimension > 8192)
    throw new Error('이미지 크기가 올바르지 않습니다.');
  const bounds = drawingBounds(state);
  const modelWidth = Math.max(1, bounds.maxX - bounds.minX);
  const modelHeight = Math.max(1, bounds.maxY - bounds.minY);
  const margin = 40;
  const scale = (maximumDimension - margin * 2) / Math.max(modelWidth, modelHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(128, Math.ceil(modelWidth * scale + margin * 2));
  canvas.height = Math.max(128, Math.ceil(modelHeight * scale + margin * 2));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('도면 이미지 캔버스를 만들지 못했습니다.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(margin, margin);
  context.scale(scale, scale);
  context.translate(-bounds.minX, -bounds.minY);
  for (const entity of visibleCadEntities(state)) {
    getLegacyRuntime().core.cadExporters.drawEntity(context, entity, {
      color: readableCadColor(entity.color),
      scale,
      lineWidth: Math.max(
        1,
        Math.min(6, Number.isFinite(entity.lineWidth) ? entity.lineWidth : 1.5),
      ),
      unit: state.settings.unit,
    });
  }
  return canvas;
}

export function exportBaseName(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, '')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .trim()
      .replace(/[. ]+$/, '') || 'Drawing'
  ).slice(0, 180);
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('도면 이미지 변환에 실패했습니다.'))),
      type,
      quality,
    ),
  );
}
