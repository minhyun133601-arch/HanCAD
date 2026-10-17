import { expect, test, type Page } from '@playwright/test';

async function openProgress(page: Page, name: string): Promise<void> {
  await page.getByRole('textbox', { name: /^(명령 입력|Type a command)$/ }).focus();
  await page.keyboard.type('HANPROGRESS');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible();
}

test('progress features, limitations and all 26 phases follow the shell language', async ({
  page,
}) => {
  await page.goto('/');
  await openProgress(page, '개발 현황');
  const korean = page.getByRole('dialog', { name: '개발 현황', exact: true });
  await expect(korean.getByRole('heading', { name: '지금 사용할 수 있는 기능' })).toBeVisible();
  await expect(korean.locator('tbody tr')).toHaveCount(26);
  await expect(korean.locator('tbody th').first()).toHaveText('기반 구축');
  await expect(korean.locator('tbody tr').first()).toContainText('MSVC·Windows SDK');
  await expect(korean.locator('tbody tr').first()).toContainText('진행 중');
  await korean.locator('summary').click();
  await expect(korean.locator('details li')).toHaveCount(6);
  await expect(korean.locator('details')).toContainText('벡터·정밀 축척 출력');
  await korean.getByRole('button', { name: '닫기', exact: true }).click();

  await page.getByRole('combobox', { name: '언어' }).selectOption('en-US');
  await openProgress(page, 'Development progress');
  const english = page.getByRole('dialog', { name: 'Development progress', exact: true });
  await expect(english.getByRole('heading', { name: 'Features available now' })).toBeVisible();
  await expect(
    english.getByRole('heading', { name: 'Prompt implementation progress' }),
  ).toBeVisible();
  await expect(english.locator('tbody tr')).toHaveCount(26);
  await expect(english.locator('tbody th').first()).toHaveText('Bootstrap');
  await expect(english.locator('tbody tr').first()).toContainText('await MSVC and the Windows SDK');
  await expect(english.locator('tbody tr').first()).toContainText('In progress');
  await expect(english.locator('.development-dialog-content > ul > li')).toHaveCount(15);
  await expect(english.locator('tbody tr').nth(3)).toContainText('Complete');
  await expect(english.locator('tbody tr').nth(4)).toContainText('Complete');
  await expect(english).toContainText('F1 command help');
  await expect(english).toContainText('TRIM/EXTEND Quick and Standard modes');
  if ((await english.locator('details').getAttribute('open')) === null)
    await english.locator('summary').click();
  await expect(english.locator('details')).toHaveJSProperty('open', true);
  await expect(english.locator('details li')).toHaveCount(6);
  await expect(english.locator('details')).toContainText('Vector output and precise plot scales');
  expect(await english.innerText()).not.toMatch(/[가-힣]/);
  await english.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('combobox', { name: 'Language' }).selectOption('ko-KR');
  await openProgress(page, '개발 현황');
  await expect(korean.locator('tbody th').last()).toHaveText('패키징·배포');
  await expect(korean).toContainText('TEXT/DTEXT 도면 위 한글 문자 입력');
  await expect(korean.locator('details')).toContainText('페이즈 5');
});
