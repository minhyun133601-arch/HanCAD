import { describe, expect, it } from 'vitest';
import { SystemVariables } from '@hancad/sysvars';
import { getMessages } from '@hancad/ui';
import { errorMessage } from './error-presenter';
import { CanvasContextError } from '@hancad/render';
import { PdfExportError } from '@hancad/io-pdf';
import { CommandInputError } from '@hancad/commands';
import { InputValueError } from '@hancad/editor';
import { CreationStyleError } from './creation-style-error';

describe('browser domain error presentation', () => {
  it('presents typed sysvar errors with their reason and range in the active UI language', () => {
    const variables = new SystemVariables();
    const cases = [
      {
        action: () => variables.set('LUPREC', 9),
        korean: 'LUPREC의 값이 유효하지 않습니다 (0~8).',
        english: 'Invalid value for LUPREC (0–8).',
      },
      {
        action: () => variables.set('CMDACTIVE', 1),
        korean: 'CMDACTIVE은(는) 읽기 전용 시스템 변수입니다.',
        english: 'CMDACTIVE is a read-only system variable.',
      },
      {
        action: () => variables.get('nonexistent'),
        korean: '알 수 없는 시스템 변수 "NONEXISTENT".',
        english: 'Unknown system variable "NONEXISTENT".',
      },
      {
        action: () => variables.set('TEXTSTYLE', '없는 스타일'),
        korean: 'TEXTSTYLE의 값이 유효하지 않습니다. 이름 "없는 스타일"이(가) 도면에 없습니다.',
        english: 'Invalid value for TEXTSTYLE. Name "없는 스타일" does not exist in the drawing.',
      },
    ];
    for (const failure of cases) {
      let captured: unknown;
      try {
        failure.action();
      } catch (error) {
        captured = error;
      }
      expect(captured).toBeInstanceOf(Error);
      expect(errorMessage(captured, getMessages('ko-KR'))).toBe(failure.korean);
      expect(errorMessage(captured, getMessages('en-US'))).toBe(failure.english);
    }
    expect(variables.database.undoCount).toBe(0);
  });

  it('preserves unrecognized error diagnostics instead of claiming to translate them', () => {
    const messages = getMessages('en-US');
    expect(errorMessage(new Error('원본 진단'), messages)).toBe('원본 진단');
    expect(errorMessage('external failure', messages)).toBe('external failure');
  });

  it('uses current catalogs for renderer, export and command/input failures while retaining user values', () => {
    const korean = getMessages('ko-KR'),
      english = getMessages('en-US');
    for (const error of [
      new CanvasContextError('main'),
      new CanvasContextError('preview'),
      new CanvasContextError('cache'),
      new PdfExportError('canvas-unavailable'),
      new PdfExportError('invalid-jpeg'),
      new CommandInputError('invalid-point', 'LASTPOINT'),
      new InputValueError('finite-number-required'),
      new CreationStyleError('invalid-color'),
      new CreationStyleError('invalid-rgb'),
      new CreationStyleError('unsupported-hsl'),
      new CreationStyleError('unsupported-color-book'),
    ]) {
      expect(errorMessage(error, korean)).toMatch(/[가-힣]/);
      expect(errorMessage(error, english)).not.toMatch(/[가-힣]/);
      expect(errorMessage(error, english)).not.toBe(errorMessage(error, korean));
    }
    // Legacy runtime errors can originate in a VM rather than this Error realm.
    const importedError: unknown = {
      name: 'CadImportError',
      message: 'legacy fallback',
      diagnostic: { namespace: 'cad-import', code: 'dxf-number', line: 14 },
    };
    expect(errorMessage(importedError, english)).toContain('14');
    expect(errorMessage(importedError, korean)).toContain('14');
    expect(errorMessage(importedError, english)).not.toMatch(/[가-힣]/);
  });
});
