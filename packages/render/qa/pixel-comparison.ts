import type { WebGlRenderer } from '../src/webgl/renderer';

export const goldenWidth = 500;
export const goldenHeight = 420;
export const goldenBackground = 0x212830;

export function goldenCanvases(background = goldenBackground) {
  document.body.replaceChildren();
  document.body.style.cssText = 'display:flex;gap:10px;margin:10px;background:#10151c';
  const canvases = [document.createElement('canvas'), document.createElement('canvas')] as const;
  for (const canvas of canvases) {
    canvas.width = goldenWidth;
    canvas.height = goldenHeight;
    document.body.append(canvas);
  }
  const reference = canvases[0].getContext('2d')!;
  reference.fillStyle = `#${background.toString(16).padStart(6, '0')}`;
  reference.fillRect(0, 0, goldenWidth, goldenHeight);
  return { reference, gpuCanvas: canvases[1] };
}

function missing(mask: Uint8Array, other: Uint8Array): number {
  let result = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % goldenWidth,
      y = Math.floor(i / goldenWidth);
    let matched = false;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (
          x + dx >= 0 &&
          x + dx < goldenWidth &&
          y + dy >= 0 &&
          y + dy < goldenHeight &&
          other[(y + dy) * goldenWidth + x + dx]
        )
          matched = true;
      }
    if (!matched) result++;
  }
  return result;
}

/** Readback metrics compare independent Canvas2D instructions with actual shader output. */
export function compareGolden(
  reference: CanvasRenderingContext2D,
  renderer: WebGlRenderer,
  background = goldenBackground,
) {
  const gl = renderer.device.gl;
  const pixels = new Uint8Array(goldenWidth * goldenHeight * 4);
  gl.readPixels(0, 0, goldenWidth, goldenHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const actual = new Uint8Array(pixels.length);
  for (let y = 0; y < goldenHeight; y++)
    actual.set(
      pixels.subarray(y * goldenWidth * 4, (y + 1) * goldenWidth * 4),
      (goldenHeight - 1 - y) * goldenWidth * 4,
    );
  const expected = reference.getImageData(0, 0, goldenWidth, goldenHeight).data;
  const referenceMask = new Uint8Array(goldenWidth * goldenHeight),
    actualMask = new Uint8Array(referenceMask.length);
  const channels = [(background >> 16) & 255, (background >> 8) & 255, background & 255];
  let error = 0,
    differingPixels = 0,
    referenceInk = 0,
    cachedInk = 0,
    referenceCoverage = 0,
    cachedCoverage = 0;
  for (let i = 0; i < expected.length; i += 4) {
    let maximum = 0,
      referenceDistance = 0,
      actualDistance = 0;
    for (let channel = 0; channel < 3; channel++) {
      const delta = Math.abs(expected[i + channel]! - actual[i + channel]!);
      error += delta;
      maximum = Math.max(maximum, delta);
      referenceDistance = Math.max(
        referenceDistance,
        Math.abs(expected[i + channel]! - channels[channel]!),
      );
      actualDistance = Math.max(
        actualDistance,
        Math.abs(actual[i + channel]! - channels[channel]!),
      );
    }
    if (maximum > 8) differingPixels++;
    referenceCoverage += referenceDistance;
    cachedCoverage += actualDistance;
    if (referenceDistance > 8) {
      referenceInk++;
      referenceMask[i / 4] = 1;
    }
    if (actualDistance > 8) {
      cachedInk++;
      actualMask[i / 4] = 1;
    }
  }
  const glError = gl.getError();
  const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuRenderer = String(gl.getParameter(rendererInfo?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER));
  const gpuHash = actual.reduce(
    (hash, value) => Math.imul(hash ^ value, 16777619) >>> 0,
    2166136261,
  );
  const sample = (x: number, y: number) => [
    ...actual.subarray((y * goldenWidth + x) * 4, (y * goldenWidth + x) * 4 + 4),
  ];
  return {
    meanChannelError: error / (goldenWidth * goldenHeight * 3),
    differingPixels,
    referenceInk,
    cachedInk,
    referenceCoverage,
    cachedCoverage,
    geometryMissing: missing(referenceMask, actualMask),
    geometryUnexpected: missing(actualMask, referenceMask),
    glError,
    gpuRenderer,
    gpuHash,
    sample,
  };
}
