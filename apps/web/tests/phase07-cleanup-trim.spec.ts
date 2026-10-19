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
  ]);
});

test('Quick TRIM dragged fence, Shift extension and U preserve complete command boundaries', async ({
  page,
}, info) => {
  await tokens(page, [
    'L',
    '0,0',
    '100,0',
    '',
    'L',
    '20,-20',
    '20,40',
    '',
    'L',
    '70,-20',
    '70,40',
    '',
    'L',
    '30,20',
    '50,20',
    '',
  ]);
  const original = (await drawing(page)).entities,
    view = await mapping(page);
  await enter(page, 'TRIM');
  await point(page, view, 40, -5, false);
  await page.mouse.down();
  await point(page, view, 40, 5, false);
  await page.mouse.up();
  await page.keyboard.down('Shift');
  await point(page, view, 49, 20);
  await page.keyboard.up('Shift');
  await enter(page, '');
  const result = (await drawing(page)).entities;
  expect(result.filter((e) => e.type === 'line' && e.a.y === 0)).toHaveLength(2);
  expect(result.find((e) => e.id === original[3]!.id)).toMatchObject({ b: { x: 70, y: -20 } });
  await page.screenshot({ path: info.outputPath('quick-trim-fence-shift-extend.png') });
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(original);
});

test('DRAWORDER stays intact after MOVE and both operations undo independently', async ({
  page,
}) => {
  await tokens(page, ['L', '0,0', '100,0', '', 'C', '50,50', '10']);
  const original = (await drawing(page)).entities;
  const view = await mapping(page);
  await enter(page, 'DRAWORDER');
  await point(page, view, 50, 0);
  await tokens(page, ['', 'F']);
  expect((await drawing(page)).entities.map((e) => e.id)).toEqual([
    original[1]!.id,
    original[0]!.id,
  ]);
  await tokens(page, ['MOVE', 'ALL', '', '0,0', '20,0']);
  expect((await drawing(page)).entities.map((e) => e.id)).toEqual([
    original[1]!.id,
    original[0]!.id,
  ]);
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual([original[1], original[0]]);
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(original);
});

test('CHPROP true color, lineweight, thickness and transparency survive U and REDO', async ({
  page,
}) => {
  await tokens(page, ['L', '0,0', '100,0', '']);
  const original = (await drawing(page)).entities;
  await tokens(page, [
    'CHPROP',
    'ALL',
    '',
    'C',
    'T',
    '12,34,56',
    'LW',
    '0.26',
    'T',
    '20',
    'TR',
    '35',
    '',
  ]);
  const result = (await drawing(page)).entities;
  expect(result[0]).toMatchObject({
    trueColor: 0x0c2238,
    lineweight: 25,
    thickness: 20,
    transparency: 35,
  });
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(original);
  await enter(page, 'REDO');
  expect((await drawing(page)).entities).toEqual(result);
});

test('OVERKILL dialog validates tolerance, keeps cancelled source, merges overlaps and U restores it', async ({
  page,
}, info) => {
  await tokens(page, ['L', '0,0', '100,0', '', 'L', '50,0', '150,0', '']);
  const original = (await drawing(page)).entities;
  await tokens(page, ['OVERKILL', 'ALL', '']);
  const dialog = page.getByRole('dialog', { name: '중복 객체 삭제', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox').fill('-1');
  await expect(dialog.getByRole('button', { name: '확인', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  expect((await drawing(page)).entities).toEqual(original);
  await tokens(page, ['OVERKILL', 'ALL', '']);
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: info.outputPath('overkill-korean-options.png') });
  await dialog.getByRole('button', { name: '확인', exact: true }).click();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  expect((await drawing(page)).entities[0]).toMatchObject({
    a: { x: 0, y: 0 },
    b: { x: 150, y: 0 },
  });
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(original);
});

test('TRIM fence beyond a RAY unit sample preserves a finite LINE and U restores the RAY', async ({
  page,
}) => {
  await tokens(page, ['RAY', '0,0', '10,0', '', 'L', '20,-20', '20,20', '']);
  const original = (await drawing(page)).entities;
  const view = await mapping(page);
  await enter(page, 'TRIM');
  await point(page, view, 30, -5, false);
  await page.mouse.down();
  await point(page, view, 30, 5, false);
  await page.mouse.up();
  await enter(page, '');
  expect((await drawing(page)).entities[0]).toMatchObject({
    type: 'line',
    a: { x: 0, y: 0 },
    b: { x: 20, y: 0 },
  });
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(original);
});
