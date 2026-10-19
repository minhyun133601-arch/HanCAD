import { expect, test, type Page } from '@playwright/test';
import { drawing, enter, mapping, point } from './cad-actions';

async function tokens(page: Page, values: readonly string[]): Promise<void> {
  for (const value of values) await enter(page, value);
}
async function sourceLine(page: Page): Promise<void> {
  await tokens(page, ['L', '0,0', '100,0', '']);
}
async function all(page: Page, command: string): Promise<void> {
  await tokens(page, [command, 'ALL', '']);
}
test.beforeEach(async ({ page }) => {
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
test('MOVE Displacement, ROTATE Reference Points and SCALE Copy preserve one undo group each', async ({
  page,
}) => {
  await sourceLine(page);
  const original = (await drawing(page)).entities;
  await all(page, 'MOVE');
  await tokens(page, ['D', '20,30']);
  expect((await drawing(page)).entities[0]).toMatchObject({
    id: original[0]!.id,
    a: { x: 20, y: -30 },
    b: { x: 120, y: -30 },
  });
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(original);
  await all(page, 'ROTATE');
  await tokens(page, ['0,0', 'R', '0,0', '100,0', 'P', '20,20', '20,120']);
  const rotated = (await drawing(page)).entities[0];
  if (rotated?.type !== 'line') throw Error('Expected LINE');
  expect(rotated.b.x).toBeCloseTo(0, 9);
  expect(rotated.b.y).toBeCloseTo(-100, 9);
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(original);
  await all(page, 'SCALE');
  await tokens(page, ['0,0', 'C', 'R', '100', '200']);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  expect((await drawing(page)).entities[1]).toMatchObject({ b: { x: 200, y: 0 } });
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(original);
});
test('COPY Array Fit is provisional, Escape retains accepted placements and U removes the complete command', async ({
  page,
}, info) => {
  await sourceLine(page);
  const original = (await drawing(page)).entities;
  await tokens(page, ['COPYMODE', '0']);
  await all(page, 'COPY');
  await tokens(page, ['0,0', 'A', '4', 'F', '300,0']);
  const canvas = page.getByTestId('drawing-canvas');
  await expect(canvas).toHaveAttribute('data-preview-count', '3');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await canvas.focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('4');
  const entities = (await drawing(page)).entities;
  expect(entities.map((e) => (e.type === 'line' ? e.a.x : NaN))).toEqual([0, 100, 200, 300]);
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(original);
  await enter(page, 'REDO');
  await mapping(page);
  await page.screenshot({ path: info.outputPath('copy-array-fit.png') });
});
test('MIRROR preserves readable text at MIRRTEXT zero and reflects glyphs at one with one undo group', async ({
  page,
}, info) => {
  await tokens(page, ['DT', '40,20', '10', '0']);
  const input = page.getByRole('textbox', { name: '도면 문자 입력', exact: true });
  await input.fill('ABC 한글');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  const original = (await drawing(page)).entities;
  for (const mode of [0, 1]) {
    await tokens(page, ['MIRRTEXT', String(mode)]);
    await all(page, 'MIRROR');
    await tokens(page, ['0,0', '0,100', 'Y']);
    const text = (await drawing(page)).entities[0];
    if (text?.type !== 'text') throw Error('Expected TEXT');
    expect(text.point.x).toBeCloseTo(-40, 9);
    expect(text.point.y).toBeCloseTo(-20, 9);
    expect(!!text.mirroredX).toBe(mode === 1);
    await enter(page, 'U');
    expect((await drawing(page)).entities).toEqual(original);
  }
  await enter(page, 'REDO');
  await mapping(page);
  await page.screenshot({ path: info.outputPath('mirror-korean-glyphs.png') });
});
test('STRETCH combines typed crossing windows and preserves all endpoints outside them', async ({
  page,
}) => {
  await tokens(page, ['L', '0,0', '100,0', '', 'L', '0,50', '100,50', '']);
  const original = (await drawing(page)).entities;
  await tokens(page, [
    'STRETCH',
    'C',
    '90,-5',
    '110,5',
    'C',
    '90,45',
    '110,55',
    '',
    '0,0',
    '20,10',
  ]);
  const entities = (await drawing(page)).entities;
  expect(entities[0]).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 120, y: -10 } });
  expect(entities[1]).toMatchObject({ a: { x: 0, y: -50 }, b: { x: 120, y: -60 } });
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(original);
});
test('ALIGN two reference pairs scales after Yes and U restores the original handle and coordinates', async ({
  page,
}) => {
  await sourceLine(page);
  const original = (await drawing(page)).entities;
  await all(page, 'ALIGN');
  await tokens(page, ['0,0', '20,30', '100,0', '20,230', '', 'Y']);
  const line = (await drawing(page)).entities[0];
  if (line?.type !== 'line') throw Error('Expected LINE');
  expect(line.id).toBe(original[0]!.id);
  expect(line.a.x).toBeCloseTo(20, 9);
  expect(line.a.y).toBeCloseTo(-30, 9);
  expect(line.b.x).toBeCloseTo(20, 9);
  expect(line.b.y).toBeCloseTo(-230, 9);
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(original);
});
test('STRETCH preserves individual-pick movement when combined with a crossing window', async ({
  page,
}) => {
  await tokens(page, ['L', '0,0', '100,0', '', 'L', '0,50', '100,50', '']);
  const view = await mapping(page),
    original = (await drawing(page)).entities;
  await tokens(page, ['STRETCH', 'C', '90,-5', '110,5']);
  await point(page, view, 50, 50);
  await tokens(page, ['', '0,0', '20,10']);
  const entities = (await drawing(page)).entities;
  expect(entities[0]).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 120, y: -10 } });
  expect(entities[1]).toMatchObject({ a: { x: 20, y: -60 }, b: { x: 120, y: -60 } });
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(original);
});
test('ARRAYRECT keyboard options produce independent geometry, cancel previews and undo in one step', async ({
  page,
}, info) => {
  await sourceLine(page);
  const original = (await drawing(page)).entities;
  await all(page, 'ARRAYRECT');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-preview-count', '12');
  await page.getByTestId('drawing-canvas').focus();
  await page.keyboard.press('Escape');
  expect((await drawing(page)).entities).toEqual(original);
  await all(page, 'ARRAYRECT');
  await tokens(page, ['AS', 'N', 'COL', '3', '150', 'R', '2', '80', '0', 'X']);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('6');
  expect(
    (await drawing(page)).entities.map((e) => (e.type === 'line' ? [e.a.x, e.a.y] : [])),
  ).toEqual([
    [0, 0],
    [150, 0],
    [300, 0],
    [0, -80],
    [150, -80],
    [300, -80],
  ]);
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(original);
  await enter(page, 'REDO');
  await mapping(page);
  await page.screenshot({ path: info.outputPath('arrayrect-independent-items.png') });
});
test('ARRAYPOLAR, ARRAYPATH and classic -ARRAY run through real selection and command-line routing', async ({
  page,
}, info) => {
  await tokens(page, ['C', '100,0', '10']);
  const circle = (await drawing(page)).entities;
  await all(page, 'ARRAYPOLAR');
  await tokens(page, ['0,0', 'I', '4', 'X']);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('4');
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(circle);
  await all(page, '-ARRAY');
  await tokens(page, ['R', '2', '2', '100', '200']);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('4');
  await enter(page, 'U');
  await tokens(page, ['L', '0,50', '300,50', '']);
  const view = await mapping(page),
    before = (await drawing(page)).entities;
  await enter(page, 'ARRAYPATH');
  await point(page, view, 110, 0);
  await enter(page, '');
  await expect(page.locator('.command-prompt')).toContainText('경로');
  await point(page, view, 100, 50);
  await tokens(page, ['B', '100,0', 'M', 'D', 'I', '4', 'X']);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('5');
  await page.screenshot({ path: info.outputPath('arraypath-divide.png') });
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(before);
});
