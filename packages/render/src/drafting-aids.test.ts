import { describe, expect, it } from 'vitest';
import { createTestCanvas } from '../../legacy-bridge/src/test-canvas';
import {
  adaptiveGridSpacing,
  defaultAidSettings,
  drawDraftingAids,
  drawGrid,
} from './drafting-aids';

describe('drafting cursor, grid and UCS display', () => {
  const viewport = { width: 800, height: 600 };
  const screen = (point: { x: number; y: number }) => ({ x: point.x + 400, y: point.y + 300 });
  it('adapts by GRIDMAJOR, supports subdivision and suppresses overly dense fixed grids', () => {
    expect(adaptiveGridSpacing(10, 0.1, 5, 2)).toBe(250);
    expect(adaptiveGridSpacing(10, 100, 5, 6)).toBeCloseTo(0.4);
    expect(adaptiveGridSpacing(10, 0.1, 5, 0)).toBeUndefined();
  });
  it('draws lines or dots with clipped limits and hides the grid through GRIDMODE', () => {
    const fixture = createTestCanvas(),
      context = fixture.canvas.getContext('2d')!;
    const view = { center: { x: 0, y: 0 }, height: 600 };
    drawGrid(context, viewport, view, screen, { ...defaultAidSettings, gridMode: 0 });
    expect(fixture.operations).toHaveLength(0);
    drawGrid(context, viewport, view, screen, { ...defaultAidSettings, gridDisplay: 0 });
    expect(fixture.operations.some((operation) => operation.name === 'clip')).toBe(true);
    const lines = fixture.operations.filter((operation) => operation.name === 'lineTo').length;
    drawGrid(context, viewport, view, screen, { ...defaultAidSettings, gridStyle: 1 });
    expect(fixture.operations.some((operation) => operation.name === 'fillRect')).toBe(true);
    expect(
      fixture.operations.filter((operation) => operation.name === 'lineTo').length - lines,
    ).toBe(2);
  });
  it('uses CURSORSIZE and PICKBOX in screen pixels and draws no cursor when outside', () => {
    const fixture = createTestCanvas(),
      context = fixture.canvas.getContext('2d')!;
    drawDraftingAids(context, viewport, screen, { ...defaultAidSettings, ucsIcon: 0 });
    expect(fixture.operations.some((operation) => operation.name === 'strokeRect')).toBe(false);
    drawDraftingAids(
      context,
      viewport,
      screen,
      { ...defaultAidSettings, ucsIcon: 0, cursorSize: 100, pickbox: 10 },
      { x: 400, y: 300 },
    );
    expect(fixture.operations.find((operation) => operation.name === 'strokeRect')?.args).toEqual([
      395.5, 295.5, 10, 10,
    ]);
    expect(
      fixture.operations.some(
        (operation) => operation.name === 'moveTo' && operation.args[0] === -399.5,
      ),
    ).toBe(true);
  });
  it('puts UCS at origin or the lower left corner and honors visibility', () => {
    const fixture = createTestCanvas(),
      context = fixture.canvas.getContext('2d')!;
    drawDraftingAids(context, viewport, screen, { ...defaultAidSettings, ucsIcon: 3 });
    expect(
      fixture.operations.some(
        (operation) =>
          operation.name === 'moveTo' && operation.args[0] === 400 && operation.args[1] === 252,
      ),
    ).toBe(true);
    drawDraftingAids(context, viewport, screen, { ...defaultAidSettings, ucsIcon: 1 });
    expect(
      fixture.operations.some(
        (operation) =>
          operation.name === 'moveTo' && operation.args[0] === 35 && operation.args[1] === 517,
      ),
    ).toBe(true);
  });
});
