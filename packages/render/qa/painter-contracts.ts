import type { DisplayEntity, DisplayGeometry } from '../src/display/types';
import { WebGlRenderer } from '../src/webgl/renderer';
import { goldenCanvases } from './pixel-comparison';

function entity(
  id: string,
  geometry: DisplayGeometry,
  rgb: number,
  transparency = 50,
): DisplayEntity {
  return {
    id,
    geometry,
    color: { kind: 'rgb', rgb },
    layer: '0',
    linetype: 'CONTINUOUS',
    linetypeScale: 1,
    lineweight: 211,
    transparency,
    plinegen: false,
  };
}
function rectangle(id: string, rgb: number): DisplayEntity {
  const a = { x: 20, y: 20 },
    b = { x: 120, y: 20 },
    c = { x: 120, y: 120 },
    d = { x: 20, y: 120 };
  return entity(
    id,
    {
      type: 'composite',
      parts: [],
      triangles: [
        [a, b, c],
        [a, c, d],
      ],
    },
    rgb,
  );
}

/** Exact interior color checks catch order errors that a silhouette comparison cannot. */
export function runPainterContracts() {
  return [false, true].map((acrossChunks) => {
    const { gpuCanvas, reference } = goldenCanvases();
    const entries = [rectangle('blue-back', 0x3366ff)];
    if (acrossChunks)
      for (let i = 0; i < 4095; i++)
        entries.push(entity(`empty-${i}`, { type: 'composite', parts: [], triangles: [] }, 0, 0));
    entries.push(
      entity(
        'red-middle',
        { type: 'line', start: { x: 20, y: 70 }, end: { x: 120, y: 70 } },
        0xff3333,
      ),
      rectangle('green-front', 0x33ff66),
    );
    const renderer = new WebGlRenderer(gpuCanvas, {
      variable: (name) =>
        name === 'LWDISPLAY' || name === 'TRANSPARENCYDISPLAY'
          ? 1
          : name === 'LINESMOOTHING'
            ? 0
            : undefined,
    });
    renderer.setDisplayEntities(entries);
    renderer.draw({ x: 250 / 3, y: 70 }, 3, 500, 420, 0x212830);
    const gl = renderer.device.gl,
      actual = new Uint8Array(4);
    gl.readPixels(210, 210, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, actual);
    reference.globalAlpha = 0.5;
    for (const color of ['#3366ff', '#ff3333', '#33ff66']) {
      reference.fillStyle = color;
      reference.fillRect(0, 0, 10, 10);
    }
    const expected = [...reference.getImageData(5, 5, 1, 1).data];
    const result = {
      name: acrossChunks
        ? 'transparent mixed primitives across chunks'
        : 'transparent mixed primitives in one chunk',
      expected,
      actual: [...actual],
      maximumError: Math.max(...expected.map((value, i) => Math.abs(value - actual[i]!))),
      glError: gl.getError(),
    };
    renderer.dispose();
    return result;
  });
}
