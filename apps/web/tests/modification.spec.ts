import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { CadLine } from '@hancad/legacy-bridge';
import { drawing, enter, mapping, point } from './cad-actions';
import type { CanvasMapping } from './cad-actions';

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

async function dragWindow(
  page: Page,
  view: CanvasMapping,
  first: [number, number],
  second: [number, number],
): Promise<void> {
  await point(page, view, first[0], first[1], false);
  await page.mouse.down();
  await page.mouse.move(
    view.x + view.width / 2 + (second[0] - view.originX) * view.zoom,
    view.y + view.height / 2 + (-second[1] - view.originY) * view.zoom,
    { steps: 5 },
  );
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
});

test('preselected ribbon MOVE applies an exact relative displacement and preserves object identity', async ({
  page,
}) => {
  await line(page, '10,10', '30,10');
  const before = (await lines(page))[0];
  const view = await mapping(page);
  await point(page, view, 20, 10);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '1');
  await page.getByRole('button', { name: '이동', exact: true }).click();
  await expect(page.locator('.command-prompt')).toHaveText('기준점 지정:');
  await enter(page, '10,10');
  await enter(page, '@25,35');
  const moved = (await lines(page))[0];
  expect(moved).toMatchObject({ id: before?.id, a: { x: 35, y: -45 }, b: { x: 55, y: -45 } });
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-preview-count', '0');
  await enter(page, 'U');
  expect((await lines(page))[0]).toEqual(before);
  await enter(page, 'REDO');
  expect((await lines(page))[0]).toEqual(moved);
});

test('MOVE without preselection combines picked and window-selected objects before Enter', async ({
  page,
}) => {
  await line(page, '0,0', '10,0');
  await line(page, '30,10', '50,10');
  await line(page, '70,20', '90,20');
  const before = await lines(page);
  const view = await mapping(page);
  await enter(page, 'M');
  await expect(page.locator('.command-prompt')).toHaveText('객체 선택:');
  await point(page, view, 5, 0);
  await dragWindow(page, view, [28, 14], [52, 6]);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '2');
  await enter(page, '');
  await expect(page.locator('.command-prompt')).toHaveText('기준점 지정:');
  await enter(page, '0,0');
  await enter(page, '@10,20');
  const moved = await lines(page);
  expect(moved[0]).toMatchObject({ id: before[0]?.id, a: { x: 10, y: -20 }, b: { x: 20, y: -20 } });
  expect(moved[1]).toMatchObject({ id: before[1]?.id, a: { x: 40, y: -30 }, b: { x: 60, y: -30 } });
  expect(moved[2]).toEqual(before[2]);
});

test('an exact endpoint snap overrides Ortho for the MOVE target point', async ({ page }) => {
  await line(page, '0,0', '10,0');
  await line(page, '40,30', '60,30');
  await enter(page, 'OSMODE');
  await enter(page, '1');
  await page.keyboard.press('F8');
  await expect(page.getByRole('button', { name: '직교 모드', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const view = await mapping(page);
  await point(page, view, 5, 0);
  await enter(page, 'M');
  await enter(page, '0,0');
  await point(page, view, 40 + 3 / view.zoom, 30 + 3 / view.zoom, false);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-snap-kind', 'endpoint');
  await point(page, view, 40 + 3 / view.zoom, 30 + 3 / view.zoom);
  expect((await lines(page))[0]).toMatchObject({ a: { x: 40, y: -30 }, b: { x: 50, y: -30 } });
  expect((await lines(page))[1]).toMatchObject({ a: { x: 40, y: -30 }, b: { x: 60, y: -30 } });
});

test('repeated COPY placements finish as one undo group and redo restores every copy', async ({
  page,
}) => {
  await line(page, '10,10', '20,10');
  const original = (await lines(page))[0];
  const view = await mapping(page);
  await point(page, view, 15, 10);
  await page.getByRole('button', { name: '복사', exact: true }).click();
  await enter(page, '0,0');
  await enter(page, '@30,0');
  await enter(page, '@0,40');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await enter(page, '');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('3');
  const copied = await lines(page);
  expect(copied[0]).toEqual(original);
  expect(copied[1]).toMatchObject({ a: { x: 40, y: -10 }, b: { x: 50, y: -10 } });
  expect(copied[2]).toMatchObject({ a: { x: 10, y: -50 }, b: { x: 20, y: -50 } });
  expect(new Set(copied.map((entity) => entity.id)).size).toBe(3);
  await enter(page, 'U');
  expect(await lines(page)).toEqual([original]);
  await enter(page, 'REDO');
  expect(await lines(page)).toEqual(copied);
});

test('Esc before MOVE placement leaves the drawing unchanged and prints cancellation once', async ({
  page,
}) => {
  await line(page, '0,0', '20,0');
  const before = (await drawing(page)).entities;
  const view = await mapping(page);
  await point(page, view, 10, 0);
  await enter(page, 'M');
  await enter(page, '0,0');
  await point(page, view, 10, 2, false);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-preview-count', '1');
  const cancellations = page
    .getByRole('log', { name: '명령 기록' })
    .locator('.history-line')
    .filter({ hasText: /^\*취소\*$/ });
  const previousCount = await cancellations.count();
  await page.keyboard.press('Escape');
  expect((await drawing(page)).entities).toEqual(before);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-preview-count', '0');
  await expect(cancellations).toHaveCount(previousCount + 1);
  // The fit used for pointer mapping is a ZOOM undo step; the cancelled MOVE is not.
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
});

test('Esc after accepted COPY placements keeps the copies in one completed command', async ({
  page,
}) => {
  await line(page, '10,10', '20,10');
  const view = await mapping(page);
  await point(page, view, 15, 10);
  await enter(page, 'CO');
  await enter(page, '0,0');
  await enter(page, '@20,0');
  await enter(page, '@40,0');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('3');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-preview-count', '0');
  const copied = await lines(page);
  expect(copied.map((entity) => entity.a.x)).toEqual([10, 30, 50]);
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await enter(page, 'REDO');
  expect(await lines(page)).toEqual(copied);
});

test('NEW clears an active COPY session and subsequent input cannot revive its geometry', async ({
  page,
}) => {
  await line(page, '10,10', '20,10');
  const view = await mapping(page);
  await point(page, view, 15, 10);
  await enter(page, 'CO');
  await enter(page, '0,0');
  await enter(page, '@30,0');
  await page
    .getByRole('toolbar', { name: '신속 접근 도구막대' })
    .getByRole('button', { name: '새 도면', exact: true })
    .click();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-preview-count', '0');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '0');
  await line(page, '5,5', '15,5');
  expect(await lines(page)).toMatchObject([{ a: { x: 5, y: -5 }, b: { x: 15, y: -5 } }]);
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await page.reload();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
});
