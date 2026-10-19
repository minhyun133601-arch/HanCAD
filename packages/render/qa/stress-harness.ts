import { WebGlRenderer } from '../src/webgl/renderer';

function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    median: sorted[Math.floor(sorted.length * 0.5)]!,
    p95: sorted[Math.floor(sorted.length * 0.95)]!,
    max: sorted.at(-1)!,
  };
}
export async function benchmark(count = 1000000, frames = 300) {
  document.body.replaceChildren();
  document.body.style.margin = '0';
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  document.body.append(canvas);
  const renderer = new WebGlRenderer(canvas);
  const gl = renderer.device.gl,
    debug = gl.getExtension('WEBGL_debug_renderer_info');
  const hardware = debug
    ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);
  const initial = performance.now();
  renderer.setStress(count);
  const bounds = renderer.getStressBounds()!;
  const scale = Math.min(1920 / bounds.maxX, 1080 / bounds.maxY) * 0.86;
  renderer.draw({ x: bounds.maxX / 2, y: bounds.maxY / 2 }, scale, 1920, 1080, 0x212830);
  gl.finish();
  const loadMs = performance.now() - initial;
  const results: Record<string, unknown> = {
    count,
    frames,
    viewport: [1920, 1080],
    hardware,
    loadMs,
  };
  const idle: number[] = [];
  let idleLast: number | undefined;
  for (let i = 0; i < 31; i++) {
    const now = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
    if (idleLast !== undefined) idle.push(now - idleLast);
    idleLast = now;
  }
  results.idleFrameMs = summary(idle);
  for (const mode of ['pan', 'zoom'] as const) {
    const elapsed: number[] = [],
      intervals: number[] = [],
      rebuilt: number[] = [],
      pending: number[] = [];
    let previous: number | undefined;
    for (let i = 0; i < frames + 15; i++) {
      const now = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
      const began = performance.now();
      const phase = (i / frames) * Math.PI * 2;
      const eye = {
        x: bounds.maxX / 2 + (mode === 'pan' ? Math.sin(phase) * bounds.maxX * 0.015 : 0),
        y: bounds.maxY / 2,
      };
      const zoom = mode === 'zoom' ? scale * 2 ** (0.8 * Math.sin(phase)) : scale;
      const stats = renderer.draw(eye, zoom, 1920, 1080, 0x212830);
      if (i >= 15) {
        elapsed.push(performance.now() - began);
        rebuilt.push(stats.rebuilt);
        pending.push(stats.pending);
        if (previous !== undefined) intervals.push(now - previous);
      }
      previous = now;
    }
    gl.finish();
    results[mode] = {
      submitMs: summary(elapsed),
      frameMs: summary(intervals),
      fps: 1000 / summary(intervals).mean,
      rebuilt: rebuilt.reduce((a, b) => a + b, 0),
      rebuiltPerFrame: summary(rebuilt),
      pendingPerFrame: summary(pending),
      finalPending: pending.at(-1),
    };
  }
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let inkPixels = 0;
  for (let i = 0; i < pixels.length; i += 4)
    if (pixels[i] !== 33 || pixels[i + 1] !== 40 || pixels[i + 2] !== 48) inkPixels++;
  results.inkPixels = inkPixels;
  results.glError = gl.getError();
  renderer.dispose();
  return results;
}
