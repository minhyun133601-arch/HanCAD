import { expect, test } from '@playwright/test';
import { drawing, enter, mapping, point } from './cad-actions';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await enter(page, 'L');
  await enter(page, '0,0');
  await enter(page, '20,0');
  await enter(page, '');
  await enter(page, 'L');
  await enter(page, '40,20');
  await enter(page, '60,20');
  await enter(page, '');
});

test('MOVE shares ALL, Remove, Previous and typed Window selection prompts', async ({ page }) => {
  const original = (await drawing(page)).entities;
  await enter(page, 'MOVE');
  await enter(page, 'ALL');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '2');
  await enter(page, '');
  await enter(page, '0,0');
  await enter(page, '@10,10');
  expect((await drawing(page)).entities[0]).toMatchObject({
    id: original[0]?.id,
    a: { x: 10, y: -10 },
  });
  await enter(page, 'SELECT');
  await enter(page, 'P');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '2');
  await enter(page, 'R');
  await enter(page, 'W');
  await enter(page, '9,9');
  await enter(page, '31,11');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '1');
  await enter(page, '');
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
});

test('named groups, descriptions, member editing and Undo survive reload', async ({ page }) => {
  await enter(page, 'GROUP');
  await enter(page, 'N');
  await enter(page, 'WALLS');
  await enter(page, 'D');
  await enter(page, 'Exterior walls');
  await enter(page, 'ALL');
  await enter(page, '');
  expect((await drawing(page)).groups?.[0]).toMatchObject({
    name: 'WALLS',
    description: 'Exterior walls',
  });
  const view = await mapping(page);
  await point(page, view, 10, 0);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '2');
  await page.keyboard.press('Escape');
  await enter(page, 'GROUPEDIT');
  await enter(page, 'WALLS');
  await enter(page, 'REN');
  await enter(page, 'RENAMED');
  expect((await drawing(page)).groups?.[0]?.name).toBe('RENAMED');
  await enter(page, 'UNGROUP');
  await enter(page, 'RENAMED');
  expect((await drawing(page)).groups).toEqual([]);
  await enter(page, 'U');
  expect((await drawing(page)).groups?.[0]?.name).toBe('RENAMED');
  await page.reload();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  expect((await drawing(page)).groups?.[0]?.name).toBe('RENAMED');
});

test('QSELECT and SELECTSIMILAR settings select matching entities', async ({ page }) => {
  await enter(page, 'C');
  await enter(page, '100,50');
  await enter(page, '10');
  await enter(page, 'QSELECT');
  const dialog = page.getByRole('dialog', { name: '신속 선택' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('객체 유형', { exact: true }).selectOption('line');
  await dialog.getByRole('button', { name: '확인', exact: true }).click();
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '2');
  await page.keyboard.press('Escape');
  const view = await mapping(page);
  await enter(page, 'SELECTSIMILAR');
  await enter(page, 'SE');
  const settings = page.getByRole('dialog', { name: '유사 선택 설정' });
  await expect(settings).toBeVisible();
  await settings.getByLabel('색상', { exact: true }).check();
  await settings.getByRole('button', { name: '확인', exact: true }).click();
  await point(page, view, 10, 0);
  await enter(page, '');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '2');
});

test('FILTER builds nested named expressions and restores them after reload', async ({ page }) => {
  await enter(page, 'C');
  await enter(page, '100,50');
  await enter(page, '10');
  await enter(page, 'FILTER');
  let dialog = page.getByRole('dialog', { name: '객체 선택 필터' });
  await dialog.getByLabel('특성', { exact: true }).selectOption('type');
  await dialog.getByLabel('값', { exact: true }).fill('line');
  await dialog.getByRole('button', { name: '리스트에 추가', exact: true }).click();
  await dialog.getByRole('button', { name: '논리 그룹 작성', exact: true }).click();
  await dialog.getByLabel('다른 이름으로 저장', { exact: true }).fill('LineObjects');
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await dialog.getByLabel('논리 연산자', { exact: true }).selectOption('xor');
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('XOR: 2개');
  await dialog.getByLabel('논리 연산자', { exact: true }).selectOption('and');
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '0');
  await expect(page.locator('.command-prompt')).toHaveText('객체 선택:');
  await enter(page, 'ALL');
  await enter(page, '');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '2');
  await page.reload();
  await enter(page, 'FILTER');
  dialog = page.getByRole('dialog', { name: '객체 선택 필터' });
  await dialog.getByLabel('저장된 필터', { exact: true }).selectOption('LineObjects');
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await enter(page, 'ALL');
  await enter(page, '');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '2');
  await page
    .getByRole('toolbar', { name: '신속 접근 도구막대' })
    .getByRole('button', { name: '새 도면', exact: true })
    .click();
  await enter(page, 'FILTER');
  await page
    .getByRole('dialog', { name: '객체 선택 필터' })
    .getByLabel('저장된 필터', { exact: true })
    .selectOption('LineObjects');
  await page
    .getByRole('dialog', { name: '객체 선택 필터' })
    .getByRole('button', { name: '취소', exact: true })
    .click();
});

test('DDGRIPS applies selection and grip profile settings and Cancel discards edits', async ({
  page,
}) => {
  await enter(page, 'DDGRIPS');
  let dialog = page.getByRole('dialog', { name: '옵션 — 선택' });
  await dialog.getByLabel('확인란 크기', { exact: true }).fill('7');
  await dialog.getByLabel('그립 크기', { exact: true }).fill('9');
  await dialog.getByLabel('명사/동사 선택', { exact: true }).uncheck();
  await dialog.getByRole('button', { name: '확인', exact: true }).click();
  await enter(page, 'GETVAR');
  await enter(page, 'PICKBOX');
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText('PICKBOX = 7');
  await enter(page, 'DDGRIPS');
  dialog = page.getByRole('dialog', { name: '옵션 — 선택' });
  await expect(dialog.getByLabel('그립 크기', { exact: true })).toHaveValue('9');
  await dialog.getByLabel('확인란 크기', { exact: true }).fill('20');
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await enter(page, 'GETVAR');
  await enter(page, 'PICKBOX');
  await expect(
    page.getByRole('log', { name: '명령 기록' }).locator('.history-line').last(),
  ).toHaveText('PICKBOX = 7');
});

test('selection keyword popup and dynamic Down menu share the same keyword inputs', async ({
  page,
}) => {
  const view = await mapping(page);
  await enter(page, 'SELECT');
  await expect(page.locator('.command-prompt')).toHaveText('객체 선택:');
  await page.getByRole('button', { name: '선택 옵션', exact: true }).click();
  await page.getByRole('menuitem', { name: '전체(ALL)', exact: true }).click();
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '2');
  await enter(page, '');
  await page.keyboard.press('Escape');
  await enter(page, 'SELECT');
  await point(page, view, 30, 10, false);
  await page.keyboard.press('ArrowDown');
  const menu = page.getByRole('menu', { name: '동적 입력 옵션', exact: true });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: '전체(ALL)', exact: true }).click();
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '2');
});

test('MOVE accepts Korean group names and Single completes command-then-select automatically', async ({
  page,
}) => {
  await enter(page, 'GROUP');
  await enter(page, 'N');
  await page.getByRole('textbox', { name: '명령 입력', exact: true }).fill('한글그룹');
  await page.keyboard.press('Enter');
  await enter(page, 'ALL');
  await enter(page, '');
  await page.keyboard.press('Escape');
  await enter(page, 'MOVE');
  await enter(page, 'G');
  await expect(page.locator('.command-prompt')).toHaveText('그룹 이름 입력:');
  await page.getByRole('textbox', { name: '명령 입력', exact: true }).fill('한글그룹');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '2');
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText('2개를 찾음');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await enter(page, 'MOVE');
  await enter(page, 'SI');
  await enter(page, 'ALL');
  await expect(page.locator('.command-prompt')).toHaveText('기준점 지정 또는 [변위(D)] <변위>:');
  await enter(page, '0,0');
  await enter(page, '@10,0');
  expect((await drawing(page)).entities[0]).toMatchObject({ a: { x: 10, y: 0 } });
});

test('transparent FILTER selects a filtered set then resumes MOVE selection', async ({ page }) => {
  await enter(page, 'C');
  await enter(page, '100,50');
  await enter(page, '10');
  await enter(page, 'MOVE');
  await enter(page, "'FILTER");
  const dialog = page.getByRole('dialog', { name: '객체 선택 필터' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('특성', { exact: true }).selectOption('type');
  await dialog.getByLabel('값', { exact: true }).fill('circle');
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  await expect(page.locator('.command-prompt')).toContainText('>>');
  await enter(page, 'ALL');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '1');
  await enter(page, '');
  await expect(page.locator('.command-prompt')).toHaveText('객체 선택:');
  await enter(page, '');
  await enter(page, '0,0');
  await enter(page, '@10,0');
  expect((await drawing(page)).entities[0]).toMatchObject({ a: { x: 0, y: 0 } });
  expect((await drawing(page)).entities[2]).toMatchObject({ center: { x: 110, y: -50 } });
});
