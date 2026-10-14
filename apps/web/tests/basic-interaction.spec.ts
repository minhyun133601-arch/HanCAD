import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { dimensions, drawing, enter, mapping, point } from './cad-actions';
import type { CanvasMapping } from './cad-actions';

const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

function screen(view: CanvasMapping, x: number, y: number) {
  return {
    x: Math.round(view.x + view.width / 2 + (x - view.originX) * view.zoom),
    y: Math.round(view.y + view.height / 2 + (-y - view.originY) * view.zoom),
  };
}

async function variable(page: Page, name: string, value: string): Promise<void> {
  await enter(page, name);
  await enter(page, value);
}

async function line(page: Page, first: string, second: string): Promise<void> {
  await enter(page, 'L');
  await enter(page, first);
  await enter(page, second);
  await enter(page, '');
}

async function drag(
  page: Page,
  start: { x: number; y: number },
  end: { x: number; y: number },
  area: 'window' | 'crossing' | '',
): Promise<void> {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-area', area);
  await page.mouse.up();
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-area', '');
}

async function zoom(page: Page): Promise<number> {
  return Number(await page.getByTestId('drawing-canvas').getAttribute('data-zoom'));
}

async function probeDistance(page: Page, position: { x: number; y: number }): Promise<number> {
  await enter(page, 'DI');
  await page.mouse.click(position.x, position.y);
  await enter(page, '0,0');
  const log = await page.getByRole('log', { name: '명령 기록' }).innerText();
  const values = [...log.matchAll(/거리 = ([\d.]+)/g)];
  const value = values.at(-1)?.[1];
  expect(value, 'DIST should report a distance without changing the drawing').toBeDefined();
  return Number(value);
}

test('continuous LINE recognizes endpoints of its accepted segments before Enter commits', async ({
  page,
}) => {
  await line(page, '-100,-100', '200,200');
  const view = await mapping(page);
  await variable(page, 'OSMODE', '1');
  await enter(page, 'L');
  await enter(page, '20,20');
  await enter(page, '90,20');
  await enter(page, '90,70');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  const start = screen(view, 20, 20);
  await page.mouse.move(start.x + 3, start.y + 2);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-snap-kind', 'endpoint');
  await page.mouse.click(start.x + 3, start.y + 2);
  await enter(page, '');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('4');
  expect((await drawing(page)).entities[3]).toMatchObject({ type: 'line', b: { x: 20, y: -20 } });
});

test('exact endpoint snaps override Ortho and supply exact dimension and inquiry points', async ({
  page,
}, testInfo) => {
  await line(page, '20,20', '90,55');
  const view = await mapping(page);
  const endpoint = screen(view, 90, 55);
  const nearEndpoint = { x: endpoint.x + 5, y: endpoint.y + 3 };
  const canvas = page.getByTestId('drawing-canvas');
  await variable(page, 'ORTHOMODE', '1');
  await variable(page, 'OSMODE', '1');
  await variable(page, 'APERTURE', '3');
  await enter(page, 'L');
  await enter(page, '10,60');
  await page.mouse.move(nearEndpoint.x, nearEndpoint.y);
  await expect(canvas).toHaveAttribute('data-snap-active', '0');
  await page.keyboard.press('Escape');
  await variable(page, 'APERTURE', '12');
  await enter(page, 'L');
  await enter(page, '10,60');
  await page.mouse.move(nearEndpoint.x, nearEndpoint.y);
  await expect(canvas).toHaveAttribute('data-snap-kind', 'endpoint');
  await expect(canvas).toHaveAttribute('data-snap-active', '1');
  await page.mouse.click(nearEndpoint.x, nearEndpoint.y);
  await enter(page, '');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  expect((await drawing(page)).entities[1]).toMatchObject({
    type: 'line',
    a: { x: 10, y: -60 },
    b: { x: 90, y: -55 },
  });
  await enter(page, 'DLI');
  const first = screen(view, 20, 20);
  await page.mouse.click(first.x + 4, first.y + 2);
  await page.mouse.click(nearEndpoint.x, nearEndpoint.y);
  await enter(page, '55,75');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('3');
  expect((await drawing(page)).entities[2]).toMatchObject({
    type: 'dimension',
    a: { x: 20, y: -20 },
    b: { x: 90, y: -55 },
  });
  expect((await dimensions(page))[0]?.measurement).toBe(70);
  const beforeInquiry = await drawing(page);
  await enter(page, 'DI');
  await page.mouse.click(first.x + 4, first.y + 2);
  await page.mouse.move(nearEndpoint.x, nearEndpoint.y);
  await expect(canvas).toHaveAttribute('data-preview-count', '2');
  await page.mouse.click(nearEndpoint.x, nearEndpoint.y);
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText('거리 = 78.2624');
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText(
    'X 증분 = 70.0000, Y 증분 = 35.0000',
  );
  await expect(canvas).toHaveAttribute('data-preview-count', '0');
  expect(await drawing(page)).toEqual(beforeInquiry);
  await page.screenshot({ path: testInfo.outputPath('snapped-dimension.png') });
});

test('window/crossing selection, Shift removal, selected-object move and Ctrl-copy use real drags', async ({
  page,
}, testInfo) => {
  await variable(page, 'OSMODE', '0');
  await variable(page, 'ORTHOMODE', '0');
  await line(page, '20,40', '50,40');
  await line(page, '80,40', '140,40');
  await line(page, '20,80', '50,80');
  await line(page, '0,0', '200,0');
  const before = await drawing(page);
  const view = await mapping(page);
  const canvas = page.getByTestId('drawing-canvas');
  await drag(page, screen(view, 100, 50), screen(view, 120, 30), 'window');
  await expect(canvas).toHaveAttribute('data-selection-count', '0');
  await drag(page, screen(view, 10, 50), screen(view, 60, 30), 'window');
  await expect(canvas).toHaveAttribute('data-selection-count', '1');
  await drag(page, screen(view, 120, 50), screen(view, 100, 30), 'crossing');
  await expect(canvas).toHaveAttribute('data-selection-count', '2');
  await page.keyboard.down('Shift');
  await point(page, view, 35, 40);
  await page.keyboard.up('Shift');
  await expect(canvas).toHaveAttribute('data-selection-count', '1');
  const start = screen(view, 110, 40),
    end = screen(view, 120, 60);
  await drag(page, start, end, '');
  const moved = (await drawing(page)).entities.find(
    (entity) => entity.id === before.entities[1]?.id,
  );
  expect(moved?.type).toBe('line');
  if (moved?.type !== 'line') throw new Error('The selected line was lost during dragging');
  expect(moved.a.x).toBeCloseTo(80 + (end.x - start.x) / view.zoom, 6);
  expect(moved.a.y).toBeCloseTo(-40 + (end.y - start.y) / view.zoom, 6);
  await expect(canvas).toHaveAttribute('data-selection-count', '1');
  const copyStart = screen(view, (moved.a.x + moved.b.x) / 2, -(moved.a.y + moved.b.y) / 2);
  const copyEnd = { x: copyStart.x + 80, y: copyStart.y - 50 };
  await page.keyboard.down('Control');
  await drag(page, copyStart, copyEnd, '');
  await page.keyboard.up('Control');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('5');
  const copied = (await drawing(page)).entities.find(
    (entity) => !before.entities.some((original) => original.id === entity.id),
  );
  expect(copied?.type).toBe('line');
  if (copied?.type !== 'line') throw new Error('Ctrl-drag did not create a separate line');
  expect(copied.a.x).toBeCloseTo(moved.a.x + 80 / view.zoom, 6);
  expect(copied.a.y).toBeCloseTo(moved.a.y - 50 / view.zoom, 6);
  await page.screenshot({ path: testInfo.outputPath('dragged-copy.png') });
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('4');
  expect((await drawing(page)).entities.find((entity) => entity.id === moved.id)).toEqual(moved);
  await page.keyboard.press('Control+z');
  expect((await drawing(page)).entities).toEqual(before.entities);
});

test('wheel zoom preserves its cursor anchor and reads wheel/pan system variables', async ({
  page,
}, testInfo) => {
  await variable(page, 'OSMODE', '0');
  await line(page, '0,0', '200,100');
  const before = await drawing(page);
  const view = await mapping(page);
  const anchor = screen(view, 130, 70);
  const baselineDistance = await probeDistance(page, anchor);
  const initialZoom = await zoom(page);
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => zoom(page)).toBeCloseTo(initialZoom * 1.6, 6);
  expect(await probeDistance(page, anchor)).toBeCloseTo(baselineDistance, 3);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => zoom(page)).toBeCloseTo(initialZoom, 6);
  expect(await probeDistance(page, anchor)).toBeCloseTo(baselineDistance, 3);
  await variable(page, 'ZOOMWHEEL', '1');
  await page.mouse.wheel(0, -100);
  await expect.poll(() => zoom(page)).toBeCloseTo(initialZoom / 1.6, 6);
  await variable(page, 'ZOOMWHEEL', '0');
  await variable(page, 'ZOOMFACTOR', '20');
  await page.mouse.wheel(0, -100);
  await expect.poll(() => zoom(page)).toBeCloseTo((initialZoom / 1.6) * 1.2, 6);
  const panZoom = await zoom(page);
  const panStartDistance = await probeDistance(page, anchor);
  const panEnd = { x: anchor.x + 80, y: anchor.y + 40 };
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(panEnd.x, panEnd.y, { steps: 8 });
  await page.mouse.up({ button: 'middle' });
  expect(await zoom(page)).toBeCloseTo(panZoom, 6);
  expect(await probeDistance(page, panEnd)).toBeCloseTo(panStartDistance, 3);
  await variable(page, 'MBUTTONPAN', '0');
  await page.mouse.move(panEnd.x, panEnd.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(panEnd.x + 70, panEnd.y + 30, { steps: 6 });
  await page.mouse.up({ button: 'middle' });
  expect(await probeDistance(page, panEnd)).toBeCloseTo(panStartDistance, 3);
  await variable(page, 'MBUTTONPAN', '1');
  await page.mouse.dblclick(anchor.x, anchor.y, { button: 'middle' });
  await expect.poll(() => zoom(page)).toBeCloseTo(initialZoom, 6);
  expect(await probeDistance(page, anchor)).toBeCloseTo(baselineDistance, 3);
  expect((await drawing(page)).entities).toEqual(before.entities);
  await page.screenshot({ path: testInfo.outputPath('navigation-fit.png') });
});
