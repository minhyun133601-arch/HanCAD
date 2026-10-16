import type { DisplayEntity } from '../src/display/types';
import { WebGlRenderer } from '../src/webgl/renderer';
import { goldenCanvases } from './pixel-comparison';

const pen = [255, 204, 51, 255];

/** Boundary strokes must survive retained culling, clipping and same-center zoom changes. */
export function runViewportContracts() {
  const results = [];
  for (const test of [
    { name: 'opaque wide stroke center outside viewport', transparency: 0, precise: false },
    { name: 'translucent wide stroke center outside viewport', transparency: 50, precise: false },
    { name: 'precise long line same-center zoom out', transparency: 0, precise: true },
  ]) {
    const { gpuCanvas } = goldenCanvases();
    const entity: DisplayEntity = {
      id: 'boundary',
      layer: '0',
      color: { kind: 'rgb', rgb: 0xffcc33 },
      linetype: 'CONTINUOUS',
      linetypeScale: 1,
      lineweight: 211,
      transparency: test.transparency,
      plinegen: false,
      geometry: {
        type: 'line',
        start: { x: test.precise ? -100000000 : -100, y: test.precise ? 0 : 211 },
        end: { x: test.precise ? 100000000 : 100, y: test.precise ? 0 : 211 },
      },
    };
    const renderer = new WebGlRenderer(gpuCanvas, {
      variable: (name) =>
        name === 'LWDISPLAY' || name === 'TRANSPARENCYDISPLAY'
          ? 1
          : name === 'LINESMOOTHING'
            ? 0
            : undefined,
    });
    renderer.setDisplayEntities([entity]);
    const frames = [];
    for (const scale of test.precise ? [4, 1] : [1, 1]) {
      renderer.draw({ x: 0, y: 0 }, scale, 500, 420, 0x212830);
      const gl = renderer.device.gl,
        actual = new Uint8Array(4);
      // GL row 419 is the top screen edge: WCS y=209.5, inside the 9px-wide stroke at y=211.
      gl.readPixels(
        test.precise ? 10 : 250,
        test.precise ? 210 : 419,
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        actual,
      );
      const expected = test.transparency ? [144, 122, 50, 255] : pen;
      frames.push({
        scale,
        expected,
        actual: [...actual],
        glError: gl.getError(),
        maximumError: Math.max(...expected.map((value, i) => Math.abs(value - actual[i]!))),
      });
    }
    renderer.dispose();
    results.push({ name: test.name, frames });
  }
  return results;
}
