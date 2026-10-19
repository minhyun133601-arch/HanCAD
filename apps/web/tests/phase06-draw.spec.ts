import { expect, test, type Page } from '@playwright/test';
import { drawing, enter, mapping, point } from './cad-actions';

async function setup(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  for (const token of [
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
  ])
    await enter(page, token);
}
async function tokens(page: Page, values: readonly string[]): Promise<void> {
  for (const value of values) await enter(page, value);
}

test('PL arc to Line and Width keeps exact bulges, retained Escape geometry and one undo group', async ({
  page,
}, info) => {
  await setup(page);
  await tokens(page, ['PL', '0,0', '100,0', 'A', '100,100', 'L', 'W', '2', '4', '200,100']);
  const canvas = page.getByTestId('drawing-canvas');
  await expect(canvas).toHaveAttribute('data-preview-count', '1');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await canvas.focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  const result = (await drawing(page)).entities[0];
  if (result?.type !== 'polyline') throw new Error('Expected PLINE');
  expect(result.points).toEqual([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: -100 },
    { x: 200, y: -100 },
  ]);
  expect(Math.abs(result.bulges?.[1] ?? 0)).toBeCloseTo(1, 9);
  expect(result.startWidths?.[2]).toBe(2);
  expect(result.endWidths?.[2]).toBe(4);
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await enter(page, 'REDO');
  await expect.poll(async () => (await drawing(page)).entities[0]).toEqual(result);
  const view = await mapping(page);
  await point(page, view, 150, 100, false);
  await page.screenshot({ path: info.outputPath('pline-arc-line-width.png') });
});

test('REC Fillet 5 is remembered by the following rectangle and its prompt', async ({
  page,
}, info) => {
  await setup(page);
  await tokens(page, ['REC', 'F', '5', '0,0', '40,20', 'REC', 'F']);
  await expect(page.locator('.command-prompt')).toContainText('<5>');
  await tokens(page, ['', '60,0', '100,20']);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  const state = await drawing(page);
  for (const entity of state.entities) {
    if (entity.type !== 'polyline') throw new Error('Expected a filleted rectangle polyline');
    expect(entity.closed).toBe(true);
    expect(entity.points).toHaveLength(8);
    expect(entity.bulges?.filter((value) => value !== 0)).toHaveLength(4);
    for (const bulge of entity.bulges?.filter((value) => value !== 0) ?? [])
      expect(Math.abs(bulge)).toBeCloseTo(Math.tan(Math.PI / 8), 9);
  }
  await mapping(page);
  await page.screenshot({ path: info.outputPath('rectangles-remember-fillet.png') });
});

test('rectangle command defaults stay with their document across NEW and drawing tab remounts', async ({
  page,
}) => {
  await setup(page);
  await tokens(page, ['REC', 'F', '5', '0,0', '40,20', 'NEW']);
  await expect(page.locator('.file-tab[aria-current="page"]')).toHaveText('Drawing2.dwg');
  await tokens(page, ['REC', 'F']);
  await expect(page.locator('.command-prompt')).toContainText('<0>');
  await tokens(page, ['2', '0,0', '40,20']);
  const tabs = page.getByRole('navigation', { name: '도면 탭', exact: true });
  await tabs.getByRole('button', { name: 'Drawing1.dwg', exact: true }).click();
  await expect(page.locator('.file-tab[aria-current="page"]')).toHaveText('Drawing1.dwg');
  await tokens(page, ['REC', 'F']);
  await expect(page.locator('.command-prompt')).toContainText('<5>');
  await page.getByTestId('drawing-canvas').focus();
  await page.keyboard.press('Escape');
  await tabs.getByRole('button', { name: 'Drawing2.dwg', exact: true }).click();
  await tokens(page, ['REC', 'F']);
  await expect(page.locator('.command-prompt')).toContainText('<2>');
  await page.getByTestId('drawing-canvas').focus();
  await page.keyboard.press('Escape');
});

test('ARC Enter continues tangent and ELLIPSE preview and center grip retain exact source geometry', async ({
  page,
}, info) => {
  await setup(page);
  await tokens(page, ['L', '-100,0', '0,0', '']);
  const view = await mapping(page),
    canvas = page.getByTestId('drawing-canvas');
  await tokens(page, ['A', '']);
  await expect(page.locator('.command-prompt')).toContainText('호의 끝점');
  await point(page, view, -25, 10, false);
  await expect(canvas).toHaveAttribute('data-preview-count', '1');
  await enter(page, '100,100');
  const arc = (await drawing(page)).entities[1]?.curve;
  expect(arc).toMatchObject({
    type: 'ARC',
    center: { x: 0, y: 100 },
    radius: 100,
    sweepAngle: Math.PI / 2,
  });
  await tokens(page, ['ELLIPSE', 'C', '300,0', '400,0']);
  await point(page, view, -25, 10, false);
  await expect(canvas).toHaveAttribute('data-preview-count', '1');
  await enter(page, '50');
  const original = (await drawing(page)).entities[2]?.curve;
  expect(original).toMatchObject({
    type: 'ELLIPSE',
    center: { x: 300, y: 0 },
    majorAxis: { x: 100, y: 0 },
    minorAxis: { x: 0, y: 50 },
  });
  const fit = await mapping(page);
  await point(page, fit, 300, 50);
  await expect(canvas).toHaveAttribute('data-selection-count', '1');
  await expect(canvas).toHaveAttribute('data-grip-count', '5');
  await page.keyboard.down('Shift');
  await point(page, fit, 300, 0);
  await page.keyboard.up('Shift');
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
  await expect(canvas).toHaveAttribute('data-grip-count', '5');
  await point(page, fit, 300, 0);
  await expect(page.locator('.command-prompt')).toContainText('신축');
  await enter(page, '320,20');
  await expect
    .poll(async () => (await drawing(page)).entities[2]?.curve)
    .toMatchObject({ type: 'ELLIPSE', center: { x: 320, y: 20 } });
  await page.screenshot({ path: info.outputPath('arc-tangent-ellipse-grip.png') });
  await enter(page, 'U');
  await expect.poll(async () => (await drawing(page)).entities[2]?.curve).toEqual(original);
});

test('advanced drawing commands preserve exact curves through recovery and grouped undo', async ({
  page,
}) => {
  await setup(page);
  for (const values of [
    ['CIRCLE', '3P', '5,0', '0,5', '-5,0'],
    ['ELLIPSE', 'A', '20,0', '40,0', '5', 'P', '0', '90'],
    ['SPLINE', 'M', 'CV', 'D', '2', '50,0', '60,20', '70,0', ''],
    ['XLINE', 'H', '0,-20', '0,-40', ''],
    ['RAY', '80,0', '90,10', ''],
    ['HELIX', '100,0', '2', '10', 'T', '2', '0'],
  ]) {
    await tokens(page, values);
    await expect(page.locator('.command-prompt')).toHaveText('명령:');
  }
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('7');
  const before = await drawing(page);
  expect(before.entities.map((entity) => entity.curve?.type ?? entity.type)).toEqual([
    'circle',
    'ELLIPSE',
    'SPLINE',
    'XLINE',
    'XLINE',
    'RAY',
    'HELIX',
  ]);
  await page.reload();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('7');
  expect((await drawing(page)).entities).toEqual(before.entities);
});

test('MULTIPLE POINT creates individual undo steps and SKETCH streams pen-down motion only', async ({
  page,
}, info) => {
  await setup(page);
  await tokens(page, ['MULTIPLE', 'POINT', '0,0', '100,100']);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  await page.getByTestId('drawing-canvas').focus();
  await page.keyboard.press('Escape');
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await enter(page, 'REDO');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  await tokens(page, ['PDMODE', '3', 'PDSIZE', '5']);
  const view = await mapping(page);
  await tokens(page, ['SKETCH', 'T', 'P', 'I', '1']);
  await point(page, view, 10, 10);
  for (const [x, y] of [
    [20, 15],
    [30, 25],
    [40, 15],
  ] as const)
    await point(page, view, x, y, false);
  await point(page, view, 40, 15);
  await point(page, view, 80, 80, false);
  await enter(page, '');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('3');
  const sketch = (await drawing(page)).entities[2];
  if (sketch?.type !== 'polyline') throw new Error('Expected sketch polyline');
  expect(sketch.points.length).toBeGreaterThanOrEqual(4);
  expect(sketch.points.every((point) => point.x < 50)).toBe(true);
  await page.screenshot({ path: info.outputPath('multiple-points-freehand-sketch.png') });
});

test('physical keys and dynamic options drive an advanced PLINE with an IME-safe point prompt', async ({
  page,
}) => {
  await setup(page);
  await tokens(page, ['DYNMODE', '3', 'PL', '0,0']);
  const canvas = page.getByTestId('drawing-canvas'),
    rect = await canvas.boundingBox();
  if (!rect) throw new Error('Missing canvas');
  await page.mouse.move(rect.x + rect.width * 0.75, rect.y + rect.height * 0.25);
  await canvas.focus();
  for (const code of ['Digit1', 'Digit0', 'Digit0'])
    await canvas.dispatchEvent('keydown', { key: 'Process', code, bubbles: true });
  const command = page.getByRole('textbox', { name: '명령 입력', exact: true });
  await expect(command).toHaveJSProperty('tagName', 'DIV');
  await expect(command).toContainText('100');
  await page.keyboard.press('Tab');
  await page.keyboard.type('30');
  await page.keyboard.press('Tab');
  const overlay = page.getByTestId('dynamic-input');
  await expect(overlay.locator('[data-field="distance"]')).toHaveAttribute('data-locked', 'true');
  await page.mouse.click(rect.x + rect.width * 0.7, rect.y + rect.height * 0.3);
  await page.keyboard.press('ArrowDown');
  const menu = overlay.getByRole('menu', { name: '동적 입력 옵션' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: '호(A)', exact: true }).click();
  await expect(page.locator('.command-prompt')).toContainText('중심(CE)');
  await canvas.focus();
  await page.keyboard.press('Escape');
  const line = (await drawing(page)).entities[0];
  if (line?.type !== 'polyline') throw new Error('Expected PLINE');
  expect(line.points[1]?.x).toBeCloseTo(100 * Math.cos(Math.PI / 6), 9);
  expect(line.points[1]?.y).toBeCloseTo(-50, 9);
});

test('ARC scalar angle shows an angle field and its locked value controls preview and mouse acceptance', async ({
  page,
}, info) => {
  await setup(page);
  await tokens(page, ['L', '0,0', '100,0', '']);
  const view = await mapping(page);
  await tokens(page, ['DYNMODE', '3', 'A', '0,50', 'C', '0,0', 'A']);
  const canvas = page.getByTestId('drawing-canvas'),
    overlay = page.getByTestId('dynamic-input');
  await point(page, view, 60, 0, false);
  await canvas.focus();
  await expect(overlay.locator('[data-field="angle"]')).toBeVisible();
  await expect(overlay.locator('[data-field="distance"]')).toHaveCount(0);
  await page.keyboard.type('90');
  await page.keyboard.press('Tab');
  await expect(overlay.locator('[data-field="angle"]')).toHaveAttribute('data-locked', 'true');
  await expect(canvas).toHaveAttribute('data-preview-count', '1');
  await page.screenshot({ path: info.outputPath('arc-locked-scalar-angle.png') });
  await point(page, view, 70, 0);
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
  const curve = (await drawing(page)).entities[1]?.curve;
  expect(curve).toMatchObject({
    type: 'ARC',
    startAngle: Math.PI / 2,
    sweepAngle: Math.PI / 2,
    radius: 50,
  });
});
