export type PdfExportErrorCode =
  | 'no-visible-entities'
  | 'invalid-image-size'
  | 'canvas-unavailable'
  | 'image-conversion-failed'
  | 'invalid-jpeg'
  | 'invalid-pdf-margin';

const fallbackMessages: Record<PdfExportErrorCode, string> = {
  'no-visible-entities': '변환할 도면 객체가 없습니다. 먼저 DWG / DXF 파일을 여세요.',
  'invalid-image-size': '이미지 크기가 올바르지 않습니다.',
  'canvas-unavailable': '도면 이미지 캔버스를 만들지 못했습니다.',
  'image-conversion-failed': '도면 이미지 변환에 실패했습니다.',
  'invalid-jpeg': 'PDF에 넣을 JPEG 이미지가 올바르지 않습니다.',
  'invalid-pdf-margin': 'PDF 여백이 올바르지 않습니다.',
};

/** Export failures retain existing diagnostics while exposing a locale-neutral identity. */
export class PdfExportError extends Error {
  constructor(readonly code: PdfExportErrorCode) {
    super(fallbackMessages[code]);
    this.name = 'PdfExportError';
  }
}

export interface PdfExportErrorMessages {
  exportNoVisibleEntities: string;
  exportInvalidImageSize: string;
  exportCanvasUnavailable: string;
  exportImageConversionFailed: string;
  exportInvalidJpeg: string;
  exportInvalidPdfMargin: string;
}

export function formatPdfExportError(
  error: PdfExportError,
  messages: PdfExportErrorMessages,
): string {
  switch (error.code) {
    case 'no-visible-entities':
      return messages.exportNoVisibleEntities;
    case 'invalid-image-size':
      return messages.exportInvalidImageSize;
    case 'canvas-unavailable':
      return messages.exportCanvasUnavailable;
    case 'image-conversion-failed':
      return messages.exportImageConversionFailed;
    case 'invalid-jpeg':
      return messages.exportInvalidJpeg;
    case 'invalid-pdf-margin':
      return messages.exportInvalidPdfMargin;
  }
}
