import { describe, expect, it } from 'vitest';
import { DrawingDatabase } from './index';
import type { JsonValue } from './index';

describe('drawing variable history with large strings and mutable JSON', () => {
  it('retains long Korean snapshots while isolating caller/getter/event mutations across undo and redo', () => {
    const database = new DrawingDatabase();
    const original = '한글 도면 좌표 100,200\n'.repeat(65536);
    const modified = original + '수정된 도면';
    const initialComposite = { label: '한글', data: { point: [10, 20] } };
    const updatedComposite = { label: '수정', data: { point: [30, 40] } };
    const mutatePoint = (value: JsonValue | undefined): void => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      const data = value.data;
      if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.point))
        data.point[0] = 999;
    };
    database.events.subscribe((event) => {
      if (event.type === 'sysvar-changed' && event.name === '_COMPOSITE') {
        mutatePoint(event.value);
        mutatePoint(event.before);
      }
    });
    database.transaction('initial snapshot', (transaction) =>
      transaction.setVariable('_DRAWING', original),
    );
    database.transaction('drawing edit', (transaction) => {
      transaction.setVariable('_DRAWING', modified);
      transaction.setVariable('_COMPOSITE', initialComposite);
    });
    initialComposite.data.point[0] = 777;
    mutatePoint(database.getVariable('_COMPOSITE'));
    expect(database.getVariable('_COMPOSITE')).toEqual({
      label: '한글',
      data: { point: [10, 20] },
    });
    database.transaction('composite edit', (transaction) =>
      transaction.setVariable('_COMPOSITE', updatedComposite),
    );
    updatedComposite.data.point[0] = 888;
    expect(database.getVariable('_DRAWING')).toBe(modified);
    expect(database.undo(2)).toBe(2);
    expect(database.getVariable('_DRAWING')).toBe(original);
    expect(database.getVariable('_COMPOSITE')).toBeUndefined();
    expect(database.redo(2)).toBe(2);
    expect(database.getVariable('_DRAWING')).toBe(modified);
    expect(database.getVariable('_COMPOSITE')).toEqual({
      label: '수정',
      data: { point: [30, 40] },
    });
    expect(() =>
      database.transaction('failed large edit', (transaction) => {
        transaction.setVariable('_DRAWING', '실패한 변경' + modified);
        throw new Error('cancel');
      }),
    ).toThrow('cancel');
    expect(database.getVariable('_DRAWING')).toBe(modified);
    const snapshot = database.snapshot();
    mutatePoint(snapshot.drawingVariables._COMPOSITE);
    const reloaded = new DrawingDatabase(database.snapshot());
    expect(reloaded.getVariable('_DRAWING')).toBe(modified);
    expect(database.getVariable('_COMPOSITE')).toEqual({
      label: '수정',
      data: { point: [30, 40] },
    });
  });
});
