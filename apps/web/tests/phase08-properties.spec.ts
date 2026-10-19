import { expect, test, type Page } from '@playwright/test';
import { drawing, enter, mapping, point } from './cad-actions';

async function objects(page: Page): Promise<void> {
  for (const token of [
    'CECOLOR',
    '1',
    'CELWEIGHT',
    '50',
    'LINE',
    '10,10',
    '40,10',
    '',
    'CECOLOR',
    '3',
    'CELWEIGHT',
    '100',
    'CIRCLE',
    '70,40',
    '5',
  ])
    await enter(page, token);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
}
async function clearSelection(page: Page): Promise<void> {
  await page.getByTestId('drawing-canvas').focus();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
}
async function selectAll(page: Page, count = 2): Promise<void> {
  await page.getByTestId('drawing-canvas').focus();
  await page.keyboard.press('Control+a');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute(
    'data-selection-count',
    String(count),
  );
}
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
});

test('mixed Properties edits form one undo group and type filtering scopes expression edits', async ({
  page,
}) => {
  await objects(page);
  const original = (await drawing(page)).entities;
  await selectAll(page);
  await enter(page, 'PROPERTIES');
  const palette = page.getByTestId('properties-palette');
  await expect(palette.getByText('일반', { exact: true })).toBeVisible();
  await expect(palette.getByText('3D 시각화', { exact: true })).toBeVisible();
  await expect(palette.getByLabel('색상', { exact: true })).toHaveAttribute(
    'placeholder',
    '*다양함*',
  );
  await palette.getByLabel('색상', { exact: true }).fill('#00ffff');
  await palette.getByLabel('색상', { exact: true }).press('Enter');
  await expect
    .poll(async () => (await drawing(page)).entities.map((entity) => entity.trueColor))
    .toEqual([0x00ffff, 0x00ffff]);
  const recolored = (await drawing(page)).entities;
  await enter(page, 'U');
  await expect.poll(async () => (await drawing(page)).entities).toEqual(original);
  await enter(page, 'REDO');
  await expect.poll(async () => (await drawing(page)).entities).toEqual(recolored);
  await palette.getByLabel('객체 유형 필터').selectOption('circle');
  await expect(palette.getByLabel('지름', { exact: true })).toHaveValue('10');
  await palette.getByLabel('지름', { exact: true }).fill('sqrt(81) * 4');
  await palette.getByLabel('지름', { exact: true }).press('Enter');
  await expect.poll(async () => (await drawing(page)).entities[1]).toMatchObject({ radius: 18 });
  expect((await drawing(page)).entities[0]).toEqual(recolored[0]);
  await palette.getByLabel('반지름', { exact: true }).fill('1 / 0');
  await palette.getByLabel('반지름', { exact: true }).press('Enter');
  await expect(palette.getByRole('alert')).toBeVisible();
  expect((await drawing(page)).entities[1]).toMatchObject({ radius: 18 });
  await palette.getByRole('button', { name: 'PICKADD', exact: true }).click();
  await expect(palette.getByRole('button', { name: 'PICKADD', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('MATCHPROP Settings exclude color and Enter or Escape retain accepted targets with one U/REDO', async ({
  page,
}) => {
  await objects(page);
  const view = await mapping(page),
    original = (await drawing(page)).entities;
  await enter(page, 'MATCHPROP');
  await expect(page.locator('.command-prompt')).toHaveText('원본 객체 선택:');
  await point(page, view, 25, 10);
  await expect(page.locator('.command-prompt')).toContainText('대상 객체 선택');
  await enter(page, 'S');
  const dialog = page.getByRole('dialog', { name: '특성 설정', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('색상', { exact: true }).uncheck();
  await dialog.getByRole('button', { name: '확인', exact: true }).click();
  await point(page, view, 75, 40);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '1');
  await enter(page, '');
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
  await expect
    .poll(async () => (await drawing(page)).entities[1])
    .toMatchObject({ aci: 3, lineweight: 50, radius: 5 });
  const matched = (await drawing(page)).entities;
  await enter(page, 'U');
  await expect.poll(async () => (await drawing(page)).entities).toEqual(original);
  await enter(page, 'REDO');
  await expect.poll(async () => (await drawing(page)).entities).toEqual(matched);
  await enter(page, 'U');
  const currentView = await mapping(page);
  await enter(page, 'MATCHPROP');
  await expect(page.locator('.command-prompt')).toHaveText('원본 객체 선택:');
  await point(page, currentView, 25, 10);
  await expect(page.locator('.command-prompt')).toContainText('대상 객체 선택');
  await point(page, currentView, 75, 40);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '1');
  await page.getByTestId('drawing-canvas').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
  await expect.poll(async () => (await drawing(page)).entities).toEqual(matched);
  await enter(page, 'U');
  await expect.poll(async () => (await drawing(page)).entities).toEqual(original);
});

test('Properties without a selection validates and converts current True Color and transparency defaults', async ({
  page,
}) => {
  await enter(page, 'PROPERTIES');
  const palette = page.getByTestId('properties-palette');
  await expect(palette.getByLabel('투명도', { exact: true })).toHaveValue('bylayer');
  await palette.getByLabel('색상', { exact: true }).fill('#40a0ff');
  await palette.getByLabel('색상', { exact: true }).press('Enter');
  await palette.getByLabel('투명도', { exact: true }).selectOption('byblock');
  await palette.getByLabel('선종류 축척', { exact: true }).fill('3 / 2');
  await palette.getByLabel('선종류 축척', { exact: true }).press('Enter');
  await palette.getByRole('button', { name: '닫기', exact: true }).click();
  for (const token of ['LINE', '10,10', '30,10', '']) await enter(page, token);
  await expect
    .poll(async () => (await drawing(page)).entities[0])
    .toMatchObject({ trueColor: 0x40a0ff, transparency: 'byblock', linetypeScale: 1.5 });
});

for (const mode of [0, 1]) {
  test(`object isolation mode ${mode} filters rendering and picking, restores layers, and follows reopen persistence`, async ({
    page,
  }) => {
    await objects(page);
    for (const token of ['LINE', '10,70', '40,70', '']) await enter(page, token);
    await expect(page.getByTestId('drawing-entity-count')).toHaveText('3');
    const view = await mapping(page),
      original = await drawing(page);
    const sourceClip = {
      x: view.x + view.width / 2 + (25 - view.originX) * view.zoom - 15,
      y: view.y + view.height / 2 + (-10 - view.originY) * view.zoom - 10,
      width: 30,
      height: 20,
    };
    await page.mouse.move(20, 20);
    const visible = await page.screenshot({ clip: sourceClip });
    await enter(page, 'OBJECTISOLATIONMODE');
    await enter(page, String(mode));
    await point(page, view, 25, 10);
    await enter(page, 'HIDEOBJECTS');
    await expect
      .poll(async () => (await drawing(page)).objectIsolation?.hiddenIds)
      .toEqual([original.entities[0]!.id]);
    await page.mouse.move(20, 20);
    const hidden = await page.screenshot({ clip: sourceClip });
    expect(hidden.equals(visible)).toBe(false);
    await point(page, view, 25, 10);
    await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '0');
    await clearSelection(page);
    await selectAll(page, 2);
    await clearSelection(page);
    await point(page, view, 75, 40);
    await enter(page, 'ISOLATEOBJECTS');
    const isolatedIds = [original.entities[0]!.id, original.entities[2]!.id];
    await expect
      .poll(async () => (await drawing(page)).objectIsolation?.hiddenIds)
      .toEqual(isolatedIds);
    await selectAll(page, 1);
    await clearSelection(page);
    await enter(page, 'UNISOLATEOBJECTS');
    await expect.poll(async () => (await drawing(page)).objectIsolation).toBeUndefined();
    expect((await drawing(page)).layers).toEqual(original.layers);
    await page.mouse.move(20, 20);
    expect((await page.screenshot({ clip: sourceClip })).equals(hidden)).toBe(false);
    await point(page, view, 25, 10);
    await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '1');
    await clearSelection(page);
    await enter(page, 'U');
    await expect
      .poll(async () => (await drawing(page)).objectIsolation?.hiddenIds)
      .toEqual(isolatedIds);
    await page.reload();
    await expect(page.getByTestId('drawing-entity-count')).toHaveText('3');
    await expect
      .poll(async () => (await drawing(page)).objectIsolation?.hiddenIds ?? [])
      .toEqual(mode ? isolatedIds : []);
    await selectAll(page, mode ? 1 : 3);
  });
}

test('Quick Properties observes QPLOCATION and rollover tooltips observe ROLLOVERTIPS', async ({
  page,
}) => {
  await objects(page);
  const view = await mapping(page);
  for (const token of ['QPMODE', '1', 'QPLOCATION', '0']) await enter(page, token);
  await point(page, view, 25, 10);
  const quick = page.getByTestId('quick-properties');
  await expect(quick).toBeVisible();
  await expect(quick).toHaveCSS('position', 'fixed');
  await quick.getByRole('button', { name: '닫기', exact: true }).click();
  await clearSelection(page);
  await enter(page, 'QPLOCATION');
  await enter(page, '1');
  await point(page, view, 75, 40);
  await expect(quick).toBeVisible();
  await expect(quick).toHaveCSS('position', 'absolute');
  await quick.getByRole('button', { name: '닫기', exact: true }).click();
  await clearSelection(page);
  await enter(page, 'ROLLOVERTIPS');
  await enter(page, '1');
  await point(page, view, 25, 10, false);
  await expect(page.getByTestId('rollover-properties')).toBeVisible();
  await expect(page.getByTestId('rollover-properties')).toContainText('도면층');
  await enter(page, 'ROLLOVERTIPS');
  await enter(page, '0');
  await expect(page.getByTestId('rollover-properties')).toBeHidden();
});
