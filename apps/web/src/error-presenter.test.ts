import { describe, expect, it } from 'vitest';
import { SystemVariables } from '@hancad/sysvars';
import { getMessages } from '@hancad/ui';
import { errorMessage } from './error-presenter';

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
        action: () => variables.set('DIMSTYLE', '없는 스타일'),
        korean: 'DIMSTYLE의 값이 유효하지 않습니다. 이름 "없는 스타일"이(가) 도면에 없습니다.',
        english: 'Invalid value for DIMSTYLE. Name "없는 스타일" does not exist in the drawing.',
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
});
