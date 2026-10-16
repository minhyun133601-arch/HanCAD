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
let painterContracts = [];
let linetypeContracts = [];
let precisionContracts = [];
let viewportContracts = [];
try {
  const page = await browser.newPage({ viewport: { width: 1040, height: 460 } });
  await page.addScriptTag({ path: path.join(root, 'apps/web/dist/runtime/cad-runtime.js') });
  await page.addScriptTag({ content: script });
  for (let index = 0; index < 28; index++) {
    const result = await page.evaluate((i) => globalThis.HanCADRenderQA.runGolden(i), index);
    results.push(result);
    await page.screenshot({
      path: path.join(output, `scene-${String(index).padStart(2, '0')}.png`),
    });
  }
  painterContracts = await page.evaluate(() => globalThis.HanCADRenderQA.runPainterContracts());
  linetypeContracts = await page.evaluate(() => globalThis.HanCADRenderQA.runLinetypeContracts());
  precisionContracts = await page.evaluate(() => globalThis.HanCADRenderQA.runPrecisionContracts());
  await page.screenshot({ path: path.join(output, 'precision-survey-262144-pan-half-pixel.png') });
  viewportContracts = await page.evaluate(() => globalThis.HanCADRenderQA.runViewportContracts());
} finally {
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
}
await fs.writeFile(
  path.join(output, 'painter-contracts.json'),
  JSON.stringify(painterContracts, null, 2),
);
await fs.writeFile(
  path.join(output, 'linetype-contracts.json'),
  JSON.stringify(linetypeContracts, null, 2),
);
await fs.writeFile(
  path.join(output, 'precision-contracts.json'),
  JSON.stringify(precisionContracts, null, 2),
);
await fs.writeFile(
  path.join(output, 'viewport-contracts.json'),
  JSON.stringify(viewportContracts, null, 2),
);
for (const result of viewportContracts)
  for (const frame of result.frames) {
    assert.equal(frame.glError, 0, `${result.name} generated a WebGL error.`);
    assert(
      frame.maximumError <= 2,
      `${result.name} lost visible stroke pixels at scale ${frame.scale}: ${JSON.stringify(frame)}`,
    );
  }
for (const result of precisionContracts) {
  assert.equal(
    result.uniqueOriginPanFrames,
    5,
    `${result.name} at ${result.scale} does not track small origin pan steps.`,
  );
  assert.equal(
    result.uniqueTranslatedPanFrames,
    5,
    `${result.name} at ${result.scale} does not track small survey pan steps.`,
  );
  for (const frame of result.comparisons) {
    assert(
      frame.glErrors.every((error) => error === 0),
      `${result.name} generated a WebGL error.`,
    );
    if (result.name === 'exact-binary-lines')
      assert.equal(
        frame.actualHash,
        frame.expectedHash,
        `Binary-fraction lines jitter at ${result.scale} and ${frame.panCssPixels} px pan.`,
      );
    else
      assert(
        frame.meanChannelError <= 0.005 &&
          frame.maximumChannelError <= 16 &&
          frame.geometryMissing === 0 &&
          frame.geometryUnexpected === 0,
        `Small arcs/widths moved outside the one-pixel neighborhood at ${result.scale}: ${JSON.stringify(frame)}`,
      );
  }
}
for (const result of [...painterContracts, ...linetypeContracts]) {
  assert.equal(result.glError, 0, `${result.name} generated a WebGL error.`);
  assert(
    result.maximumError <= 2,
    `${result.name} has the wrong painter order: ${JSON.stringify(result)}`,
  );
}
for (const result of results) {
  assert.equal(result.glError, 0, `Scene ${result.index} generated a WebGL error.`);
  assert(
    result.meanChannelError < 1.25,
    `Scene ${result.index} differs from the explicit Canvas2D reference: ${JSON.stringify(result)}`,
  );
  assert(
    result.geometryMissing <= Math.max(3, result.referenceInk * 0.005) &&
      result.geometryUnexpected <= Math.max(3, result.cachedInk * 0.005) &&
      Math.abs(result.cachedCoverage - result.referenceCoverage) <=
        Math.max(1, result.referenceCoverage * (result.thinLines ? 0.3 : 0.08)),
    `Scene ${result.index} lost visible geometry: ${JSON.stringify(result)}`,
  );
  for (const probe of result.probeChecks ?? [])
    assert(
      probe.maximumError <= 2,
      `Scene ${result.index} ${probe.name} has the wrong composited color: ${JSON.stringify(probe)}`,
    );
}
assert.equal(
  results[7].gpuHash,
  results[19].gpuHash,
  'Legacy scene changes at Korean survey coordinates.',
);
assert.equal(
  results[20].gpuHash,
  results[26].gpuHash,
  'Native wide geometry changes at Korean survey coordinates.',
);
console.log(
  JSON.stringify({
    scenes: results.length,
    exactColorContracts: painterContracts.length + linetypeContracts.length,
    viewportBoundaryContracts: viewportContracts.length,
    highZoomPrecisionComparisons: precisionContracts.reduce(
      (count, item) => count + item.comparisons.length,
      0,
    ),
    maxMeanChannelError: Math.max(...results.map((r) => r.meanChannelError)),
    maxMissingPixels: Math.max(...results.map((r) => r.geometryMissing)),
    maxUnexpectedPixels: Math.max(...results.map((r) => r.geometryUnexpected)),
    maxCompositingChannelError: Math.max(
      ...results.flatMap((r) => (r.probeChecks ?? []).map((p) => p.maximumError)),
    ),
    translatedScenesIdentical: true,
    gpuRenderer: results[0].gpuRenderer,
    output,
  }),
);
