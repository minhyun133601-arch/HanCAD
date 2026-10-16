import { expect, test, type Page } from '@playwright/test';
import { drawing, enter, mapping, point, type CanvasMapping } from './cad-actions';

async function setup(page: Page): Promise<CanvasMapping> {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  for (const [name, value] of [
    ['VTENABLE', '0'],
    ['GRIDMODE', '0'],
    ['SNAPMODE', '0'],
    ['ORTHOMODE', '0'],
    ['OSMODE', '0'],
  ]) {
    await enter(page, name!);
    await enter(page, value!);
  }
  for (const y of [0, 50]) {
    await enter(page, 'LINE');
    await enter(page, `0,${y}`);
    await enter(page, `100,${y}`);
    await enter(page, '');
  }
  return mapping(page);
}

async function snapMenu(page: Page, view: CanvasMapping, name: string): Promise<void> {
  await point(page, view, 50, 25, false);
  await page.keyboard.down('Shift');
  await page.mouse.click(
    view.x + view.width / 2 + (50 - view.originX) * view.zoom,
    view.y + view.height / 2 + (-25 - view.originY) * view.zoom,
    { button: 'right' },
  );
  await page.keyboard.up('Shift');
  await page.getByRole('menuitem', { name, exact: true }).click();
}

test('a menu snap overrides running modes for one accepted point only', async ({ page }) => {
  const view = await setup(page);
  await enter(page, 'OSMODE');
  await enter(page, '2');
  await enter(page, 'LINE');
  await snapMenu(page, view, '끝점');
  const canvas = page.getByTestId('drawing-canvas');
  await point(page, view, 3 / view.zoom, 3 / view.zoom, false);
  await expect(canvas).toHaveAttribute('data-snap-kind', 'endpoint');
  await point(page, view, 3 / view.zoom, 3 / view.zoom);
  await point(page, view, 50 + 3 / view.zoom, 50 + 3 / view.zoom, false);
  await expect(canvas).toHaveAttribute('data-snap-kind', 'midpoint');
  await point(page, view, 50 + 3 / view.zoom, 50 + 3 / view.zoom);
  await enter(page, '');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('3');
  expect((await drawing(page)).entities.at(-1)).toMatchObject({
    type: 'line',
    a: { x: 0, y: 0 },
    b: { x: 50, y: -50 },
  });
  await enter(page, 'GETVAR');
  await enter(page, 'OSMODE');
  await expect(page.getByRole('log').locator('.history-line').last()).toHaveText('OSMODE = 2');
});

test('None suppresses object snaps for one point and restores running snaps', async ({ page }) => {
  const view = await setup(page);
  await enter(page, 'OSMODE');
  await enter(page, '1');
  await enter(page, 'LINE');
  await snapMenu(page, view, '없음');
  const canvas = page.getByTestId('drawing-canvas');
  await point(page, view, 3 / view.zoom, 3 / view.zoom, false);
  await expect(canvas).toHaveAttribute('data-snap-kind', '');
  await point(page, view, 3 / view.zoom, 3 / view.zoom);
  await point(page, view, 100 - 3 / view.zoom, 50 + 3 / view.zoom, false);
  await expect(canvas).toHaveAttribute('data-snap-kind', 'endpoint');
  await point(page, view, 100 - 3 / view.zoom, 50 + 3 / view.zoom);
  await enter(page, '');
  const entity = (await drawing(page)).entities.at(-1);
  if (entity?.type !== 'line') throw new Error('Expected a drafted line.');
  expect(entity.a.x).toBeGreaterThan(0);
  expect(entity.a.y).toBeLessThan(0);
  expect(entity.b).toEqual({ x: 100, y: -50 });
});

test('failed acquisition and a rejected zero-length point keep the menu override', async ({
  page,
}) => {
  const view = await setup(page);
  await enter(page, 'LINE');
  await enter(page, '50,0');
  await snapMenu(page, view, '중간점');
  await point(page, view, 50, 25);
  await expect(page.getByRole('log')).toContainText('중간점 객체 스냅점을 찾을 수 없습니다.');
  await point(page, view, 50, 0);
  await expect(page.getByRole('log')).toContainText('서로 다른 점을 지정하세요.');
  await point(page, view, 50 + 3 / view.zoom, 50 + 3 / view.zoom, false);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-snap-kind', 'midpoint');
  await point(page, view, 50 + 3 / view.zoom, 50 + 3 / view.zoom);
  await enter(page, '');
  expect((await drawing(page)).entities.at(-1)).toMatchObject({
    type: 'line',
    a: { x: 50, y: 0 },
    b: { x: 50, y: -50 },
  });
});

test('accepted typed coordinates and Escape clear a pending menu override', async ({ page }) => {
  const view = await setup(page);
  await enter(page, 'LINE');
  await snapMenu(page, view, '중간점');
  await enter(page, '25,25');
  await point(page, view, 50 + 3 / view.zoom, 3 / view.zoom, false);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-snap-kind', '');
  await snapMenu(page, view, '중간점');
  await page.keyboard.press('Escape');
  await enter(page, 'LINE');
  await point(page, view, 50 + 3 / view.zoom, 3 / view.zoom, false);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-snap-kind', '');
});

test('a transparent ZOOM center consumes its exact menu snap before resuming LINE', async ({
  page,
}) => {
  const view = await setup(page);
  await enter(page, 'LINE');
  await enter(page, '25,25');
  await enter(page, "'ZOOM");
  await enter(page, 'C');
  await snapMenu(page, view, '중간점');
  await point(page, view, 50 + 3 / view.zoom, 50 + 3 / view.zoom, false);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-snap-kind', 'midpoint');
  await point(page, view, 50 + 3 / view.zoom, 50 + 3 / view.zoom);
  await enter(page, '100');
  await expect(page.locator('.command-prompt')).toContainText('다음 점');
  await page.keyboard.press('Escape');
  await enter(page, 'GETVAR');
  await enter(page, 'VIEWCTR');
  await expect(page.getByRole('log').locator('.history-line').last()).toHaveText(
    'VIEWCTR = 50,50,0',
  );
  const next = await mapping(page);
  await enter(page, 'LINE');
  await point(page, next, 50 + 3 / next.zoom, 50 + 3 / next.zoom, false);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-snap-kind', '');
});

test('a ribbon macro clears the previous command object snap override', async ({ page }) => {
  const view = await setup(page);
  await enter(page, 'LINE');
  await enter(page, '25,25');
  await snapMenu(page, view, '중간점');
  await page.getByRole('button', { name: '원', exact: true }).click();
  await expect(page.locator('.command-prompt')).toContainText('중심점');
  await point(page, view, 50 + 3 / view.zoom, 50 + 3 / view.zoom, false);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-snap-kind', '');
  await point(page, view, 50 + 3 / view.zoom, 50 + 3 / view.zoom);
  await enter(page, '10');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('3');
  const entity = (await drawing(page)).entities.at(-1);
  if (entity?.type !== 'circle') throw new Error('Expected a drafted circle.');
  expect(entity.center.x).toBeGreaterThan(50);
  expect(entity.center.y).toBeLessThan(-50);
});
