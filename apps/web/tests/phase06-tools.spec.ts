import { expect, test, type Page } from '@playwright/test';
import { drawing, enter, mapping } from './cad-actions';

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
test('PTYPE edits live point symbols and cancel preserves the committed style', async ({
  page,
}, info) => {
  await enter(page, 'PTYPE');
  const dialog = page.getByRole('dialog', { name: '점 스타일', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'PDMODE 34', exact: true }).click();
  await dialog.getByLabel('점 크기', { exact: true }).fill('4');
  await dialog.getByLabel('절대 단위 크기 설정').check();
  await page.screenshot({ path: info.outputPath('point-style-dialog.png') });
  await dialog.getByRole('button', { name: '확인', exact: true }).click();
  await tokens(page, ['GETVAR', 'PDMODE']);
  await expect(
    page.getByRole('log', { name: '명령 기록' }).locator('.history-line').last(),
  ).toContainText('PDMODE = 34');
  await tokens(page, ['POINT', '0,0']);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  expect((await drawing(page)).entities[0]?.sourceType).toBe('POINT');
  await enter(page, 'DDPTYPE');
  await dialog.getByRole('button', { name: 'PDMODE 3', exact: true }).click();
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await tokens(page, ['GETVAR', 'PDMODE']);
  await expect(
    page.getByRole('log', { name: '명령 기록' }).locator('.history-line').last(),
  ).toContainText('PDMODE = 34');
});
test('MLSTYLE saves a Korean style and MLINE retains its custom offsets after recovery', async ({
  page,
}, info) => {
  await enter(page, 'MLSTYLE');
  const dialog = page.getByRole('dialog', { name: '여러 줄 스타일', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('이름', { exact: true }).fill('벽체');
  await dialog.getByLabel('설명', { exact: true }).fill('기본 벽체');
  await dialog.getByLabel('요소 간격띄우기 (쉼표로 구분)').fill('0.5, -0.5');
  await page.screenshot({ path: info.outputPath('multiline-style-dialog.png') });
  await dialog.getByRole('button', { name: '확인', exact: true }).click();
  await tokens(page, ['MLINE', 'J', 'Z', 'S', '10', '0,0', '100,0', '100,100', '']);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  const state = await drawing(page);
  expect(state.mlineStyles?.find((style) => style.name === '벽체')?.offsets).toEqual([0.5, -0.5]);
  expect(state.entities[0]?.mline).toMatchObject({ style: '벽체', scale: 10, justification: 1 });
  await page.reload();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  expect((await drawing(page)).entities[0]?.mline).toEqual(state.entities[0]?.mline);
});
test('REGION converts a closed loop with exact area and one undo restores source objects', async ({
  page,
}) => {
  await tokens(page, ['LINE', '0,0', '100,0', '100,50', '0,50', 'C', 'REGION', 'ALL', '']);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  const state = await drawing(page);
  expect(state.entities[0]).toMatchObject({ sourceType: 'REGION', regionArea: 5000 });
  expect(state.entities[0]?.regionLoops?.[0]).toHaveLength(4);
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('4');
  await enter(page, 'REDO');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
});
test('REVCLOUD and WIPEOUT retain exact boundaries and frame modes through recovery', async ({
  page,
}, info) => {
  await tokens(page, ['REVCLOUD', 'A', '5', 'R', '0,0', '100,50', '']);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await tokens(page, ['WIPEOUT', '150,0', '200,0', '200,50', '175,25', '150,50', '']);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  const state = await drawing(page);
  expect(state.entities[0]?.sourceType).toBe('REVCLOUD');
  expect(state.entities[1]?.sourceType).toBe('WIPEOUT');
  await tokens(page, ['WIPEOUT', 'F', 'D']);
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
  await tokens(page, ['GETVAR', 'WIPEOUTFRAME']);
  await expect(
    page.getByRole('log', { name: '명령 기록' }).locator('.history-line').last(),
  ).toContainText('WIPEOUTFRAME = 2');
  await mapping(page);
  await page.screenshot({ path: info.outputPath('cloud-wipeout.png') });
  await page.reload();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  expect((await drawing(page)).entities.map((entity) => entity.sourceType)).toEqual([
    'REVCLOUD',
    'WIPEOUT',
  ]);
});
