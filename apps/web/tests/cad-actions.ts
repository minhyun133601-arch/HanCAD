import type { Page } from '@playwright/test';
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

export async function mapping(page: Page) {
  await page.getByRole('button', { name: '도면 전체 맞춤', exact: true }).click();
  return page.getByTestId('drawing-canvas').evaluate((node) => {
    const state = JSON.parse(localStorage.getItem('hancad.active-drawing.v1') ?? '{}')
      .state as LegacyCadState;
    const runtime = (globalThis as typeof globalThis & { HeechangTool?: LegacyCadRuntime })
      .HeechangTool;
    if (!runtime) throw new Error('Local CAD runtime is unavailable');
    const bounds = runtime.core.cadExporters.boundsOf(state, true);
    const rect = node.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      zoom: Number((node as HTMLElement).dataset.zoom),
      originX: (bounds.minX + bounds.maxX) / 2,
      originY: (bounds.minY + bounds.maxY) / 2,
    };
  });
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
