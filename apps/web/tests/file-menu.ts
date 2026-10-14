import type { Download, Page } from '@playwright/test';

export async function chooseFile(
  page: Page,
  file: string | { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  await page.getByRole('button', { name: '파일', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'DWG / DXF 열기', exact: true }).click();
  await (await chooser).setFiles(file);
}

export async function saveFromFileMenu(page: Page, label: string): Promise<Download> {
  await page.getByRole('button', { name: '파일', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: label, exact: true }).click();
  return download;
}
