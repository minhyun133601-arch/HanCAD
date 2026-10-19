import { describe, expect, it } from 'vitest';
import { parseMacro } from '@hancad/commands';
import type { DrawProgram, DrawResult, DrawValue } from '../../../packages/draft/src/draw-program';
import { arcProgram } from '../../../packages/draft/src/draw-arc';
import { outlineContext } from '../../../packages/draft/src/draw-outline-fixtures';
import { drawRibbonMethods, moreDrawMethods } from './ribbon-draw-methods';

function runMethod(macro: string, inputs: DrawValue[]): DrawResult {
  const context = outlineContext();
  context.continuation = { point: { x: 0, y: 0 }, tangent: { x: 1, y: 0 } };
  let program: DrawProgram | undefined,
    state: ReturnType<DrawProgram['next']> | undefined,
    buffer = '';
  const accept = (input: DrawValue) => {
    if (!program) {
      if (typeof input !== 'string' || input.toUpperCase() !== '_ARC')
        throw new Error(`Unexpected command ${JSON.stringify(input)}`);
      program = arcProgram(context);
      state = program.next();
    } else {
      if (state?.done) throw new Error('Command finished before macro input');
      state = program.next(input);
    }
  };
  const remaining = [...inputs];
  for (const step of parseMacro(macro).steps) {
    if (step.type === 'text') buffer += step.text;
    else if (step.type === 'enter' || step.type === 'space') {
      accept(buffer);
      buffer = '';
    } else if (step.type === 'pause') {
      const input = remaining.shift();
      if (input === undefined) throw new Error('Missing macro pause input');
      accept(input);
    }
  }
  for (const input of remaining) accept(input);
  if (!state?.done) throw new Error('Macro did not finish ARC construction');
  return state.value;
}
describe('Phase 06 ribbon drawing methods', () => {
  it('runs all eleven ARC construction macros through the actual command coroutine', () => {
    const start = { x: 0, y: 0 },
      center = { x: 0, y: -10 },
      end = { x: 10, y: -10 };
    const fixtures: DrawValue[][] = [
      [start, { x: Math.sqrt(50), y: Math.sqrt(50) - 10 }, end],
      [start, center, end],
      [start, center, '90'],
      [start, center, String(Math.sqrt(200))],
      [start, end, '90'],
      [start, end, '0'],
      [start, end, '10'],
      [center, start, end],
      [center, start, '90'],
      [center, start, String(Math.sqrt(200))],
      [end],
    ];
    expect(drawRibbonMethods.ARC).toHaveLength(11);
    for (const [index, method] of drawRibbonMethods.ARC!.entries()) {
      const entity = runMethod(method.macro, fixtures[index]!).entities[0];
      if (entity?.type !== 'arc') throw new Error(`ARC method failed: ${method.id}`);
      expect(entity.center.x, method.id).toBeCloseTo(center.x, 9);
      expect(entity.center.y, method.id).toBeCloseTo(center.y, 9);
      expect(entity.radius, method.id).toBeCloseTo(10, 9);
    }
  });
  it('uses canonical commands for tangent circles and repeated point acquisition', () => {
    expect(drawRibbonMethods.CIRCLE?.find((m) => m.id === 'circle-ttt')?.macro).toBe(
      '^C^C_CIRCLE;_TTT;',
    );
    expect(moreDrawMethods.find((m) => m.id === 'point-multiple')?.macro).toBe(
      '^C^C_MULTIPLE;_POINT;',
    );
    for (const method of [...Object.values(drawRibbonMethods).flat(), ...moreDrawMethods]) {
      expect(method.ko).toMatch(/[가-힣]/);
      expect(method.en).toMatch(/[A-Za-z]/);
      expect(
        parseMacro(method.macro).steps.some((step) => step.type === 'unsupported'),
        method.id,
      ).toBe(false);
    }
  });
});
