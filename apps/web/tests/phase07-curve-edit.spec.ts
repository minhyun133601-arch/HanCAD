import { expect, test, type Page } from '@playwright/test';
import { drawing, enter, mapping, point } from './cad-actions';

async function tokens(page: Page, values: readonly string[]): Promise<void> {
  for (const value of values) await enter(page, value);
}
test.beforeEach(async ({ page }) => {
  page.on('console', (message) => {
    if (message.type() === 'error') console.log(message.text());
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await tokens(page, [
    'OSMODE',
    '0',
    'ORTHOMODE',
    '0',
    'SNAPMODE',
    '0',
    'AUTOSNAP',
    '0',
    'DYNMODE',
    '0',
  ]);
});

test('JOIN collinear lines across a gap produces a LINE and one U restores both originals', async ({
  page,
}) => {
  await tokens(page, ['LINE', '0,0', '40,0', '', 'LINE', '100,0', '60,0', '']);
  const before = (await drawing(page)).entities;
  await tokens(page, ['JOIN', 'ALL', '']);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  expect((await drawing(page)).entities[0]).toMatchObject({
    type: 'line',
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
  });
  await enter(page, 'U');
  await expect.poll(async () => (await drawing(page)).entities).toEqual(before);
  await enter(page, 'REDO');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
});

test('JOIN line and arc, PEDIT width, and EXPLODE retain exact centerline components and warn in Korean', async ({
  page,
}, info) => {
  await tokens(page, [
    'LINE',
    '0,0',
    '100,0',
    '',
    'ARC',
    '100,0',
    'C',
    '100,50',
    '150,50',
    'JOIN',
    'ALL',
    '',
  ]);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  const joined = (await drawing(page)).entities[0];
  expect(joined?.curve?.type).toBe('LWPOLYLINE');
  if (joined?.type !== 'polyline') throw new Error('Expected joined polyline');
  expect(Math.abs(joined.bulges?.[1] ?? 0)).toBeCloseTo(Math.tan(Math.PI / 8), 9);
  const view = await mapping(page);
  await enter(page, 'PEDIT');
  await point(page, view, 50, 0);
  await expect(page.locator('.command-prompt')).toContainText('정점 편집(E)');
  await tokens(page, ['W', '5', 'L', 'ON', '']);
  const before = (await drawing(page)).entities;
  expect(before[0]).toMatchObject({ constantWidth: 5, plinegen: true });
  await tokens(page, ['EXPLODE', 'ALL', '']);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  expect((await drawing(page)).entities.map((e) => e.type)).toEqual(['line', 'arc']);
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText('폭 및 접선 정보');
  await page.screenshot({ path: info.outputPath('wide-polyline-explode-warning.png') });
  await enter(page, 'U');
  await expect.poll(async () => (await drawing(page)).entities).toEqual(before);
});

test('BREAK accepts the physical @ key at the second point and U restores the whole line', async ({
  page,
}) => {
  await tokens(page, ['LINE', '0,0', '100,0', '']);
  const before = (await drawing(page)).entities;
  const view = await mapping(page);
  await enter(page, 'BREAK');
  await point(page, view, 40, 0);
  await expect(page.locator('.command-prompt')).toContainText('두 번째');
  await tokens(page, ['F', '40,0', '@']);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  const after = (await drawing(page)).entities;
  if (after[0]?.type !== 'line' || after[1]?.type !== 'line') throw new Error('Expected two lines');
  expect(after[0].b.x).toBeCloseTo(40, 6);
  expect(after[1].a.x).toBeCloseTo(40, 6);
  await enter(page, 'U');
  await expect.poll(async () => (await drawing(page)).entities).toEqual(before);
});

test('SPLINEDIT elevates exact control geometry, reverses, converts to polyline and survives recovery', async ({
  page,
}, info) => {
  await tokens(page, ['SPLINE', 'M', 'CV', 'D', '3', '0,0', '25,50', '75,50', '100,0', '']);
  const view = await mapping(page);
  await enter(page, 'SPLINEDIT');
  await point(page, view, 50, 37.5);
  await expect(page.locator('.command-prompt')).toContainText('정점 편집(E)');
  await tokens(page, ['E', 'E', '6', 'X', 'R', '']);
  const elevated = (await drawing(page)).entities;
  expect(elevated[0]?.curve).toMatchObject({ type: 'SPLINE', degree: 5 });
  await enter(page, 'SPLINEDIT');
  await point(page, view, 50, 37.5);
  await tokens(page, ['P', '12']);
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
  const converted = (await drawing(page)).entities;
  expect(converted[0]?.sourceType).toBe('LWPOLYLINE');
  expect(converted[0]?.curve).toBeUndefined();
  await page.screenshot({ path: info.outputPath('splinedit-converted-polyline.png') });
  await enter(page, 'U');
  await expect.poll(async () => (await drawing(page)).entities).toEqual(elevated);
  await enter(page, 'REDO');
  await page.reload();
  await expect.poll(async () => (await drawing(page)).entities).toEqual(converted);
});

test('LENGTHEN Dynamic previews its projected endpoint and Escape retains one accepted edit', async ({
  page,
}) => {
  await tokens(page, ['LINE', '0,0', '100,0', '']);
  const before = (await drawing(page)).entities;
  const view = await mapping(page);
  await tokens(page, ['LENGTHEN', 'DY']);
  await point(page, view, 90, 0);
  await point(page, view, 140, 25, false);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-preview-count', '1');
  await enter(page, '140,25');
  await page.getByTestId('drawing-canvas').focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  expect((await drawing(page)).entities[0]).toMatchObject({ type: 'line', b: { x: 140, y: 0 } });
  await enter(page, 'U');
  await expect.poll(async () => (await drawing(page)).entities).toEqual(before);
});

test('PEDIT Multiple uses nested window selection and one U restores converted lines', async ({
  page,
}) => {
  await tokens(page, [
    'LINE',
    '0,0',
    '20,0',
    '',
    'LINE',
    '30,0',
    '50,0',
    '',
    'LINE',
    '100,0',
    '120,0',
    '',
  ]);
  const before = (await drawing(page)).entities;
  await tokens(page, ['PEDIT', 'M', 'W', '-5,-5', '55,5', '', 'Y', 'W', '3', '']);
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
  const after = (await drawing(page)).entities;
  expect(after.map((e) => e.type)).toEqual(['polyline', 'polyline', 'line']);
  expect(after.slice(0, 2).every((e) => e.type === 'polyline' && e.constantWidth === 3)).toBe(true);
  await enter(page, 'U');
  await expect.poll(async () => (await drawing(page)).entities).toEqual(before);
});

test('JOIN single ARC exposes Close after selection and one U restores the ARC', async ({
  page,
}) => {
  await tokens(page, ['ARC', '10,0', 'C', '0,0', '0,10']);
  const before = (await drawing(page)).entities;
  await tokens(page, ['JOIN', 'ALL', '']);
  await expect(page.locator('.command-prompt')).toContainText('닫기(C)');
  await enter(page, 'C');
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
  expect((await drawing(page)).entities[0]?.type).toBe('circle');
  await enter(page, 'U');
  await expect.poll(async () => (await drawing(page)).entities).toEqual(before);
});

test('SPLINEDIT Kink survives Move, Tolerance, recovery and a later Tolerance edit', async ({
  page,
}) => {
  await tokens(page, ['SPLINE', '0,0', '20,30', '40,0', '60,20', '80,0', '', '', '']);
  let view = await mapping(page);
  await enter(page, 'SPLINEDIT');
  await point(page, view, 20, 30);
  await tokens(page, ['F', 'K', '20,30', 'M', '2', '20,70', 'X', 'L', '0.5', 'X', '']);
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
  const before = (await drawing(page)).entities[0]?.curve;
  expect(before).toMatchObject({ type: 'SPLINE', kinkFitIndices: [1], fitTolerance: 0.5 });
  await page.reload();
  await expect.poll(async () => (await drawing(page)).entities[0]?.curve).toEqual(before);
  view = await mapping(page);
  await enter(page, 'SPLINEDIT');
  await point(page, view, 20, 70);
  await tokens(page, ['F', 'L', '0.1', 'X', '']);
  expect((await drawing(page)).entities[0]?.curve).toMatchObject({
    type: 'SPLINE',
    kinkFitIndices: [1],
    fitTolerance: 0.1,
  });
});
