import { describe, expect, it } from 'vitest';
import { createTestCanvas } from '../../../legacy-bridge/src/test-canvas';
import { GpuDevice } from './gpu';
import type { MeshData } from './mesh';

function mesh(wide = new Float32Array()): MeshData {
  return {
    origin: { x: 0, y: 0 },
    bounds: { minX: 1, minY: 2, maxX: 7, maxY: 10 },
    entities: 1,
    lines: new Float32Array([1, 2, 0, 10, 0, 4, 6, 5, 10, 0, 4, 6, 5, 10, 0, 7, 10, 10, 10, 0]),
    wide,
    fills: new Float32Array(),
  };
}

describe('retained GPU buffer lifecycle', () => {
  it('retains packed thin data without generating or uploading unused wide geometry', () => {
    const f = createTestCanvas(),
      device = new GpuDevice(f.canvas),
      source = mesh();
    const chunk = device.upload(source);
    expect(chunk.wideSource).toBe(source.lines);
    expect(chunk.wide.count).toBe(0);
    const uploads = f.operations.filter((operation) => operation.name === 'gl:bufferData').length;
    device.draw(chunk, { x: 0, y: 0 }, 1, 800, 600, 1, 0, false);
    device.draw(chunk, { x: 1, y: 0 }, 1, 800, 600, 1, 0, false);
    expect(chunk.wideSource).toBe(source.lines);
    expect(f.operations.filter((operation) => operation.name === 'gl:bufferData')).toHaveLength(
      uploads,
    );
    device.release(chunk);
    expect(chunk.wideSource).toBeUndefined();
    device.dispose();
  });

  it('creates instanced geometry once on a retained DPR 1-to-2 transition and releases the empty buffer', () => {
    const f = createTestCanvas(),
      device = new GpuDevice(f.canvas),
      chunk = device.upload(mesh());
    const oldBuffer = chunk.wide;
    device.draw(chunk, { x: 0, y: 0 }, 1, 800, 600, 1, 0, false);
    f.canvas.width = 1600;
    device.draw(chunk, { x: 0, y: 0 }, 1, 800, 600, 1, 0, false);
    expect(chunk.wideSource).toBeUndefined();
    expect(chunk.wide.count).toBe(2);
    expect(f.operations.find((operation) => operation.name === 'gl:deleteBuffer')?.args[0]).toBe(
      oldBuffer.buffer,
    );
    const generated = f.operations.filter((operation) => operation.name === 'gl:bufferData').at(-1)
      ?.args[1];
    expect(generated).toEqual(
      new Float32Array([1, 2, 4, 6, 0, 10, 0, 5, 4, 6, 7, 10, 5, 10, 0, 10]),
    );
    const uploads = f.operations.filter((operation) => operation.name === 'gl:bufferData').length;
    device.draw(chunk, { x: 2, y: 1 }, 1, 800, 600, 1, 0, false);
    expect(f.operations.filter((operation) => operation.name === 'gl:bufferData')).toHaveLength(
      uploads,
    );
    expect(
      f.operations.some(
        (operation) => operation.name === 'gl:drawArraysInstanced' && operation.args[3] === 2,
      ),
    ).toBe(true);
    device.release(chunk);
    device.dispose();
  });

  it('also creates wide geometry when lineweight display or translucent smoothing first requires it', () => {
    for (const [pass, hasWide] of [
      [0, true],
      [1, false],
    ] as const) {
      const f = createTestCanvas(),
        device = new GpuDevice(f.canvas),
        chunk = device.upload(mesh());
      device.draw(chunk, { x: 0, y: 0 }, 1, 800, 600, 1, pass, hasWide);
      expect(chunk.wide.count).toBe(2);
      expect(chunk.wideSource).toBeUndefined();
      device.release(chunk);
      device.dispose();
    }
  });

  it('keeps existing model-wide buffers and caches uniform locations across frames', () => {
    const f = createTestCanvas(),
      device = new GpuDevice(f.canvas);
    const wide = new Float32Array([1, 2, 4, 6, 0, 5, 0, 5]);
    const chunk = device.upload(mesh(wide));
    expect(chunk.wideSource).toBeUndefined();
    expect(
      f.operations.some(
        (operation) => operation.name === 'gl:bufferData' && operation.args[1] === wide,
      ),
    ).toBe(true);
    const queries = f.operations.filter(
      (operation) => operation.name === 'gl:getUniformLocation',
    ).length;
    device.draw(chunk, { x: 0, y: 0 }, 1, 800, 600, 1, 0, true);
    device.draw(chunk, { x: 1, y: 1 }, 2, 800, 600, 1, 0, true);
    expect(
      f.operations.filter((operation) => operation.name === 'gl:getUniformLocation'),
    ).toHaveLength(queries);
    device.release(chunk);
    device.dispose();
  });
});
