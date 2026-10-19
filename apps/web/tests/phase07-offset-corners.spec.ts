import { expect, test, type Page } from '@playwright/test';
import { drawing, enter, mapping, point } from './cad-actions';

async function tokens(page: Page, values: readonly string[]): Promise<void> {
  for (const value of values) await enter(page, value);
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
    'COMMANDPREVIEW',
    '1',
  ]);
});
for (const gap of [0, 1, 2])
  test(`OFFSETGAPTYPE ${gap} closes outward gaps on a real arc polyline and groups undo`, async ({
    page,
  }, info) => {
    await tokens(page, [
      'PLINE',
      '0,0',
      '100,0',
      'A',
      '100,100',
      'L',
      '0,100',
      'C',
      'OFFSETGAPTYPE',
      String(gap),
    ]);
    const before = (await drawing(page)).entities,
      view = await mapping(page),
      canvas = page.getByTestId('drawing-canvas');
    await tokens(page, ['OFFSET', '10']);
    await point(page, view, 50, 100);
    await point(page, view, 50, 105, false);
    await expect(canvas).toHaveAttribute('data-preview-count', '1');
    expect((await drawing(page)).entities).toEqual(before);
    await point(page, view, 50, 105);
    await enter(page, '');
    await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
    const after = (await drawing(page)).entities,
      result = after[1];
    expect(after[0]).toEqual(before[0]);
    if (result?.type !== 'polyline') throw new Error('Expected offset polyline');
    expect(result.closed).toBe(true);
    expect(result.curve?.type).toBe('LWPOLYLINE');
    expect(result.points.every((p) => p.z === 0)).toBe(true);
    if (result.curve?.type !== 'LWPOLYLINE') throw new Error('Expected exact offset polyline');
    expect(result.curve.vertices.every((v) => v.position.z === 0)).toBe(true);
    expect(result.points).toHaveLength(gap === 0 ? 4 : 6);
    expect(result.bulges?.filter((b) => Math.abs(b) > 1e-8)).toHaveLength(gap === 1 ? 3 : 1);
    if (gap === 0)
      expect(result.points).toEqual(
        expect.arrayContaining([
          { x: -10, y: 10, z: 0 },
          { x: -10, y: -110, z: 0 },
        ]),
      );
    await page.screenshot({ path: info.outputPath(`offset-gap-${gap}.png`) });
    await enter(page, 'U');
    expect((await drawing(page)).entities).toEqual(before);
    await enter(page, 'REDO');
    expect((await drawing(page)).entities).toEqual(after);
  });

test('FILLET Shift second pick overrides a nonzero radius and command Undo restores both lines', async ({
  page,
}, info) => {
  await tokens(page, ['LINE', '10,0', '100,0', '', 'LINE', '0,10', '0,100', '', 'FILLETRAD', '25']);
  const before = (await drawing(page)).entities,
    view = await mapping(page),
    canvas = page.getByTestId('drawing-canvas');
  await enter(page, 'FILLET');
  await point(page, view, 80, 0);
  await point(page, view, 0, 80, false);
  await expect(canvas).toHaveAttribute('data-preview-count', '3');
  await page.keyboard.down('Shift');
  await point(page, view, 0, 75, false);
  await expect(canvas).toHaveAttribute('data-preview-count', '2');
  await point(page, view, 0, 75);
  await page.keyboard.up('Shift');
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
  const after = (await drawing(page)).entities;
  expect(after).toHaveLength(2);
  expect(after[0]).toMatchObject({
    type: 'line',
    id: before[0]?.id,
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
  });
  expect(after[1]).toMatchObject({
    type: 'line',
    id: before[1]?.id,
    a: { x: 0, y: 0 },
    b: { x: 0, y: -100 },
  });
  await page.screenshot({ path: info.outputPath('fillet-shift-sharp.png') });
  await tokens(page, ['GETVAR', 'FILLETRAD']);
  await expect(
    page.getByRole('log', { name: '명령 기록' }).locator('.history-line').last(),
  ).toHaveText('FILLETRAD = 25');
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(before);
});

test('OFFSET COMMANDPREVIEW toggle and Multiple Undo preserve one final command transaction', async ({
  page,
}) => {
  await tokens(page, [
    'LINE',
    '0,0',
    '100,0',
    '',
    'LINE',
    '0,100',
    '100,100',
    '',
    'COMMANDPREVIEW',
    '0',
  ]);
  const before = (await drawing(page)).entities,
    view = await mapping(page),
    canvas = page.getByTestId('drawing-canvas');
  await tokens(page, ['OFFSET', '10']);
  await point(page, view, 50, 0);
  await point(page, view, 50, 30, false);
  await expect(canvas).toHaveAttribute('data-preview-count', '0');
  await enter(page, 'M');
  await point(page, view, 50, 30);
  await point(page, view, 50, 40);
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(before);
  await enter(page, '');
  await enter(page, '');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('3');
  expect((await drawing(page)).entities[2]).toMatchObject({
    type: 'line',
    a: { x: 0, y: -10 },
    b: { x: 100, y: -10 },
  });
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(before);
  await tokens(page, ['COMMANDPREVIEW', '1', 'OFFSET', '10']);
  await point(page, view, 50, 0);
  await point(page, view, 50, -30, false);
  await expect(canvas).toHaveAttribute('data-preview-count', '1');
  await page.keyboard.press('Escape');
  expect((await drawing(page)).entities).toEqual(before);
});
