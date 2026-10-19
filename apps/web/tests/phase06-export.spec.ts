import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { drawing, enter } from './cad-actions';
import { saveFromFileMenu } from './file-menu';

test('WIPEOUT exports use the current frame mode and preserve creation metadata', async ({
  page,
}, info) => {
  await page.goto('/');
  for (const token of [
    'OSMODE',
    '0',
    'DYNMODE',
    '0',
    'WIPEOUTFRAME',
    '1',
    'WIPEOUT',
    '0,0',
    '100,0',
    '100,50',
    '0,50',
    '',
  ])
    await enter(page, token);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  const source = (await drawing(page)).entities;
  expect(source[0]).toMatchObject({ sourceType: 'WIPEOUT', frameMode: 1 });
  for (const [mode, plotted] of [
    ['D', false],
    ['ON', true],
    ['OFF', false],
  ] as const) {
    for (const token of ['WIPEOUT', 'F', mode]) await enter(page, token);
    const svgDownload = await saveFromFileMenu(page, 'SVG 저장'),
      svgPath = info.outputPath(`wipeout-${mode}.svg`);
    await svgDownload.saveAs(svgPath);
    const svg = await fs.readFile(svgPath, 'utf8');
    const paths = await page.evaluate((text) => {
      const document = new DOMParser().parseFromString(text, 'image/svg+xml');
      return {
        masks: document.querySelectorAll('path[fill="#ffffff"][stroke="none"]').length,
        frames: document.querySelectorAll('path[vector-effect="non-scaling-stroke"]').length,
      };
    }, svg);
    expect(paths.masks).toBe(1);
    expect(paths.frames).toBe(plotted ? 1 : 0);
    const pngDownload = await saveFromFileMenu(page, 'PNG 저장'),
      pngPath = info.outputPath(`wipeout-${mode}.png`);
    await pngDownload.saveAs(pngPath);
    const png = (await fs.readFile(pngPath)).toString('base64');
    const hasInk = await page.evaluate(async (base64) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height),
        context = canvas.getContext('2d');
      if (!context) throw new Error('PNG verification canvas is unavailable');
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 0; index < pixels.length; index += 4)
        if (pixels[index]! < 245 || pixels[index + 1]! < 245 || pixels[index + 2]! < 245)
          return true;
      return false;
    }, png);
    expect(hasInk).toBe(plotted);
    expect((await drawing(page)).entities).toEqual(source);
  }
  await page.reload();
  expect((await drawing(page)).entities).toEqual(source);
});
