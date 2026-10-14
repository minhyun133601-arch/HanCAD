import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const output = path.join(root, 'test-artifacts', 'render-golden');
await fs.mkdir(output, { recursive: true });
const built = await build({
  configFile: false,
  logLevel: 'error',
  resolve: {
    alias: { '@hancad/legacy-bridge': path.join(root, 'packages/legacy-bridge/src/index.ts') },
  },
  build: {
    write: false,
    minify: false,
    lib: {
      entry: path.join(root, 'packages/render/qa/golden-harness.ts'),
      name: 'HanCADRenderQA',
      formats: ['iife'],
    },
  },
});
const bundles = Array.isArray(built) ? built : [built];
const script = bundles
  .flatMap((bundle) => bundle.output)
  .find((item) => item.type === 'chunk').code;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1040, height: 460 } });
  await page.addScriptTag({ path: path.join(root, 'apps/web/dist/runtime/cad-runtime.js') });
  await page.addScriptTag({ content: script });
  for (let index = 0; index < 20; index++) {
    const result = await page.evaluate((i) => globalThis.HanCADRenderQA.runGolden(i), index);
    results.push(result);
    await page.screenshot({
      path: path.join(output, `scene-${String(index).padStart(2, '0')}.png`),
    });
    assert(
      result.meanChannelError < 0.5,
      `Scene ${index} differs from legacy drawing: ${JSON.stringify(result)}`,
    );
    assert(
      result.geometryMissing <= Math.max(3, result.referenceInk * 0.005) &&
        Math.abs(result.cachedCoverage - result.referenceCoverage) <=
          Math.max(1, result.referenceCoverage * 0.08),
      `Scene ${index} lost visible geometry: ${JSON.stringify(result)}`,
    );
  }
} finally {
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
}
console.log(
  JSON.stringify({
    scenes: results.length,
    maxMeanChannelError: Math.max(...results.map((r) => r.meanChannelError)),
    output,
  }),
);
