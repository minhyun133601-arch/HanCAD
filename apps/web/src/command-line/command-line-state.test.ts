import { describe, expect, it } from 'vitest';
import { InputHistory } from './input-history';
import { defaultCommandLineLayout, normalizeLayout } from './layout';

describe('command window layout', () => {
  it('defaults to a centered floating bar with 25% transparency', () => {
    expect(normalizeLayout(undefined)).toEqual(defaultCommandLineLayout);
    expect(defaultCommandLineLayout).toMatchObject({ docked: false, x: -1, transparency: 25 });
  });

  it('keeps valid stored placement and clamps out-of-range values', () => {
    expect(
      normalizeLayout({ docked: true, x: 40, bottom: 80, width: 600, dockedLines: 5 }),
    ).toMatchObject({ docked: true, x: 40, bottom: 80, width: 600, dockedLines: 5 });
    expect(
      normalizeLayout({ x: -50, bottom: -3, width: 10, dockedLines: 99.6, transparency: 95 }),
    ).toMatchObject({ x: -1, bottom: 0, width: 320, dockedLines: 50, transparency: 90 });
  });

  it('ignores wrong types field by field', () => {
    expect(normalizeLayout({ docked: 'yes', width: '700', transparency: Number.NaN })).toEqual(
      defaultCommandLineLayout,
    );
    expect(normalizeLayout('broken')).toEqual(defaultCommandLineLayout);
  });
});

describe('input history', () => {
  it('recalls the newest entry first and stops at both ends', () => {
    const history = new InputHistory();
    history.add('command', 'LINE');
    history.add('command', 'CIRCLE');
    expect(history.recall('command', -1)).toBe('CIRCLE');
    expect(history.recall('command', -1)).toBe('LINE');
    expect(history.recall('command', -1)).toBe('LINE');
    expect(history.recall('command', 1)).toBe('CIRCLE');
    // Past the newest entry the input clears, as Down does in AutoCAD.
    expect(history.recall('command', 1)).toBe('');
  });

  it('keeps separate lists per prompt context', () => {
    const history = new InputHistory();
    history.add('command', 'OFFSET');
    history.add('distance', '10');
    expect(history.recall('distance', -1)).toBe('10');
    expect(history.recall('command', -1)).toBe('OFFSET');
    expect(history.recall('point', -1)).toBeUndefined();
  });

  it('moves repeated input to the end, ignores blanks and honors the limit', () => {
    let limit = 3;
    const history = new InputHistory(() => limit);
    for (const value of ['A', 'B', ' ', 'C', 'A']) history.add('command', value);
    expect(history.list('command')).toEqual(['B', 'C', 'A']);
    history.add('command', 'D');
    expect(history.list('command')).toEqual(['C', 'A', 'D']);
    limit = 0;
    history.add('command', 'E');
    expect(history.list('command')).toEqual([]);
  });

  it('restarts recall from the newest entry after new input', () => {
    const history = new InputHistory();
    history.add('command', 'MOVE');
    history.add('command', 'COPY');
    expect(history.recall('command', -1)).toBe('COPY');
    expect(history.recall('command', -1)).toBe('MOVE');
    history.add('command', 'ERASE');
    expect(history.recall('command', -1)).toBe('ERASE');
    history.resetCursor();
    expect(history.recall('command', -1)).toBe('ERASE');
  });
});
