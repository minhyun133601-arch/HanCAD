import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { drawing, enter, mapping, point } from './cad-actions';

const pageErrors = new WeakMap<Page, string[]>();
async function tokens(page: Page, values: readonly string[]): Promise<void> {
  for (const value of values) await enter(page, value);
}
async function layer(page: Page, name: string): Promise<void> {
  await tokens(page, ['-LAYER', 'M', name, '']);
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
}
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await tokens(page, ['OSMODE', '0', 'ORTHOMODE', '0', 'SNAPMODE', '0', 'DYNMODE', '0']);
});
test.afterEach(async ({ page }) => expect(pageErrors.get(page)).toEqual([]));

test('Korean -LAYER names and full value chain share one U/REDO boundary', async ({ page }) => {
  const before = (await drawing(page)).layers;
  await tokens(page, [
    '-LAYER',
    'M',
    '기계실 벽체',
    'C',
    '3',
    '',
    'TR',
    '35',
    '',
    'LW',
    '0.25',
    '',
    'D',
    '검토용 벽체',
    '',
    '',
  ]);
  const result = await drawing(page);
  expect(result.settings.layer).toBe('기계실 벽체');
  expect(result.layers.find((row) => row.name === '기계실 벽체')).toMatchObject({
    aci: 3,
    transparency: 35,
    lineweight: 25,
    description: '검토용 벽체',
  });
  await enter(page, 'U');
  expect((await drawing(page)).layers).toEqual(before);
  await enter(page, 'REDO');
  expect((await drawing(page)).layers).toEqual(result.layers);
  await tokens(page, ['-LAYER', 'N', 'ESC_LAYER', 'C', '4', 'ESC_LAYER']);
  await page.keyboard.press('Escape');
  expect((await drawing(page)).layers.find((row) => row.name === 'ESC_LAYER')?.aci).toBe(4);
  await enter(page, 'U');
  expect((await drawing(page)).layers).toEqual(result.layers);
});
test('transparent -LAYER resumes LINE and COPYTOLAYER acquires mouse base/second points', async ({
  page,
}) => {
  await tokens(page, ['L', '0,0', "'-LAYER", 'N', 'TRANSPARENT_LAYER', '', '100,0', '']);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  expect((await drawing(page)).layers.some((row) => row.name === 'TRANSPARENT_LAYER')).toBe(true);
  await layer(page, 'DEST');
  await tokens(page, ['C', '50,40', '10']);
  await layer(page, '0');
  const before = (await drawing(page)).entities,
    view = await mapping(page);
  await enter(page, 'COPYTOLAYER');
  await point(page, view, 50, 0);
  await enter(page, '');
  await expect(page.locator('.command-prompt')).toContainText('대상 도면층');
  await point(page, view, 60, 40);
  await enter(page, '');
  await expect(page.locator('.command-prompt')).toContainText('기준점');
  await point(page, view, 0, 0);
  await enter(page, '@10,20');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('3');
  expect((await drawing(page)).entities.at(-1)).toMatchObject({
    type: 'line',
    layer: 'DEST',
    a: { x: 10, y: -20 },
    b: { x: 110, y: -20 },
  });
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(before);
});

test('ribbon freezes immediately and LAYISO/LAYUNISO restore exact flags with U/REDO', async ({
  page,
}, info) => {
  await layer(page, 'WALLS');
  await tokens(page, ['L', '0,0', '100,0', '']);
  await layer(page, 'DIMS');
  await tokens(page, ['C', '50,40', '10']);
  await layer(page, '0');
  const view = await mapping(page);
  const beforeFreeze = await page.getByTestId('drawing-canvas').screenshot();
  await page.getByRole('button', { name: '도면층 목록', exact: true }).click();
  await page.getByRole('button', { name: 'WALLS 동결', exact: true }).click();
  await expect
    .poll(async () => (await drawing(page)).layers.find((row) => row.name === 'WALLS')?.frozen)
    .toBe(true);
  await page.getByRole('button', { name: '도면층 목록', exact: true }).click();
  await point(page, view, 50, 0);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '0');
  const afterFreeze = await page.getByTestId('drawing-canvas').screenshot();
  expect(afterFreeze.equals(beforeFreeze)).toBe(false);
  await page.keyboard.press('Escape');
  await enter(page, 'U');
  await expect
    .poll(async () => !!(await drawing(page)).layers.find((row) => row.name === 'WALLS')?.frozen)
    .toBe(false);
  const original = (await drawing(page)).layers;
  const restoredView = await mapping(page);
  await enter(page, 'LAYISO');
  await point(page, restoredView, 50, 0);
  await enter(page, '');
  await expect
    .poll(async () => (await drawing(page)).layers.find((row) => row.name === 'DIMS')?.locked)
    .toBe(true);
  const isolated = (await drawing(page)).layers;
  await enter(page, 'LAYUNISO');
  expect((await drawing(page)).layers).toEqual(original);
  await enter(page, 'U');
  expect((await drawing(page)).layers).toEqual(isolated);
  await enter(page, 'REDO');
  expect((await drawing(page)).layers).toEqual(original);
  await page.screenshot({ path: info.outputPath('ribbon-layer-freeze-isolate.png') });
});

test('modeless manager creates, F2 renames, sorts and filters Korean layers', async ({
  page,
}, info) => {
  await enter(page, 'LAYER');
  const panel = page.getByTestId('layer-palette');
  await expect(panel).toBeVisible();
  await panel.getByRole('textbox', { name: '새 도면층 이름', exact: true }).fill('전기_조명');
  await panel.getByRole('button', { name: '새 도면층', exact: true }).click();
  const row = panel.locator('tr[data-layer="전기_조명"]');
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: '전기_조명', exact: true }).click();
  await page.keyboard.press('F2');
  await panel.getByRole('textbox', { name: '전기_조명 이름', exact: true }).fill('전기_콘센트');
  await panel.getByRole('textbox', { name: '전기_조명 이름', exact: true }).press('Enter');
  await expect(panel.locator('tr[data-layer="전기_콘센트"]')).toBeVisible();
  await panel.getByRole('textbox', { name: '도면층 검색', exact: true }).fill('전기');
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await panel.getByRole('textbox', { name: '도면층 검색', exact: true }).fill('');
  await panel.getByRole('button', { name: '필터', exact: true }).click();
  await panel.getByRole('textbox', { name: '필터 이름', exact: true }).fill('Electrical');
  await panel
    .getByRole('textbox', { name: '특성 필터 표현식', exact: true })
    .fill('name=전기* AND locked=false');
  await panel.getByRole('button', { name: '특성 필터 저장', exact: true }).click();
  await panel.getByRole('button', { name: '도면층', exact: true }).click();
  await panel
    .getByRole('combobox', { name: '도면층 필터', exact: true })
    .selectOption('Electrical');
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await panel.getByLabel('필터 반전', { exact: true }).check();
  await expect(panel.locator('tr[data-layer="전기_콘센트"]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('layer-manager-korean-filter.png') });
  await enter(page, 'L');
  await tokens(page, ['0,0', '30,0', '']);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await expect(panel).toBeVisible();
});

test('layer states restore properties and LAS import/export preserve Korean names and settings', async ({
  page,
}) => {
  await tokens(page, ['-LAYER', 'M', '설비', 'C', '2', '', 'TR', '40', '', '']);
  await enter(page, 'LAYER');
  const panel = page.getByTestId('layer-palette');
  await panel.getByRole('button', { name: '도면층 상태', exact: true }).click();
  await panel.getByRole('textbox', { name: '도면층 상태 이름', exact: true }).fill('검토 전');
  await panel.getByRole('button', { name: '새로 만들기 / 저장', exact: true }).click();
  const stateRow = panel
    .locator('.layer-state-row')
    .filter({ has: page.getByText('검토 전', { exact: true }) });
  const savedLayers = (await drawing(page)).layers;
  const downloaded = page.waitForEvent('download');
  await stateRow.getByRole('button', { name: '내보내기', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('검토 전.las');
  const path = await download.path();
  if (!path) throw new Error('LAS download was not saved.');
  const text = await readFile(path, 'utf8');
  expect(text).toContain('LAYERSTATEDICTIONARY');
  expect(text).toContain('설비');
  await stateRow.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(panel.locator('.layer-state-row')).toHaveCount(0);
  await panel
    .locator('input[type=file]')
    .setInputFiles({ name: '가져온 상태.las', mimeType: 'text/plain', buffer: Buffer.from(text) });
  await expect(stateRow).toBeVisible();
  await enter(page, '-LAYER');
  await tokens(page, ['C', '5', '설비', '']);
  expect((await drawing(page)).layers.find((row) => row.name === '설비')?.aci).toBe(5);
  await stateRow.getByRole('button', { name: '복원', exact: true }).click();
  const restored = (await drawing(page)).layers;
  expect(restored.find((row) => row.name === '설비')).toMatchObject({
    aci: 2,
    transparency: 40,
    lineweight: -3,
    visible: true,
    locked: false,
  });
  const originalZero = savedLayers.find((row) => row.name === '0')!;
  expect(restored.find((row) => row.name === '0')?.trueColor).toBe(
    parseInt(originalZero.color.replace('#', ''), 16),
  );
});
