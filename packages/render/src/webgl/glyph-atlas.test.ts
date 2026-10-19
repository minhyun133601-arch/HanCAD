import { describe, expect, it, vi } from 'vitest';
import { GlyphAtlas } from './glyph-atlas';
import type { DisplayText } from '../display/types';

function fixture() {
  let texture = 0;
  const fillText = vi.fn();
  const context = {
    font: '',
    measureText(text: string) {
      const em = Number.parseFloat(this.font) || 64;
      return {
        width: (text.length * em) / 2,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: text === ' ' ? 0 : em / 2,
        actualBoundingBoxAscent: em * 0.75,
        actualBoundingBoxDescent: em * 0.1875,
      };
    },
    fillText,
  };
  const createCanvas = () =>
    ({ width: 0, height: 0, getContext: () => context }) as unknown as HTMLCanvasElement;
  const upload = vi.fn(),
    dispose = vi.fn();
  const gl = {
    MAX_TEXTURE_SIZE: 1,
    TEXTURE_2D: 2,
    RGBA: 3,
    UNSIGNED_BYTE: 4,
    TEXTURE_MIN_FILTER: 5,
    TEXTURE_MAG_FILTER: 6,
    LINEAR: 7,
    TEXTURE_WRAP_S: 8,
    TEXTURE_WRAP_T: 9,
    CLAMP_TO_EDGE: 10,
    UNPACK_FLIP_Y_WEBGL: 11,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 12,
    getParameter: () => 2048,
    createTexture: () => ({ id: ++texture }),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    pixelStorei: vi.fn(),
    texImage2D: upload,
    deleteTexture: dispose,
  } as unknown as WebGL2RenderingContext;
  return { gl, createCanvas, upload, dispose, fillText, context };
}
const label: DisplayText = {
  type: 'text',
  position: { x: 200000000, y: 450000000 },
  height: 10,
  rotation: 0,
  align: 'left',
  text: '한글 A',
};

describe('GPU glyph atlas layout', () => {
  it('mirrors glyph quad positions and winding while retaining their original texture coordinates', () => {
    const f = fixture(),
      atlas = new GlyphAtlas(f.gl, { createCanvas: f.createCanvas }),
      source = { ...label, position: { x: 20, y: 30 }, rotation: 0 },
      normal = atlas.layout(source, 0),
      mirrored = atlas.layout({ ...source, mirroredX: true }, 0);
    expect(mirrored).toHaveLength(normal.length);
    normal.forEach((glyph, i) => {
      expect(mirrored[i]!.uv).toEqual(glyph.uv);
      glyph.corners.forEach((point, j) => {
        expect(mirrored[i]!.corners[j]!.x).toBeCloseTo(40 - point.x, 10);
        expect(mirrored[i]!.corners[j]!.y).toBe(point.y);
      });
    });
    expect(mirrored[0]!.corners[1].x).toBeLessThan(mirrored[0]!.corners[0].x);
  });
  it('rasterizes at the projected font size and caches separately by size without changing text advances', () => {
    const f = fixture(),
      atlas = new GlyphAtlas(f.gl, { createCanvas: f.createCanvas });
    const text = { ...label, height: 5, text: '한글, A-1' };
    const atThree = atlas.layout(text, 0, 3);
    expect(f.context.font).toMatch(/^15px /);
    expect(atThree[1]!.corners[0].x - atThree[0]!.corners[0].x).toBeCloseTo(2.5);
    const calls = f.fillText.mock.calls.length;
    atlas.layout(text, 1, 3);
    expect(f.fillText).toHaveBeenCalledTimes(calls);
    atlas.layout(text, 1, 6);
    expect(f.context.font).toMatch(/^30px /);
    expect(f.fillText).toHaveBeenCalledTimes(calls * 2);
    atlas.layout({ ...text, height: 2.5 }, 0, 3);
    expect(f.context.font).toMatch(/^7.5px /);
  });
  it('caches Korean and Latin raster glyphs and uploads only dirty pages', () => {
    const f = fixture(),
      atlas = new GlyphAtlas(f.gl, { createCanvas: f.createCanvas });
    const first = atlas.layout(label, 4);
    expect(first).toHaveLength(3);
    expect(first[0]).toMatchObject({ page: 0, slot: 4 });
    expect(first[0]?.corners[0].x).toBe(200000000);
    expect(first[0]?.corners[2].y).toBe(450000007.5);
    atlas.flush();
    atlas.layout(label, 8);
    atlas.flush();
    expect(f.fillText).toHaveBeenCalledTimes(3);
    expect(f.upload).toHaveBeenCalledTimes(1);
    atlas.dispose();
    expect(f.dispose).toHaveBeenCalledTimes(1);
  });
  it('fits explicit world widths, centered multiline labels and rotations', () => {
    const f = fixture(),
      atlas = new GlyphAtlas(f.gl, { createCanvas: f.createCanvas });
    const quads = atlas.layout(
      {
        ...label,
        position: { x: 0, y: 0 },
        text: 'AA\nA',
        width: 40,
        align: 'center',
        rotation: Math.PI / 2,
      },
      0,
    );
    expect(quads[0]?.corners[0].y).toBeCloseTo(-20);
    expect(quads[1]?.corners[1].y).toBeCloseTo(20);
    expect(quads[2]?.corners[0].x).toBeCloseTo(14.375);
    expect(f.fillText).toHaveBeenCalledTimes(1);
  });
  it('grows to additional pages without changing earlier glyph UVs or pages', () => {
    const f = fixture(),
      atlas = new GlyphAtlas(f.gl, { createCanvas: f.createCanvas, pageSize: 128 });
    const first = atlas.layout({ ...label, text: 'A' }, 0)[0];
    atlas.layout({ ...label, text: 'BCDEFGHIJKLMNOPQRST' }, 0);
    expect(atlas.pages.length).toBeGreaterThan(1);
    expect(atlas.layout({ ...label, text: 'A' }, 0)[0]).toEqual(first);
    atlas.flush();
    expect(f.upload).toHaveBeenCalledTimes(atlas.pages.length);
  });
});
