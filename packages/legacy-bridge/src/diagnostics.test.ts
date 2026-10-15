import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cadGeometryReasons,
  cadImportPlainCodes,
  getCadImportDiagnostic,
  isCadImportDiagnostic,
  normalizeCadState,
  readCadFile,
} from './index';
import type { CadImportDiagnostic, CadImportProgressDiagnostic } from './index';
import { createTestRuntime, fixtureDxf } from './test-runtime';
import {
  formatCadImportDiagnostic,
  formatCadImportError,
  formatCadImportWarning,
  getMessages,
} from '@hancad/ui';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
const ko = getMessages('ko-KR').importDiagnostics;
const en = getMessages('en-US').importDiagnostics;

describe('structured importer diagnostics', () => {
  it('localizes actual cross-realm DXF failures by a validated identity and retains line numbers', async () => {
    const malformed = fixtureDxf().replace('10\n0\n20\n0', '10\ninvalid\n20\n0');
    let caught: unknown;
    try {
      await readCadFile(new File([malformed], 'malformed.dxf'));
    } catch (error) {
      caught = error;
    }
    expect(caught instanceof Error).toBe(false);
    const diagnostic = getCadImportDiagnostic(caught);
    expect(diagnostic).toMatchObject({ namespace: 'cad-import', code: 'dxf-number' });
    expect(formatCadImportError(caught, en)).toMatch(/^Invalid DXF number on line \d+\.$/);
    expect(formatCadImportError(caught, ko)).toMatch(/DXF \d+행에 유효하지 않은 숫자/);
    expect(
      getCadImportDiagnostic({
        name: 'CadImportError',
        message: 'original',
        diagnostic: { namespace: 'cad-import', code: 'dxf-number', line: '14' },
      }),
    ).toBeUndefined();
    expect(
      formatCadImportError(
        { name: 'Error', message: 'DXF 14행에 유효하지 않은 숫자가 있습니다.' },
        en,
      ),
    ).toBeUndefined();
  });

  it('emits typed progress alongside the unchanged legacy callback and formats current locale', async () => {
    const diagnostics: CadImportProgressDiagnostic[] = [],
      fallback: string[] = [];
    await readCadFile(new File([fixtureDxf()], 'drawing.dxf'), {
      onDiagnosticProgress: (diagnostic) => diagnostics.push(diagnostic),
      onProgress: (message) => fallback.push(message),
    });
    expect(diagnostics.map((value) => value.code)).toEqual([
      'file-reading',
      'entities-importing',
      'entities-preparing',
    ]);
    expect(diagnostics.every(isCadImportDiagnostic)).toBe(true);
    expect(diagnostics.at(-1)).toMatchObject({ sourceEntities: 4, layers: 1, blocks: 0 });
    expect(fallback[0]).toBe('파일 읽는 중');
    const preparing = diagnostics.at(-1);
    if (!preparing) throw new Error('Missing preparation progress');
    expect(formatCadImportDiagnostic(preparing, ko)).toContain('원본 객체 4개');
    expect(formatCadImportDiagnostic(preparing, en)).toContain('Source entities 4');
    expect(formatCadImportDiagnostic(preparing, en)).not.toMatch(/[가-힣]/);
  });

  it('retains aligned warning identities, typed nested omissions, and arbitrary external detail', async () => {
    const text = fixtureDxf().replace(
      '0\nACAD_PROXY_ENTITY\n',
      '0\nCIRCLE\n10\n0\n20\n0\n40\n0\n0\nACAD_PROXY_ENTITY\n',
    );
    const { report } = await readCadFile(new File([text], 'warnings.dxf'));
    expect(report.warningDiagnostics).toHaveLength(report.warnings.length);
    expect(report.warningDiagnostics?.every(isCadImportDiagnostic)).toBe(true);
    const skipped = report.warningDiagnostics?.find(
      (warning) => warning?.code === 'entity-skipped',
    );
    expect(skipped).toMatchObject({
      entityType: 'CIRCLE',
      reason: { code: 'invalid-geometry', reason: 'circle-radius' },
    });
    expect(formatCadImportWarning('fallback', skipped, en)).toBe(
      'CIRCLE: The circle radius is invalid.',
    );
    expect(formatCadImportWarning('fallback', skipped, ko)).toBe(
      'CIRCLE: 원 반지름이 올바르지 않습니다.',
    );
    expect(formatCadImportWarning('외부 원문 그대로', null, en)).toBe('외부 원문 그대로');
    const external: CadImportDiagnostic = {
      namespace: 'cad-import',
      code: 'entity-skipped',
      entityType: 'VENDOR',
      reason: '외부 엔진 원문 그대로',
    };
    expect(formatCadImportDiagnostic(external, en)).toBe('VENDOR: 외부 엔진 원문 그대로');
    expect(
      formatCadImportError(
        {
          name: 'CadImportError',
          message: 'original',
          diagnostic: { namespace: 'cad-import', code: 'dwg-decode-failed', detail: '원문 디테일' },
        },
        en,
      ),
    ).toContain('원문 디테일');
  });

  it('validates every parameter before presenting cache or external diagnostic identities', () => {
    const invalid = [
      null,
      {},
      { namespace: 'other', code: 'cancelled' },
      { namespace: undefined, code: 'cancelled' },
      { code: 'future-code' },
      { code: 'dxf-number', line: 0 },
      { code: 'dxf-number', line: 1.5 },
      { code: 'entity-limit', limit: Infinity },
      { code: 'layer-limit', limit: -1 },
      { code: 'dxf-structure', part: { toString: () => 'SECTION' } },
      { code: 'invalid-geometry', reason: 'future-reason' },
      { code: 'dwg-decode-failed', detail: 1 },
      { code: 'dwg-version', version: null },
      { code: 'block-reference', name: undefined },
      { code: 'entities-preparing', sourceEntities: 0, layers: NaN, blocks: 0 },
      {
        code: 'entity-skipped',
        entityType: 'LINE',
        reason: { namespace: 'cad-import', code: 'dxf-number' },
      },
    ];
    for (const value of invalid) {
      const identity =
        typeof value === 'object' && value !== null ? { namespace: 'cad-import', ...value } : value;
      expect(isCadImportDiagnostic(identity)).toBe(false);
      expect(formatCadImportWarning('原文', identity, en)).toBe('原文');
    }
    const cyclic: Record<string, unknown> = {
      namespace: 'cad-import',
      code: 'entity-skipped',
      entityType: 'LINE',
    };
    cyclic.reason = cyclic;
    expect(isCadImportDiagnostic(cyclic)).toBe(false);
    for (const code of cadImportPlainCodes) {
      const diagnostic: CadImportDiagnostic = { namespace: 'cad-import', code };
      expect(isCadImportDiagnostic(diagnostic)).toBe(true);
      expect(formatCadImportDiagnostic(diagnostic, en)).not.toMatch(/[가-힣]/);
      expect(formatCadImportDiagnostic(diagnostic, ko)).toMatch(/[가-힣]/);
    }
    for (const reason of cadGeometryReasons) {
      expect(
        formatCadImportDiagnostic(
          { namespace: 'cad-import', code: 'invalid-geometry', reason },
          en,
        ),
      ).not.toMatch(/[가-힣]/);
    }
  });

  it('uses the same identities for bridge validation, runtime availability and cancellation', async () => {
    await expect(readCadFile(new File(['x'], 'bad.pdf'))).rejects.toMatchObject({
      diagnostic: { code: 'file-extension' },
    });
    await expect(readCadFile(new File([], 'empty.dxf'))).rejects.toMatchObject({
      diagnostic: { code: 'file-size' },
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      readCadFile(new File([fixtureDxf()], 'cancel.dxf'), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError', diagnostic: { code: 'cancelled' } });
    try {
      normalizeCadState({ entities: [{ type: 'unsupported' }] });
    } catch (error) {
      expect(formatCadImportError(error, en)).toBe(
        'Validation of the saved drawing entities failed.',
      );
    }
    vi.stubGlobal('HeechangTool', undefined);
    await expect(readCadFile(new File([fixtureDxf()], 'drawing.dxf'))).rejects.toMatchObject({
      diagnostic: { code: 'runtime-unavailable' },
    });
  });
});
