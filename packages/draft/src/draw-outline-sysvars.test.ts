import { describe, expect, it } from 'vitest';
import { SystemVariables } from '@hancad/sysvars';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import { drawRevcloud } from './draw-cloud';
import { drawPline } from './draw-pline';
import { drawRectang } from './draw-rect';
import { drawDonut, drawPolygon } from './draw-outlines';
import { drawWipeout } from './draw-wipeout';

describe('drawing command integration with the real sourced variable registry', () => {
  it('resolves every outline default without permissive missing-variable mocks', () => {
    const variables = new SystemVariables(),
      context = outlineContext();
    context.get = (name) => variables.get(name);
    context.set = (name, value) => {
      if (typeof value === 'number' || typeof value === 'string') variables.set(name, value);
      else throw new Error('Unexpected vector setting');
    };
    const origin = { x: 0, y: 0 };
    expect(outlineRun(drawPline, [origin, { x: 10, y: 0 }, ''], context).entities).toHaveLength(1);
    expect(
      outlineRun(drawRectang, ['F', '5', origin, { x: 100, y: -50 }], context).entities,
    ).toHaveLength(1);
    expect(outlineRun(drawPolygon, ['4', origin, 'I', '10'], context).entities).toHaveLength(1);
    expect(outlineRun(drawDonut, ['0', '20', origin, ''], context).entities).toHaveLength(1);
    expect(
      outlineRun(drawRevcloud, ['R', origin, { x: 100, y: -50 }, ''], context).entities,
    ).toHaveLength(1);
    expect(outlineRun(drawWipeout, ['F', 'D'], context).entities).toHaveLength(0);
    expect(variables.getNumber('REVCLOUDCREATEMODE')).toBe(1);
    expect(variables.getNumber('REVCLOUDSCALEMODE')).toBe(0);
    expect(variables.getNumber('WIPEOUTFRAME')).toBe(2);
    expect(variables.getNumber('TRACEWID')).toBe(1);
  });
});
