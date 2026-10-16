import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { drawing, enter, mapping, point } from './cad-actions';

async function prepare(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  for (const name of ['ORTHOMODE', 'OSMODE']) {
    await enter(page, name);
    await enter(page, '0');
  }
  for (const end of ['100,0', '0,100']) {
    await enter(page, 'LINE');
    await enter(page, '0,0');
    await enter(page, end);
    await enter(page, '');
  }
  return mapping(page);
}

test('releasing a chord restores held Shift and either Shift key can keep Ortho active', async ({
  page,
}) => {
  const view = await prepare(page);
  await enter(page, 'LINE');
  await enter(page, '0,40');
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyE');
  await page.keyboard.up('KeyE');
  await point(page, view, 60, 70);
  await page.keyboard.down('ShiftRight');
  await page.keyboard.up('ShiftLeft');
  await point(page, view, 90, 90);
  await page.keyboard.up('ShiftRight');
  await enter(page, '');
  const lines = (await drawing(page)).entities.filter((entity) => entity.type === 'line');
  const first = lines[2];
  const second = lines[3];
  if (first?.type !== 'line' || second?.type !== 'line') throw new Error('Expected new lines');
  expect(first.b.x).toBeCloseTo(60, 0);
  expect(first.b.y).toBeCloseTo(-40, 6);
  expect(second.b.x).toBeCloseTo(first.b.x, 6);
  expect(second.b.y).toBeCloseTo(-90, 0);
});

test('a modal text window owns drafting keys and does not carry overrides back to LINE', async ({
  page,
}) => {
  const view = await prepare(page);
  await enter(page, 'LINE');
  await enter(page, '0,40');
  await page.keyboard.press('Control+F2');
  const dialog = page.getByRole('dialog', { name: /HanCAD 문자 윈도우/ });
  await expect(dialog).toBeVisible();
  await dialog.locator('pre').focus();
  await page.keyboard.press('F7');
  await page.keyboard.down('Shift');
  await page.keyboard.down('KeyE');
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.command-prompt')).toContainText('다음 점 지정');
  await point(page, view, 100.6, 0.6);
  await page.keyboard.up('KeyE');
  await page.keyboard.up('Shift');
  await enter(page, '');
  const last = (await drawing(page)).entities.at(-1);
  if (last?.type !== 'line') throw new Error('Expected a new line');
  expect(Math.abs(last.b.x - 100)).toBeGreaterThan(0.05);
  expect(Math.abs(last.b.y)).toBeGreaterThan(0.05);
  const grid = page
    .getByRole('toolbar', { name: '상태막대' })
    .getByRole('button', { name: '그리드', exact: true });
  await expect(grid).toHaveAttribute('aria-pressed', 'true');
});

test('TEMPOVERRIDES=0 leaves shifted point input available to the command line', async ({
  page,
}) => {
  await page.goto('/');
  await enter(page, 'TEMPOVERRIDES');
  await enter(page, '0');
  await enter(page, 'LINE');
  await page.keyboard.press('Shift+KeyE');
  await expect(page.getByRole('textbox', { name: '명령 입력', exact: true })).toHaveText('E');
  await page.keyboard.press('Escape');
});
