import { chromium } from '@playwright/test';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.resolve(root, process.argv[2] ?? 'test-artifacts/newexports');
const relative = path.relative(root, directory);
if (relative.startsWith('..') || path.isAbsolute(relative)) {
  throw new Error('Artifact directory must remain inside the project.');
}
const output = path.join(directory, 'verified');
await mkdir(output, { recursive: true });
const files = (await readdir(directory)).filter((name) => name.endsWith('.svg'));
if (!files.length) throw new Error('No actual SVG downloads found.');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(/^https?:/, async (route) => {
    errors.push(`External request from SVG: ${route.request().url()}`);
    await route.abort();
  });
  for (const file of files) {
    const source = await readFile(path.join(directory, file));
    const data = `data:image/svg+xml;base64,${source.toString('base64')}`;
    await page.setContent(
      '<!doctype html><html><head><style>' +
        'body{margin:0;background:white;display:flex;justify-content:center;align-items:center;min-height:900px}' +
        'img{display:block;width:1200px;height:860px;object-fit:contain}' +
        '</style></head><body><img alt="Exported drawing"></body></html>',
    );
    await page.locator('img').evaluate(async (element, src) => {
      if (!(element instanceof HTMLImageElement)) throw new Error('Expected an image.');
      element.src = src;
      await element.decode();
      if (!element.naturalWidth || !element.naturalHeight) throw new Error('Empty SVG image.');
    }, data);
    const image = page.locator('img');
    const target = path.join(output, `${path.basename(file, '.svg')}-svg-render.png`);
    await image.screenshot({ path: target });
    console.log(`Rendered SVG: ${path.relative(root, target)}`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
