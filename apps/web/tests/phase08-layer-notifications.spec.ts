import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { drawing, enter } from './cad-actions';

const notificationText = '조정되지 않은 새 도면층이 있습니다.';
async function createLayer(page: Page, name: string): Promise<void> {
  await enter(page, 'LAYER');
  const panel = page.getByTestId('layer-palette');
  await panel.getByRole('textbox', { name: '새 도면층 이름', exact: true }).fill(name);
  await panel.getByRole('button', { name: '새 도면층', exact: true }).click();
  await expect
    .poll(
      async () => (await drawing(page)).layers.find((layer) => layer.name === name)?.unreconciled,
    )
    .toBe(true);
  await panel.getByRole('button', { name: '닫기', exact: true }).click();
}
async function saveNative(page: Page): Promise<Buffer> {
  const waiting = page.waitForEvent('download');
  await enter(page, 'HANSAVE');
  const download = await waiting,
    path = await download.path();
  if (!path) throw new Error('Native drawing download is unavailable.');
  return readFile(path);
}
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  for (const token of ['LAYEREVAL', '2']) await enter(page, token);
});

test('Save-only layer notifications wait for Save and do not fire immediately after another manual layer is created', async ({
  page,
}) => {
  for (const token of ['LAYERNOTIFY', '16']) await enter(page, token);
  await createLayer(page, 'NeedsReview');
  const notice = page.getByRole('button', { name: notificationText, exact: true });
  await expect(notice).toBeHidden();
  await saveNative(page);
  await expect(notice).toBeVisible();
  await notice.click();
  const panel = page.getByTestId('layer-palette');
  await panel.getByRole('button', { name: 'NeedsReview', exact: true }).click();
  await panel.getByRole('button', { name: '조정', exact: true }).click();
  await panel.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(notice).toBeHidden();
  await createLayer(page, 'LaterReview');
  await expect(notice).toBeHidden();
  await saveNative(page);
  await expect(notice).toBeVisible();
});

test('Open and Save event bits remain independent and a saved alert does not replay for an unconfigured Open event', async ({
  page,
}) => {
  for (const token of ['LAYERNOTIFY', '2']) await enter(page, token);
  await createLayer(page, 'FromFile');
  const notice = page.getByRole('button', { name: notificationText, exact: true });
  const openOnly = await saveNative(page);
  await expect(notice).toBeHidden();
  await page.getByTestId('cad-file-input').setInputFiles({
    name: 'open-only.hcd',
    mimeType: 'application/octet-stream',
    buffer: openOnly,
  });
  await expect(notice).toBeVisible();
  for (const token of ['LAYERNOTIFY', '16']) await enter(page, token);
  await expect(notice).toBeHidden();
  await saveNative(page);
  await expect(notice).toBeVisible();
  const saveOnly = await saveNative(page);
  await page.getByTestId('cad-file-input').setInputFiles({
    name: 'save-only.hcd',
    mimeType: 'application/octet-stream',
    buffer: saveOnly,
  });
  await expect
    .poll(async () => (await drawing(page)).layers.some((layer) => layer.name === 'FromFile'))
    .toBe(true);
  await expect(notice).toBeHidden();
});
