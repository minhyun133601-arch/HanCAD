export type CanvasContextKind = 'main' | 'preview' | 'cache';

const diagnosticFallbacks: Record<CanvasContextKind, string> = {
  main: '2D 캔버스를 사용할 수 없습니다.',
  preview: '미리 보기 캔버스를 사용할 수 없습니다.',
  cache: '도면 캐시 캔버스를 사용할 수 없습니다.',
};

/** Domain identity stays independent of the application's locale catalogs. */
export class CanvasContextError extends Error {
  constructor(readonly kind: CanvasContextKind) {
    super(diagnosticFallbacks[kind]);
    this.name = 'CanvasContextError';
  }
}
