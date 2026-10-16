import { expect, type Page } from '@playwright/test';
import type { CadDimensionGeometry, LegacyCadRuntime, LegacyCadState } from '@hancad/legacy-bridge';

export async function enter(page: Page, value: string): Promise<void> {
  await page.getByRole('textbox', { name: '명령 입력', exact: true }).focus();
  for (const character of value) {
    if (character === '@') await page.keyboard.press('Shift+Digit2');
    else if (character === '<') await page.keyboard.press('Shift+Comma');
    else if (character === '>') await page.keyboard.press('Shift+Period');
    else if (character === '#') await page.keyboard.press('Shift+Digit3');
    else await page.keyboard.type(character);
  }
  await page.keyboard.press('Enter');
}

export async function drawing(page: Page): Promise<LegacyCadState> {
  return page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('hancad.active-drawing.v1') ?? '{}').state as LegacyCadState,
  );
}

export async function dimensions(page: Page): Promise<CadDimensionGeometry[]> {
  return page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('hancad.active-drawing.v1') ?? '{}')
      .state as LegacyCadState;
    const runtime = (globalThis as typeof globalThis & { HeechangTool?: LegacyCadRuntime })
      .HeechangTool;
    if (!runtime) throw new Error('Local CAD runtime is unavailable');
    return state.entities
      .filter((entity) => entity.type === 'dimension')
      .map((entity) => {
        const geometry = runtime.core.cadEngine.dimensionGeometry(entity);
        if (!geometry) throw new Error('Dimension geometry is invalid');
        return geometry;
      });
  });
}

export async function mapping(page: Page, clearOfCommandLine = true) {
  await page.getByRole('button', { name: '도면 전체 맞춤', exact: true }).click();
  await settleView(page);
  if (clearOfCommandLine) {
    // Like AutoCAD, the floating command line covers the bottom of the drawing area;
    // shrink the extents so picks near their edges never land on the bar.
    await enter(page, 'ZOOM');
    await enter(page, '0.8X');
    await settleView(page);
  }
  await enter(page, 'GETVAR');
  await enter(page, 'VIEWCTR');
  const output = page.getByRole('log', { name: '명령 기록' }).locator('.history-line').last();
  await expect(output).toContainText('VIEWCTR = ');
  const coordinates = ((await output.innerText()).split(' = ')[1] ?? '').split(',').map(Number);
  if (!Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1]))
    throw new Error('Invalid current view center');
  // Extents implementations can use different conservative label bounds; query the actual camera.
  return page.getByTestId('drawing-canvas').evaluate((node, center) => {
    const rect = node.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      zoom: Number((node as HTMLElement).dataset.zoom),
      originX: center[0]!,
      originY: -center[1]!,
    };
  }, coordinates);
}
/** Waits for camera animation and its final GPU frame before coordinate-based input. */
export async function settleView(page: Page): Promise<void> {
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-view-transition', '0');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
export type CanvasMapping = Awaited<ReturnType<typeof mapping>>;
export async function point(
  page: Page,
  view: CanvasMapping,
  x: number,
  y: number,
  click = true,
): Promise<void> {
  const target = {
    x: view.x + view.width / 2 + (x - view.originX) * view.zoom,
    y: view.y + view.height / 2 + (-y - view.originY) * view.zoom,
  };
  if (click) await page.mouse.click(target.x, target.y);
  else await page.mouse.move(target.x, target.y);
}
