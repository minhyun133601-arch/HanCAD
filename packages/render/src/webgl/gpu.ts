import type { Bounds2, Vec2 } from '../display/types';
import type { MeshData } from './mesh';
import { createProgram, lineVertex, lineFragment, wideVertex } from './shaders';
import { PresentationDevice } from './presentation';

interface GeometryBuffer {
  buffer: WebGLBuffer;
  vao: WebGLVertexArrayObject;
  count: number;
}
const emptyGeometry = new Float32Array();
const uniformNames = [
  'uStyles',
  'uPatterns',
  'uViewport',
  'uOrigin',
  'uScale',
  'uCount',
  'uPass',
  'uWide',
  'uFill',
  'uSmooth',
  'uForceWide',
  'uRatio',
] as const;
type ProgramUniforms = Record<(typeof uniformNames)[number], WebGLUniformLocation | null>;
export interface GpuChunk {
  origin: Vec2;
  bounds: Bounds2;
  entities: number;
  lines: GeometryBuffer;
  wide: GeometryBuffer;
  fills: GeometryBuffer;
  points: GeometryBuffer;
  /** Retained only when packed thin lines have not needed an instanced-wide representation. */
  wideSource?: Float32Array;
  viewDependent?: boolean;
}
/** Owns GL resources only. Geometry/model/database remain independent of the GPU. */
export class GpuDevice {
  readonly gl: WebGL2RenderingContext;
  private readonly thin: WebGLProgram;
  private readonly wideProgram: WebGLProgram;
  private readonly styles: WebGLTexture;
  private readonly patterns: WebGLTexture;
  private readonly presentation: PresentationDevice;
  private readonly uniforms = new Map<WebGLProgram, ProgramUniforms>();
  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      stencil: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.thin = createProgram(gl, lineVertex, lineFragment);
    this.wideProgram = createProgram(gl, wideVertex, lineFragment);
    for (const program of [this.thin, this.wideProgram])
      this.uniforms.set(
        program,
        Object.fromEntries(
          uniformNames.map((name) => [name, gl.getUniformLocation(program, name)]),
        ) as ProgramUniforms,
      );
    this.styles = this.texture();
    this.patterns = this.texture();
    this.presentation = new PresentationDevice(gl);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
  }
  private texture() {
    const gl = this.gl,
      texture = gl.createTexture();
    if (!texture) throw new Error('Unable to allocate a WebGL texture.');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }
  uploadStyles(data: Float32Array) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.styles);
    const height = Math.max(1, Math.ceil(data.length / 4096));
    const padded = new Float32Array(height * 4096);
    padded.set(data);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1024, height, 0, gl.RGBA, gl.FLOAT, padded);
  }
  updateStyle(slot: number, data: Float32Array): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.styles);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      (slot * 2) % 1024,
      Math.floor(slot / 512),
      2,
      1,
      gl.RGBA,
      gl.FLOAT,
      data,
    );
  }
  uploadPatterns(data: Float32Array, height: number) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.patterns);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 13, height, 0, gl.RED, gl.FLOAT, data);
  }
  upload(mesh: MeshData, previous?: GpuChunk): GpuChunk {
    return {
      ...mesh,
      ...(!mesh.wide.length && mesh.lines.length ? { wideSource: mesh.lines } : {}),
      lines: this.geometry(mesh.lines, false, previous?.lines),
      wide: this.geometry(mesh.wide, true, previous?.wide),
      fills: this.geometry(mesh.fills, false, previous?.fills),
      points: this.geometry(mesh.points ?? emptyGeometry, false, previous?.points),
    };
  }
  private prepareWide(chunk: GpuChunk): void {
    const source = chunk.wideSource;
    if (!source) return;
    const wide = new Float32Array((source.length / 10) * 8);
    for (let i = 0, j = 0; i < source.length; i += 10, j += 8) {
      wide[j] = source[i]!;
      wide[j + 1] = source[i + 1]!;
      wide[j + 2] = source[i + 5]!;
      wide[j + 3] = source[i + 6]!;
      wide[j + 4] = source[i + 2]!;
      wide[j + 5] = source[i + 3]!;
      wide[j + 6] = source[i + 4]!;
      wide[j + 7] = source[i + 7]!;
    }
    const previous = chunk.wide;
    chunk.wide = this.geometry(wide, true);
    this.gl.deleteBuffer(previous.buffer);
    this.gl.deleteVertexArray(previous.vao);
    delete chunk.wideSource;
  }
  private geometry(data: Float32Array, wide: boolean, previous?: GeometryBuffer): GeometryBuffer {
    if (previous) {
      if (data.length || previous.count) {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, previous.buffer);
        // Re-specification orphans in-flight storage while retaining the VAO and buffer identity.
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      }
      return { ...previous, count: data.length / (wide ? 8 : 5) };
    }
    const gl = this.gl,
      buffer = gl.createBuffer(),
      vao = gl.createVertexArray();
    if (!buffer || !vao) throw new Error('Unable to allocate WebGL geometry.');
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(0, wide ? 4 : 2, gl.FLOAT, false, wide ? 32 : 20, 0);
    gl.vertexAttribPointer(1, wide ? 4 : 3, gl.FLOAT, false, wide ? 32 : 20, wide ? 16 : 8);
    if (wide) {
      gl.vertexAttribDivisor(0, 1);
      gl.vertexAttribDivisor(1, 1);
    }
    gl.bindVertexArray(null);
    return { buffer, vao, count: data.length / (wide ? 8 : 5) };
  }
  begin(background: number) {
    const gl = this.gl;
    this.presentation.begin(this.canvas.width, this.canvas.height);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.depthMask(true);
    gl.clearColor(
      ((background >> 16) & 255) / 255,
      ((background >> 8) & 255) / 255,
      (background & 255) / 255,
      1,
    );
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.styles);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.patterns);
  }
  draw(
    chunk: GpuChunk,
    eye: Vec2,
    scale: number,
    width: number,
    height: number,
    count: number,
    pass: number,
    hasWide = true,
    smooth = 1,
  ): number {
    const gl = this.gl;
    let calls = 0;
    const forceWide = this.canvas.width / width > 1 || (pass === 1 && smooth === 1);
    if (hasWide || forceWide) this.prepareWide(chunk);
    gl.depthMask(pass === 0);
    for (const [program, buffer, isWide, isFill] of [
      [this.thin, chunk.lines, false, false],
      [this.wideProgram, chunk.wide, true, false],
      [this.thin, chunk.fills, false, true],
      [this.thin, chunk.points, false, true],
    ] as const) {
      if (!buffer.count || (isWide && !hasWide && !forceWide) || (!isWide && !isFill && forceWide))
        continue;
      gl.useProgram(program);
      const u = this.uniforms.get(program)!;
      gl.uniform1i(u.uStyles, 0);
      gl.uniform1i(u.uPatterns, 1);
      gl.uniform2f(u.uViewport, width, height);
      gl.uniform2f(u.uOrigin, chunk.origin.x - eye.x, chunk.origin.y - eye.y);
      gl.uniform1f(u.uScale, scale);
      gl.uniform1f(u.uCount, count);
      gl.uniform1i(u.uPass, pass);
      gl.uniform1i(u.uWide, isWide ? 1 : 0);
      gl.uniform1i(u.uFill, isFill ? 1 : 0);
      gl.uniform1i(u.uSmooth, smooth);
      gl.uniform1i(u.uForceWide, forceWide ? 1 : 0);
      gl.uniform1f(u.uRatio, this.canvas.width / width);
      gl.bindVertexArray(buffer.vao);
      if (isWide) gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, buffer.count);
      else
        gl.drawArrays(
          buffer === chunk.points ? gl.POINTS : isFill ? gl.TRIANGLES : gl.LINES,
          0,
          buffer.count,
        );
      calls++;
    }
    return calls;
  }
  release(chunk: GpuChunk) {
    delete chunk.wideSource;
    for (const buffer of [chunk.lines, chunk.wide, chunk.fills, chunk.points]) {
      this.gl.deleteBuffer(buffer.buffer);
      this.gl.deleteVertexArray(buffer.vao);
    }
  }
  present(smoothing: number) {
    this.presentation.present(smoothing);
  }
  dispose() {
    this.presentation.dispose();
    this.gl.deleteTexture(this.styles);
    this.gl.deleteTexture(this.patterns);
    this.gl.deleteProgram(this.thin);
    this.gl.deleteProgram(this.wideProgram);
    this.uniforms.clear();
  }
}
