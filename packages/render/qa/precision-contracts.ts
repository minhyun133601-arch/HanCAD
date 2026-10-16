import type { DisplayEntity, DisplayGeometry, Vec2 } from '../src/display/types';
import { WebGlRenderer } from '../src/webgl/renderer';
import { goldenCanvases, goldenHeight, goldenWidth } from './pixel-comparison';

interface Capture {
  pixels: Uint8Array;
  hash: number;
  glError: number;
}
const background = [33, 40, 48];

function capture(origin: Vec2, scale: number, includeCurves: boolean, pan: number): Capture {
  const { gpuCanvas } = goldenCanvases();
  const p = (x: number, y: number) => ({ x: origin.x + x, y: origin.y + y });
  const entities: DisplayEntity[] = [];
  const add = (geometry: DisplayGeometry, rgb: number) =>
    entities.push({
      id: `precision-${entities.length}`,
      geometry,
      layer: '0',
      color: { kind: 'rgb', rgb },
      linetype: 'CONTINUOUS',
      linetypeScale: 1,
      lineweight: 50,
      transparency: 0,
      plinegen: false,
    });
  add({ type: 'line', start: p(-1 / 2048, -1 / 4096), end: p(1 / 2048, 1 / 4096) }, 0xffcc33);
  add({ type: 'line', start: p(-1 / 4096, 1 / 4096), end: p(1 / 4096, 1 / 4096) }, 0x44bbff);
  if (includeCurves) {
    add(
      {
        type: 'arc',
        center: p(1 / 8192, 1 / 8192),
        radius: 1 / 4096,
        startAngle: 0,
        sweepAngle: Math.PI * 2,
      },
      0xffffff,
    );
    const a = p(-1 / 4096, -1 / 8192),
      b = p(1 / 4096, -1 / 8192);
    add(
      {
        type: 'polyline',
        closed: false,
        vertices: new Float64Array([a.x, a.y, 0, 1 / 16384, 1 / 8192, b.x, b.y, 0, 0, 0]),
      },
      0xff6699,
    );
  }
  const renderer = new WebGlRenderer(gpuCanvas, {
    variable: (name) => (name === 'LWDISPLAY' || name === 'LINESMOOTHING' ? 1 : undefined),
  });
  renderer.setDisplayEntities(entities);
  // Each step moves exactly one eighth CSS pixel; all coordinates stay binary fractions.
  renderer.draw(
    { x: origin.x + pan / scale / 8, y: origin.y - pan / scale / 16 },
    scale,
    goldenWidth,
    goldenHeight,
    0x212830,
  );
  const gl = renderer.device.gl,
    pixels = new Uint8Array(goldenWidth * goldenHeight * 4);
  gl.readPixels(0, 0, goldenWidth, goldenHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const glError = gl.getError();
  const hash = pixels.reduce((value, byte) => Math.imul(value ^ byte, 16777619) >>> 0, 2166136261);
  renderer.dispose();
  return { pixels, hash, glError };
}

function compare(expected: Uint8Array, actual: Uint8Array) {
  let total = 0,
    maximumChannelError = 0,
    differingPixels = 0,
    expectedInk = 0,
    actualInk = 0;
  const expectedMask = new Uint8Array(goldenWidth * goldenHeight),
    actualMask = new Uint8Array(expectedMask.length);
  for (let i = 0; i < expected.length; i += 4) {
    let changed = false,
      expectedDistance = 0,
      actualDistance = 0;
    for (let channel = 0; channel < 3; channel++) {
      const error = Math.abs(expected[i + channel]! - actual[i + channel]!);
      total += error;
      maximumChannelError = Math.max(maximumChannelError, error);
      changed ||= error !== 0;
      expectedDistance = Math.max(
        expectedDistance,
        Math.abs(expected[i + channel]! - background[channel]!),
      );
      actualDistance = Math.max(
        actualDistance,
        Math.abs(actual[i + channel]! - background[channel]!),
      );
    }
    if (changed) differingPixels++;
    if (expectedDistance > 8) {
      expectedMask[i / 4] = 1;
      expectedInk++;
    }
    if (actualDistance > 8) {
      actualMask[i / 4] = 1;
      actualInk++;
    }
  }
  const unmatched = (mask: Uint8Array, other: Uint8Array) => {
    let count = 0;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const x = i % goldenWidth,
        y = Math.floor(i / goldenWidth);
      let found = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (
            x + dx >= 0 &&
            x + dx < goldenWidth &&
            y + dy >= 0 &&
            y + dy < goldenHeight &&
            other[(y + dy) * goldenWidth + x + dx]
          )
            found = true;
      if (!found) count++;
    }
    return count;
  };
  return {
    meanChannelError: total / (goldenWidth * goldenHeight * 3),
    maximumChannelError,
    differingPixels,
    expectedInk,
    actualInk,
    geometryMissing: unmatched(expectedMask, actualMask),
    geometryUnexpected: unmatched(actualMask, expectedMask),
  };
}

/** Extreme-zoom origin/pan comparisons complement ordinary-scale scene hashes. */
export function runPrecisionContracts() {
  const results = [];
  for (const scale of [65536, 262144])
    for (const includeCurves of [false, true]) {
      const originHashes = new Set<number>(),
        translatedHashes = new Set<number>();
      const comparisons = [];
      for (let pan = 0; pan < 5; pan++) {
        const expected = capture({ x: 0, y: 0 }, scale, includeCurves, pan);
        const actual = capture({ x: 200000000, y: 450000000 }, scale, includeCurves, pan);
        const reference = document.querySelector('canvas')!.getContext('2d')!;
        const image = reference.createImageData(goldenWidth, goldenHeight);
        for (let y = 0; y < goldenHeight; y++)
          image.data.set(
            expected.pixels.subarray(y * goldenWidth * 4, (y + 1) * goldenWidth * 4),
            (goldenHeight - 1 - y) * goldenWidth * 4,
          );
        reference.putImageData(image, 0, 0);
        originHashes.add(expected.hash);
        translatedHashes.add(actual.hash);
        comparisons.push({
          panCssPixels: pan / 8,
          expectedHash: expected.hash,
          actualHash: actual.hash,
          glErrors: [expected.glError, actual.glError],
          ...compare(expected.pixels, actual.pixels),
        });
      }
      results.push({
        name: includeCurves ? 'lines-small-circle-tapered-width' : 'exact-binary-lines',
        scale,
        origin: [200000000, 450000000],
        uniqueOriginPanFrames: originHashes.size,
        uniqueTranslatedPanFrames: translatedHashes.size,
        comparisons,
      });
    }
  return results;
}
