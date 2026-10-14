import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyCadState,
  drawingBounds,
  drawingToDxf,
  drawingToSvg,
  normalizeCadState,
  readCadFile,
  readableCadColor,
} from './index';
import { createTestRuntime, fixtureDxf } from './test-runtime';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

describe('typed offline CAD bridge', () => {
  it('opens real DXF geometry, retains immutable source bytes and reports opaque omissions', async () => {
    const source = new File([fixtureDxf()], '한글 검사.dxf');
    const progress: string[] = [];
    const result = await readCadFile(source, { onProgress: (message) => progress.push(message) });
    expect(result.state.name).toBe('한글 검사.dxf');
    expect(result.state.entities).toHaveLength(3);
    expect(result.state.entities[0]).toMatchObject({
      type: 'line',
      a: { x: 0, y: -0 },
      b: { x: 100, y: -50 },
    });
    expect(result.report).toMatchObject({
      imported: 3,
      skipped: 1,
      unsupported: [{ type: 'ACAD_PROXY_ENTITY', count: 1 }],
    });
    expect(new TextDecoder().decode(result.source.bytes)).toBe(fixtureDxf());
    expect(result.source.file).toBe(source);
    expect(progress.length).toBeGreaterThan(0);
    expect(drawingToSvg(result.state)).toContain('한글 검사 도면');
    expect(drawingToDxf(result.state)).toContain('ENTITIES');
    expect(drawingBounds(result.state).maxX).toBeGreaterThanOrEqual(100);
    expect(JSON.stringify(normalizeCadState(JSON.parse(JSON.stringify(result.state))))).toBe(
      JSON.stringify(result.state),
    );
  });

  it('rejects malformed files/cancelled imports without mutating an existing drawing', async () => {
    const existing = (await readCadFile(new File([fixtureDxf()], 'existing.dxf'))).state;
    const before = JSON.stringify(existing);
    await expect(readCadFile(new File(['broken'], 'bad.dxf'))).rejects.toThrow();
    await expect(readCadFile(new File(['AC9999junk'], 'bad.dwg'))).rejects.toThrow('서명');
    await expect(readCadFile(new File(['not cad'], 'bad.pdf'))).rejects.toThrow('DWG 또는 DXF');
    const controller = new AbortController();
    controller.abort();
    await expect(
      readCadFile(new File([fixtureDxf()], 'cancel.dxf'), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    const parsedCancel = new AbortController();
    await expect(
      readCadFile(new File([fixtureDxf()], 'parsed-cancel.dxf'), {
        signal: parsedCancel.signal,
        onProgress: (message) => {
          if (message.startsWith('원본 객체')) parsedCancel.abort();
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(JSON.stringify(existing)).toBe(before);
    expect(() => normalizeCadState({ entities: [{ type: 'unsupported' }] })).toThrow('객체 검증');
    expect(createEmptyCadState('Drawing2.dwg').name).toBe('Drawing2.dwg');
  });

  it('exports readable bounded SVG viewports and screen pens without changing survey geometry or Korean text', () => {
    const state = normalizeCadState({
      name: '한글 <검사>',
      entities: [
        {
          type: 'line',
          a: { x: 0, y: 0 },
          b: { x: 3680000, y: 50 },
          color: '#ffffff',
          lineWidth: 100,
        },
        {
          type: 'polyline',
          points: [
            { x: 10, y: 10 },
            { x: 20, y: 30 },
          ],
          color: '#ffffff',
          lineWidth: 0.1,
        },
        { type: 'circle', center: { x: 50, y: 25 }, radius: 10 },
        {
          type: 'arc',
          center: { x: 50, y: 25 },
          radius: 10,
          startAngle: 0,
          endAngle: Math.PI / 2,
          clockwise: true,
        },
        {
          type: 'text',
          point: { x: 20, y: 30 },
          text: '한글 <script>검사</script>',
          textSize: 3.5,
        },
      ],
    });
    const before = JSON.stringify(state);
    const svg = drawingToSvg(state);
    const opening = /<svg\b[^>]+>/.exec(svg)?.[0] ?? '';
    expect(Number(/\bwidth="(\d+)"/.exec(opening)?.[1])).toBe(2400);
    const height = Number(/\bheight="(\d+)"/.exec(opening)?.[1]);
    expect(height).toBeGreaterThanOrEqual(128);
    expect(height).toBeLessThanOrEqual(2400);
    const viewBox = /viewBox="([^"]+)"/.exec(opening)?.[1]?.split(' ').map(Number) ?? [];
    expect(viewBox[2]).toBeGreaterThan(3680000);
    const shapes = svg.match(/<(?:line|polyline|polygon|path|circle)\b[^>]*>/g) ?? [];
    expect(shapes).toHaveLength(4);
    for (const shape of shapes) expect(shape).toContain('vector-effect="non-scaling-stroke"');
    expect(svg).toContain('x2="3680000"');
    expect(svg).toContain('r="10"');
    expect(svg).toContain('stroke-width="6"');
    expect(svg).toContain('stroke-width="1"');
    expect(svg).toContain('stroke="#000000"');
    expect(svg).toContain('한글 &lt;script&gt;검사&lt;/script&gt;');
    expect(svg).not.toMatch(/<(?:script|image)\b|\shref=/);
    expect(JSON.stringify(state)).toBe(before);
    expect(readableCadColor('#FFFFFF')).toBe('#000000');
    expect(readableCadColor('#123456')).toBe('#123456');
  });
});
