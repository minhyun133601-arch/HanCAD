import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { enter } from './cad-actions';

async function variable(page: Page, name: string, value: string): Promise<void> {
  await enter(page, 'GETVAR');
  await enter(page, name);
  await expect(
    page.getByRole('log', { name: '명령 기록' }).locator('.history-line').last(),
  ).toContainText(`${name} = ${value}`);
}

test('canonical drafting commands share Korean prompts and live settings with transparent LINE input', async ({
  page,
}) => {
  await page.goto('/');
  const prompt = page.locator('.command-prompt');
  await enter(page, 'GRID');
  await expect(prompt).toContainText('간격두기');
  await enter(page, 'A');
  await expect(prompt).toContainText('수평');
  await enter(page, '5');
  await expect(prompt).toContainText('수직');
  await enter(page, '7');
  await expect(prompt).toHaveText('명령:');
  await variable(page, 'GRIDUNIT', '5,7');
  await enter(page, 'GRID');
  await enter(page, 'M');
  await enter(page, '0');
  await expect(prompt).toContainText('빈도');
  await enter(page, '8');
  await variable(page, 'GRIDMAJOR', '8');
  await enter(page, 'SNAP');
  await enter(page, 'S');
  await expect(prompt).toContainText('스타일');
  await enter(page, 'I');
  await expect(prompt).toContainText('수직');
  await enter(page, '8');
  await variable(page, 'SNAPSTYL', '1');
  await enter(page, 'SNAP L Y');
  await variable(page, 'SNAPGRIDLEGACY', '1');
  await enter(page, 'ISOPLANE R');
  await variable(page, 'SNAPISOPAIR', '2');
  await enter(page, 'ISODRAFT O');
  await variable(page, 'SNAPSTYL', '0');
  await enter(page, 'ORTHO ON');
  await variable(page, 'ORTHOMODE', '1');
  await enter(page, 'L');
  await enter(page, '0,0');
  await enter(page, "'ORTHO");
  await expect(prompt).toContainText('직교');
  await enter(page, 'OFF');
  await expect(prompt).toContainText('다음 점');
  await enter(page, '10,10');
  await enter(page, '');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await variable(page, 'ORTHOMODE', '0');
});
