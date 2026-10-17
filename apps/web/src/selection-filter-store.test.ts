import { describe, expect, it } from 'vitest';
import { SelectionFilterStore, selectionFilterStorageKey } from './selection-filter-store';
import type { CadFilterExpression } from '@hancad/legacy-bridge';

const condition: CadFilterExpression = { property: 'type', operator: '=', value: 'line' };
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
describe('profile-global FILTER definitions', () => {
  it('shares names independently of drawing snapshots and reloads other-window changes', () => {
    const persistence = storage(),
      firstDrawing = new SelectionFilterStore(persistence);
    firstDrawing.save('LineObjects', condition);
    const secondDrawing = new SelectionFilterStore(persistence);
    expect(secondDrawing.snapshot()).toEqual(firstDrawing.snapshot());
    secondDrawing.save('CircleObjects', { property: 'type', operator: '=', value: 'circle' });
    firstDrawing.reload();
    expect(firstDrawing.snapshot()).toHaveLength(2);
    firstDrawing.save('LINEOBJECTS', { property: 'type', operator: '=', value: 'arc' });
    expect(firstDrawing.snapshot()).toHaveLength(2);
    firstDrawing.save('LINEOBJECTS', null);
    expect(firstDrawing.snapshot()).toHaveLength(1);
    expect(persistence.getItem(selectionFilterStorageKey)).toContain('CircleObjects');
  });
  it('enforces eighteen-character names and balanced logical operator arities', () => {
    const store = new SelectionFilterStore(storage());
    store.save('한'.repeat(18), condition);
    expect(() => store.save('한'.repeat(19), condition)).toThrow('filterName');
    expect(() => store.save('InvalidXor', { operator: 'xor', children: [condition] })).toThrow(
      'filterExpression',
    );
    expect(() =>
      store.save('InvalidNot', { operator: 'not', children: [condition, condition] }),
    ).toThrow('filterExpression');
    expect(() => store.save('EmptyAnd', { operator: 'and', children: [] })).toThrow(
      'filterExpression',
    );
    store.save('ValidXor', {
      operator: 'xor',
      children: [condition, { operator: 'not', children: [condition] }],
    });
    expect(store.snapshot()).toHaveLength(2);
  });
  it('rejects malformed persisted definitions without admitting invalid expressions', () => {
    const persistence = storage();
    persistence.setItem(
      selectionFilterStorageKey,
      JSON.stringify([
        { name: 'Good', expression: condition },
        { name: 'Bad', expression: { operator: 'not', children: [] } },
      ]),
    );
    expect(new SelectionFilterStore(persistence).snapshot().map((filter) => filter.name)).toEqual([
      'Good',
    ]);
  });
});
