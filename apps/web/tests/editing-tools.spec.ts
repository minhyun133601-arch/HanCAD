import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { CadLine } from '@hancad/legacy-bridge';
import { drawing, enter, mapping, point } from './cad-actions';
import type { CanvasMapping } from './cad-actions';

const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await variable(page, 'OSMODE', '0');
  await variable(page, 'ORTHOMODE', '0');
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function variable(page: Page, name: string, value: string): Promise<void> {
  await enter(page, name);
  await enter(page, value);
}

async function value(page: Page, name: string, expected: string): Promise<void> {
  await enter(page, 'GETVAR');
  await enter(page, name);
  await expect(
    page.getByRole('log', { name: '명령 기록' }).locator('.history-line').last(),
  ).toHaveText(`${name} = ${expected}`);
}

async function line(page: Page, first: string, second: string): Promise<void> {
  await enter(page, 'L');
  await enter(page, first);
  await enter(page, second);
  await enter(page, '');
}

async function lines(page: Page): Promise<CadLine[]> {
  return (await drawing(page)).entities.filter(
    (entity): entity is CadLine => entity.type === 'line',
  );
}

async function fence(page: Page, view: CanvasMapping): Promise<void> {
  await point(page, view, 10, 30, false);
  await page.mouse.down();
  await page.mouse.move(
    view.x + view.width / 2 + (10 - view.originX) * view.zoom,
    view.y + view.height / 2 + (-70 - view.originY) * view.zoom,
    { steps: 8 },
  );
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-area', 'fence');
  await page.mouse.up();
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-area', '');
}

test('Quick TRIM previews a pick, trims a real fence and Shift-extends within one undo group', async ({
  page,
}, testInfo) => {
  await line(page, '0,40', '100,40');
  await line(page, '0,60', '100,60');
  await line(page, '30,0', '30,100');
  await line(page, '100,0', '100,100');
  await line(page, '60,80', '80,80');
  const before = (await drawing(page)).entities;
  const view = await mapping(page);
  const canvas = page.getByTestId('drawing-canvas');
  await enter(page, 'TR');
  await expect(page.locator('.command-prompt')).toContainText('자를 객체 선택');
  await point(page, view, 10, 40, false);
  await expect(canvas).toHaveAttribute('data-preview-count', '1');
  await point(page, view, 10, 40);
  expect((await drawing(page)).entities).toEqual(before);
  await enter(page, 'U');
  await fence(page, view);
  await page.keyboard.down('Shift');
  await point(page, view, 75, 80, false);
  await expect(canvas).toHaveAttribute('data-preview-count', '1');
  await point(page, view, 75, 80);
  await page.keyboard.up('Shift');
  await enter(page, '');
  const result = await lines(page);
  expect(result[0]).toMatchObject({
    id: before[0]?.id,
    a: { x: 30, y: -40 },
    b: { x: 100, y: -40 },
  });
  expect(result[1]).toMatchObject({
    id: before[1]?.id,
    a: { x: 30, y: -60 },
    b: { x: 100, y: -60 },
  });
  expect(result[4]).toMatchObject({
    id: before[4]?.id,
    a: { x: 60, y: -80 },
    b: { x: 100, y: -80 },
  });
  await expect(canvas).toHaveAttribute('data-preview-count', '0');
  await page.screenshot({ path: testInfo.outputPath('quick-trim-fence-extend.png') });
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(before);
  await enter(page, 'REDO');
  expect(await lines(page)).toEqual(result);
});

test('Standard TRIM uses only the selected boundary and preserves unselected cutting geometry', async ({
  page,
}) => {
  await line(page, '0,50', '100,50');
  await line(page, '30,0', '30,100');
  await line(page, '70,0', '70,100');
  await variable(page, 'TRIMEXTENDMODE', '0');
  const before = (await drawing(page)).entities;
  const view = await mapping(page);
  await enter(page, 'TRIM');
  await expect(page.locator('.command-prompt')).toHaveText(
    '절단 모서리 선택... 객체 선택 또는 <모두 선택>:',
  );
  await point(page, view, 30, 20);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '1');
  await enter(page, '');
  await expect(page.locator('.command-prompt')).toContainText('자를 객체 선택');
  await point(page, view, 50, 50);
  await enter(page, '');
  const result = await lines(page);
  expect(result).toHaveLength(3);
  expect(result[0]).toMatchObject({ id: before[0]?.id, a: { x: 0, y: -50 }, b: { x: 30, y: -50 } });
  expect(result.slice(1)).toEqual(before.slice(1));
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(before);
});

test('OFFSET Multiple previews, locally undoes and repeats offsets before whole-command undo and redo', async ({
  page,
}, testInfo) => {
  await line(page, '0,0', '200,0');
  await line(page, '0,100', '200,100');
  const before = (await drawing(page)).entities;
  const view = await mapping(page);
  const canvas = page.getByTestId('drawing-canvas');
  await enter(page, 'O');
  await enter(page, '10');
  await point(page, view, 100, 0);
  await enter(page, 'M');
  await point(page, view, 100, 40, false);
  await expect(canvas).toHaveAttribute('data-preview-count', '1');
  await point(page, view, 100, 40);
  await point(page, view, 100, 40);
  await enter(page, 'U');
  await point(page, view, 100, 40);
  expect((await drawing(page)).entities).toEqual(before);
  await enter(page, '');
  await expect(page.locator('.command-prompt')).toContainText('간격띄우기할 객체 선택');
  await point(page, view, 100, 100);
  await point(page, view, 100, 70);
  await page.keyboard.press('Escape');
  const result = await lines(page);
  expect(result).toHaveLength(5);
  expect(result.slice(0, 2)).toEqual(before);
  expect(result.slice(2).map((entity) => entity.a.y)).toEqual([-10, -20, -90]);
  expect(new Set(result.map((entity) => entity.id)).size).toBe(5);
  await expect(canvas).toHaveAttribute('data-preview-count', '0');
  await page.screenshot({ path: testInfo.outputPath('multiple-offsets.png') });
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(before);
  await value(page, 'OFFSETDIST', '10');
  await enter(page, 'MREDO');
  await enter(page, '1');
  expect(await lines(page)).toEqual(result);
});

test('circle Through and session/profile settings survive NEW while OFFSETDIST resets on reload', async ({
  page,
}) => {
  await line(page, '0,0', '100,0');
  await enter(page, 'C');
  await enter(page, '50,50');
  await enter(page, '20');
  await variable(page, 'OFFSETGAPTYPE', '2');
  await variable(page, 'TRIMEXTENDMODE', '0');
  await variable(page, 'EDGEMODE', '1');
  const view = await mapping(page);
  const before = (await drawing(page)).entities;
  await enter(page, 'OFFSET');
  await enter(page, 'Through');
  await point(page, view, 70, 50);
  await enter(page, '80,50');
  await enter(page, '');
  const result = (await drawing(page)).entities;
  expect(result.slice(0, 2)).toEqual(before);
  expect(result[2]).toMatchObject({ type: 'circle', center: { x: 50, y: -50 }, radius: 30 });
  await value(page, 'OFFSETDIST', '-1');
  await enter(page, 'O');
  await enter(page, '12');
  await page.keyboard.press('Escape');
  await value(page, 'OFFSETDIST', '12');
  await enter(page, 'NEW');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await value(page, 'OFFSETDIST', '12');
  await value(page, 'OFFSETGAPTYPE', '2');
  await value(page, 'TRIMEXTENDMODE', '0');
  await value(page, 'EDGEMODE', '1');
  await enter(page, 'O');
  await expect(page.locator('.command-prompt')).toContainText('<12>');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await value(page, 'OFFSETDIST', '-1');
  await value(page, 'TRIMEXTENDMODE', '0');
  await value(page, 'EDGEMODE', '1');
  await value(page, 'OFFSETGAPTYPE', '2');
});
