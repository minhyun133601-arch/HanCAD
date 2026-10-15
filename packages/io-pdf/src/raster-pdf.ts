import { PdfExportError } from './errors';

export interface RasterPdfOptions {
  orientation?: 'auto' | 'portrait' | 'landscape';
  marginMm?: number;
}

/** A local PDF 1.4 writer. Korean text is preserved as raster pixels; vector/font subsetting is pending. */
export function createRasterPdf(
  jpeg: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  options: RasterPdfOptions = {},
): Uint8Array<ArrayBuffer> {
  if (
    !Number.isSafeInteger(imageWidth) ||
    imageWidth < 1 ||
    !Number.isSafeInteger(imageHeight) ||
    imageHeight < 1 ||
    jpeg.length < 4 ||
    jpeg[0] !== 0xff ||
    jpeg[1] !== 0xd8 ||
    jpeg[jpeg.length - 2] !== 0xff ||
    jpeg[jpeg.length - 1] !== 0xd9
  )
    throw new PdfExportError('invalid-jpeg');
  const landscape =
    options.orientation === 'landscape' ||
    (options.orientation !== 'portrait' && imageWidth >= imageHeight);
  const pageWidth = ((landscape ? 297 : 210) * 72) / 25.4;
  const pageHeight = ((landscape ? 210 : 297) * 72) / 25.4;
  const margin = ((options.marginMm ?? 10) * 72) / 25.4;
  if (!Number.isFinite(margin) || margin < 0 || margin * 2 >= Math.min(pageWidth, pageHeight))
    throw new PdfExportError('invalid-pdf-margin');
  const scale = Math.min(
    (pageWidth - margin * 2) / imageWidth,
    (pageHeight - margin * 2) / imageHeight,
  );
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  const x = (pageWidth - width) / 2;
  const y = (pageHeight - height) / 2;
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets = [0];
  let length = 0;
  const append = (value: string | Uint8Array): void => {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, contents: string): void => {
    offsets[id] = length;
    append(`${id} 0 obj\n${contents}\nendobj\n`);
  };
  append('%PDF-1.4\n');
  append(Uint8Array.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${number(pageWidth)} ${number(pageHeight)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );
  offsets[4] = length;
  append(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  append(jpeg);
  append('\nendstream\nendobj\n');
  const content = encoder.encode(
    `q\n${number(width)} 0 0 ${number(height)} ${number(x)} ${number(y)} cm\n/Im0 Do\nQ\n`,
  );
  offsets[5] = length;
  append(`5 0 obj\n<< /Length ${content.length} >>\nstream\n`);
  append(content);
  append('endstream\nendobj\n');
  const xrefOffset = length;
  append('xref\n0 6\n0000000000 65535 f \n');
  for (let index = 1; index <= 5; index++)
    append(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  const result = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of chunks) {
    result.set(chunk, cursor);
    cursor += chunk.length;
  }
  return result;
}
function number(value: number): string {
  return value.toFixed(5).replace(/\.?0+$/, '');
}
