import { textWorldPoint } from '../display/text';
import type { DisplayText, Vec2 } from '../display/types';

export interface GlyphQuad {
  page: number;
  slot: number;
  /** Bottom-left, bottom-right, top-right, top-left in WCS. */
  corners: readonly [Vec2, Vec2, Vec2, Vec2];
  /** u0, top v, u1, bottom v; canvas rows upload without UNPACK_FLIP_Y. */
  uv: readonly [number, number, number, number];
}
export interface GlyphAtlasOptions {
  pageSize?: number;
  fontSize?: number;
  fontFamily?: string;
  /** Injectable for deterministic unit tests and non-DOM hosts. */
  createCanvas?: () => HTMLCanvasElement;
}
interface Glyph {
  page: number;
  advance: number;
  left: number;
  right: number;
  ascent: number;
  descent: number;
  uv: readonly [number, number, number, number];
}
interface AtlasPage {
  texture: WebGLTexture;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  x: number;
  y: number;
  rowHeight: number;
  dirty: boolean;
}
const padding = 2;

/** Raster glyphs are cached once, then every model-space label is drawn on the GPU. */
export class GlyphAtlas {
  private readonly atlasPages: AtlasPage[] = [];
  private readonly glyphs = new Map<string, Glyph>();
  private readonly size: number;
  private readonly em: number;
  private readonly fontFamily: string;
  private readonly canvasFactory: () => HTMLCanvasElement;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    options: GlyphAtlasOptions = {},
  ) {
    this.size = Math.min(options.pageSize ?? 2048, Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)));
    this.em = options.fontSize ?? 64;
    if (!(this.size >= 128) || !(this.em > 0) || this.em + padding * 2 >= this.size)
      throw new Error('Invalid glyph atlas dimensions.');
    this.fontFamily = options.fontFamily ?? 'Arial, "Malgun Gothic", sans-serif';
    this.canvasFactory = options.createCanvas ?? (() => document.createElement('canvas'));
  }

  get pages(): readonly WebGLTexture[] {
    return this.atlasPages.map((page) => page.texture);
  }

  layout(text: DisplayText, slot: number, pixelsPerUnit?: number): GlyphQuad[] {
    const result: GlyphQuad[] = [];
    const lines = text.text.split(/\r?\n/);
    // Keep half-pixel labels such as 7.5 px rather than rounding them up to 8.
    const em =
      pixelsPerUnit !== undefined && Number.isFinite(pixelsPerUnit) && pixelsPerUnit > 0
        ? Math.max(4, Math.min(256, Math.round(text.height * pixelsPerUnit * 2) / 2))
        : this.em;
    const lineGlyphs = lines.map((line) => [...line].map((character) => this.glyph(character, em)));
    const widths = lineGlyphs.map((glyphs) =>
      glyphs.reduce((sum, glyph) => sum + glyph.advance, 0),
    );
    const maxWidth = Math.max(0, ...widths);
    const horizontal =
      text.width !== undefined && maxWidth > 0 ? text.width / maxWidth : text.height / em;
    const vertical = text.height / em;
    lineGlyphs.forEach((glyphs, line) => {
      let x = text.align === 'center' ? (-(widths[line] ?? 0) * horizontal) / 2 : 0;
      const baseline = -line * text.height * 1.25;
      for (const glyph of glyphs) {
        if (glyph.page >= 0) {
          const left = x - glyph.left * horizontal;
          const right = x + glyph.right * horizontal;
          const bottom = baseline - glyph.descent * vertical;
          const top = baseline + glyph.ascent * vertical;
          result.push({
            page: glyph.page,
            slot,
            uv: glyph.uv,
            corners: [
              textWorldPoint(text, left, bottom),
              textWorldPoint(text, right, bottom),
              textWorldPoint(text, right, top),
              textWorldPoint(text, left, top),
            ],
          });
        }
        x += glyph.advance * horizontal;
      }
    });
    return result;
  }

  flush(): void {
    const gl = this.gl;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    for (const page of this.atlasPages) {
      if (!page.dirty) continue;
      gl.bindTexture(gl.TEXTURE_2D, page.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, page.canvas);
      page.dirty = false;
    }
  }

  dispose(): void {
    for (const page of this.atlasPages) this.gl.deleteTexture(page.texture);
    this.atlasPages.length = 0;
    this.glyphs.clear();
  }

  private glyph(character: string, em: number): Glyph {
    const key = `${em}:${character}`;
    const cached = this.glyphs.get(key);
    if (cached) return cached;
    let page = this.atlasPages.at(-1) ?? this.addPage();
    const font = `${em}px ${this.fontFamily}`;
    page.context.font = font;
    const metrics = page.context.measureText(character);
    const left = Math.ceil(metrics.actualBoundingBoxLeft ?? 0);
    const right = Math.ceil(metrics.actualBoundingBoxRight ?? metrics.width);
    const ascent = Math.ceil(metrics.actualBoundingBoxAscent ?? em);
    const descent = Math.ceil(metrics.actualBoundingBoxDescent ?? em * 0.25);
    const width = Math.max(0, left + right),
      height = Math.max(0, ascent + descent);
    if (!width || !height || /^\s$/u.test(character)) {
      const glyph: Glyph = {
        page: -1,
        advance: metrics.width,
        left,
        right,
        ascent,
        descent,
        uv: [0, 0, 0, 0],
      };
      this.glyphs.set(key, glyph);
      return glyph;
    }
    const cellWidth = width + padding * 2,
      cellHeight = height + padding * 2;
    if (cellWidth > this.size || cellHeight > this.size)
      throw new Error('Glyph exceeds atlas page size.');
    if (page.x + cellWidth > this.size) {
      page.x = 0;
      page.y += page.rowHeight;
      page.rowHeight = 0;
    }
    if (page.y + cellHeight > this.size) page = this.addPage();
    const x = page.x + padding,
      y = page.y + padding;
    page.context.font = font;
    page.context.fillText(character, x + left, y + ascent);
    page.dirty = true;
    page.x += cellWidth;
    page.rowHeight = Math.max(page.rowHeight, cellHeight);
    const glyph: Glyph = {
      page: this.atlasPages.length - 1,
      advance: metrics.width,
      left,
      right,
      ascent,
      descent,
      uv: [x / this.size, y / this.size, (x + width) / this.size, (y + height) / this.size],
    };
    this.glyphs.set(key, glyph);
    return glyph;
  }

  private addPage(): AtlasPage {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error('Unable to allocate glyph texture.');
    const canvas = this.canvasFactory();
    canvas.width = canvas.height = this.size;
    const context = canvas.getContext('2d');
    if (!context) {
      gl.deleteTexture(texture);
      throw new Error('Unable to rasterize font glyphs.');
    }
    context.font = `${this.em}px ${this.fontFamily}`;
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    context.fillStyle = '#ffffff';
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const page: AtlasPage = { texture, canvas, context, x: 0, y: 0, rowHeight: 0, dirty: true };
    this.atlasPages.push(page);
    return page;
  }
}
