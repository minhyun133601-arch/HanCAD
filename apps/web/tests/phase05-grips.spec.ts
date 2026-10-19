import { expect, test, type Page } from '@playwright/test';
import type { CadPolyline } from '@hancad/legacy-bridge';
import { drawing, enter, mapping, point } from './cad-actions';

async function setup(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  for (const [name, value] of [
    ['OSMODE', '0'],
    ['ORTHOMODE', '0'],
    ['DYNMODE', '0'],
    ['AUTOSNAP', '0'],
  ] as const) {
    await enter(page, name);
    await enter(page, value);
  }
}
async function polyline(page: Page): Promise<CadPolyline> {
  const entity = (await drawing(page)).entities[0];
  if (entity?.type !== 'polyline' && entity?.type !== 'rect') throw new Error('Expected polyline');
  return entity;
}
async function hoverMenu(
  page: Page,
  view: Awaited<ReturnType<typeof mapping>>,
  x: number,
  y: number,
): Promise<void> {
  await point(page, view, x, y, false);
  await expect(page.getByRole('menu', { name: '그립 편집', exact: true })).toBeVisible();
}

test('a line grip with three Spaces and factor 2 scales about that grip and has one undo group', async ({
  page,
}, testInfo) => {
  await setup(page);
  for (const token of ['L', '10,10', '110,10', '']) await enter(page, token);
  const before = await drawing(page),
    view = await mapping(page);
  await point(page, view, 45, 10);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '1');
  await point(page, view, 10, 10);
  await expect(page.locator('.command-prompt')).toContainText('신축');
  for (const mode of ['이동', '회전', '축척']) {
    await page.keyboard.press('Space');
    await expect(page.locator('.command-prompt')).toContainText(mode);
  }
  await enter(page, '2');
  await expect
    .poll(async () => (await drawing(page)).entities[0])
    .toMatchObject({
      a: { x: 10, y: -10 },
      b: { x: 210, y: -10 },
    });
  await page.screenshot({ path: testInfo.outputPath('grip-scaled-line.png') });
  await enter(page, 'U');
  await expect.poll(async () => (await drawing(page)).entities).toEqual(before.entities);
  await point(page, view, 45, 10, false);
  await hoverMenu(page, view, 10, 10);
  await enter(page, 'REDO');
  await expect(page.getByRole('menu', { name: '그립 편집', exact: true })).not.toBeVisible();
  await expect
    .poll(async () => (await drawing(page)).entities[0])
    .toMatchObject({ b: { x: 210, y: -10 } });
});

test('polyline vertex multifunction menus add/remove a vertex and convert an exact segment to/from an arc', async ({
  page,
}, testInfo) => {
  await setup(page);
  for (const token of ['PL', '0,0', '100,0', '100,60', '']) await enter(page, token);
  const view = await mapping(page);
  await point(page, view, 40, 0);
  await hoverMenu(page, view, 0, 0);
  for (const label of ['정점 추가(A)', '정점 제거(R)', '호로 변환(C)'])
    await expect(page.getByRole('menuitem', { name: label, exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: '정점 추가(A)', exact: true }).click();
  await enter(page, '50,20');
  await expect.poll(async () => (await polyline(page)).points.length).toBe(4);
  expect((await polyline(page)).points[1]).toEqual({ x: 50, y: -20 });
  expect((await polyline(page)).startWidths).toEqual([0, 0, 0, 0]);
  expect((await polyline(page)).endWidths).toEqual([0, 0, 0, 0]);
  await hoverMenu(page, view, 50, 20);
  await page.getByRole('menuitem', { name: '정점 제거(R)', exact: true }).click();
  await expect.poll(async () => (await polyline(page)).points.length).toBe(3);
  expect((await polyline(page)).startWidths).toEqual([0, 0, 0]);
  expect((await polyline(page)).endWidths).toEqual([0, 0, 0]);
  await hoverMenu(page, view, 0, 0);
  await page.getByRole('menuitem', { name: '호로 변환(C)', exact: true }).click();
  await enter(page, '50,50');
  await expect.poll(async () => (await polyline(page)).bulges?.[0]).toBeCloseTo(1, 9);
  await page.screenshot({ path: testInfo.outputPath('grip-polyline-arc.png') });
  await hoverMenu(page, view, 0, 0);
  await expect(page.getByRole('menuitem', { name: '선으로 변환(C)', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: '선으로 변환(C)', exact: true }).click();
  await expect.poll(async () => (await polyline(page)).bulges?.[0]).toBe(0);
  const saved = await polyline(page);
  for (const expected of [
    { count: 3, bulge: 1 },
    { count: 3, bulge: 0 },
    { count: 4, bulge: 0 },
    { count: 3, bulge: 0 },
  ]) {
    await enter(page, 'U');
    await expect.poll(async () => (await polyline(page)).points.length).toBe(expected.count);
    await expect
      .poll(async () => (await polyline(page)).bulges?.[0])
      .toBeCloseTo(expected.bulge, 9);
  }
  await enter(page, 'MREDO');
  await enter(page, '4');
  await expect.poll(async () => polyline(page)).toEqual(saved);
  await page.reload();
  await expect.poll(async () => polyline(page)).toEqual(saved);
});

test('Shift hot grips stretch together, copy placements stay provisional, and Esc commits copies in one undo step', async ({
  page,
}) => {
  await setup(page);
  for (const token of ['L', '0,0', '100,0', '']) await enter(page, token);
  const view = await mapping(page),
    canvas = page.getByTestId('drawing-canvas');
  await point(page, view, 40, 0);
  await page.keyboard.down('Shift');
  await point(page, view, 0, 0);
  await point(page, view, 100, 0);
  await page.keyboard.up('Shift');
  await point(page, view, 0, 0);
  await enter(page, '20,20');
  await expect
    .poll(async () => (await drawing(page)).entities[0])
    .toMatchObject({ a: { x: 20, y: -20 }, b: { x: 120, y: -20 } });
  await point(page, view, 20, 20);
  await page.keyboard.press('Space');
  await enter(page, 'C');
  await enter(page, '40,40');
  await enter(page, '60,60');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await expect(canvas).toHaveAttribute('data-preview-count', '2');
  await canvas.focus();
  await page.keyboard.press('F3');
  await point(page, view, 40 + 3 / view.zoom, 40 - 2 / view.zoom, false);
  await expect(canvas).toHaveAttribute('data-snap-kind', 'endpoint');
  await canvas.focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('3');
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
});

test('grip endpoints honor exact object snaps over Ortho and polar/dynamic distance-angle locks', async ({
  page,
}) => {
  await setup(page);
  for (const tokens of [
    ['L', '0,0', '100,0', ''],
    ['L', '80,35', '120,55', ''],
  ])
    for (const token of tokens) await enter(page, token);
  const view = await mapping(page),
    canvas = page.getByTestId('drawing-canvas');
  for (const [name, value] of [
    ['OSMODE', '1'],
    ['ORTHOMODE', '1'],
  ] as const) {
    await enter(page, name);
    await enter(page, value);
  }
  await point(page, view, 35, 0);
  await point(page, view, 0, 0);
  await point(page, view, 80 + 4 / view.zoom, 35 - 3 / view.zoom, false);
  await expect(canvas).toHaveAttribute('data-snap-kind', 'endpoint');
  await point(page, view, 80 + 4 / view.zoom, 35 - 3 / view.zoom);
  await expect
    .poll(async () => (await drawing(page)).entities[0])
    .toMatchObject({ a: { x: 80, y: -35 }, b: { x: 100, y: 0 } });
  await enter(page, 'U');
  await canvas.focus();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  for (const [name, value] of [
    ['OSMODE', '0'],
    ['ORTHOMODE', '0'],
    ['AUTOSNAP', '63'],
    ['POLARANG', '30'],
    ['DYNMODE', '3'],
  ] as const) {
    await enter(page, name);
    await enter(page, value);
  }
  await point(page, view, 35, 0);
  await point(page, view, 0, 0);
  await page.keyboard.press('Space');
  await point(page, view, 30, 30 / Math.sqrt(3), false);
  await expect(canvas).toHaveAttribute('data-tracking-tooltip', /극좌표:/);
  await canvas.focus();
  await page.keyboard.type('100');
  await page.keyboard.press('Tab');
  const overlay = page.getByTestId('dynamic-input');
  await expect(overlay.locator('[data-field="distance"]')).toHaveAttribute('data-locked', 'true');
  await page.keyboard.type('30');
  await page.keyboard.press('Tab');
  await expect(overlay.locator('[data-field="angle"]')).toHaveAttribute('data-locked', 'true');
  await point(page, view, 60, 45);
  const line = (await drawing(page)).entities[0];
  if (line?.type !== 'line') throw new Error('Expected LINE');
  expect(line.a.x).toBeCloseTo(100 * Math.cos(Math.PI / 6), 9);
  expect(line.a.y).toBeCloseTo(-50, 9);
});

test('DYNDIVIS and DYNDIGRIP control object-result fields and invalid locked lengths cannot commit mouse edits', async ({
  page,
}, testInfo) => {
  test.setTimeout(45000);
  await setup(page);
  for (const token of ['L', '0,0', '100,0', '']) await enter(page, token);
  const view = await mapping(page),
    canvas = page.getByTestId('drawing-canvas'),
    overlay = page.getByTestId('dynamic-input');
  await enter(page, 'DYNMODE');
  await enter(page, '3');
  for (const [visibility, mask, fields] of [
    [0, 0, ['lengthChange']],
    [1, 0, ['lengthChange', 'result']],
    [2, 0, []],
    [2, 15, ['lengthChange', 'result', 'absoluteAngle', 'angleChange']],
    [2, 5, ['result', 'absoluteAngle']],
  ] as const) {
    await enter(page, 'DYNDIVIS');
    await enter(page, String(visibility));
    await enter(page, 'DYNDIGRIP');
    await enter(page, String(mask));
    await point(page, view, 35, 0);
    await point(page, view, 0, 0);
    await point(page, view, 15, 10, false);
    await expect(overlay.locator('[data-field]')).toHaveCount(fields.length);
    for (const field of fields)
      await expect(overlay.locator(`[data-field="${field}"]`)).toBeVisible();
    if (mask === 15)
      await page.screenshot({ path: testInfo.outputPath('grip-dynamic-dimensions.png') });
    if (visibility !== 2 || mask !== 5) {
      await canvas.focus();
      await page.keyboard.press('Escape');
    }
  }
  await overlay.getByRole('button', { name: '결과 길이', exact: true }).click();
  await page.keyboard.type('0');
  await page.keyboard.press('Tab');
  await expect(overlay.locator('[data-field="result"]')).toHaveAttribute('aria-invalid', 'true');
  await point(page, view, 60, 20);
  expect((await drawing(page)).entities[0]).toMatchObject({
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
  });
  await expect(page.locator('.command-prompt')).toContainText('신축');
  await overlay.getByRole('button', { name: '결과 길이', exact: true }).click();
  await page.keyboard.type('150');
  await page.keyboard.press('Tab');
  await page.keyboard.type('90');
  await page.keyboard.press('Tab');
  await point(page, view, 60, 20);
  const result = (await drawing(page)).entities[0];
  if (result?.type !== 'line') throw new Error('Expected LINE');
  expect(result.a.x).toBeCloseTo(100, 9);
  expect(result.a.y).toBeCloseTo(-150, 9);
  expect(result.b).toEqual({ x: 100, y: 0 });
});
