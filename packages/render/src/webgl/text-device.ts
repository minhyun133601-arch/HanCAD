import type { DisplayText, Vec2 } from '../display/types';
import { GlyphAtlas } from './glyph-atlas';
import { createProgram } from './shaders';

const vertex = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPosition;
layout(location=1) in vec2 aUv;
layout(location=2) in float aSlot;
uniform sampler2D uStyles;
uniform vec2 uViewport;
uniform vec2 uOrigin;
uniform float uScale;
uniform float uCount;
out vec2 vUv;
out vec4 vColor;
void main(){
  int i=int(aSlot)*2;
  vColor=texelFetch(uStyles,ivec2(i%1024,i/1024),0);
  vUv=aUv;
  gl_Position=vec4((aPosition+uOrigin)*uScale*2./uViewport,1.-2.*(aSlot+1.)/(uCount+1.),1.);
}`;
const fragment = `#version 300 es
precision highp float;
uniform sampler2D uGlyphs;
uniform int uPass;
in vec2 vUv;
in vec4 vColor;
out vec4 color;
void main(){
  if(vColor.a<=0. || (uPass==0&&vColor.a<.999) || (uPass==1&&vColor.a>=.999)) discard;
  float alpha=texture(uGlyphs,vUv).a;
  if(alpha<.01)discard;
  color=vec4(vColor.rgb,vColor.a*alpha);
}`;
export interface TextBuffers {
  page: number;
  buffer: WebGLBuffer;
  vao: WebGLVertexArrayObject;
  count: number;
}
export class TextDevice {
  private readonly atlas: GlyphAtlas;
  private readonly program: WebGLProgram;
  constructor(
    private readonly gl: WebGL2RenderingContext,
    canvas: HTMLCanvasElement,
  ) {
    this.atlas = new GlyphAtlas(gl, {
      createCanvas: () => canvas.ownerDocument.createElement('canvas'),
    });
    this.program = createProgram(gl, vertex, fragment);
  }
  upload(
    texts: readonly { text: DisplayText; slot: number }[],
    origin: Vec2,
    pixelsPerUnit?: number,
  ): TextBuffers[] {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE2);
    const groups = new Map<number, number[]>();
    for (const { text, slot } of texts)
      for (const quad of this.atlas.layout(text, slot, pixelsPerUnit)) {
        const values = groups.get(quad.page) ?? [];
        groups.set(quad.page, values);
        const [u0, vTop, u1, vBottom] = quad.uv;
        const uv = [
          [u0, vBottom],
          [u1, vBottom],
          [u1, vTop],
          [u0, vTop],
        ];
        for (const index of [0, 1, 2, 0, 2, 3]) {
          const p = quad.corners[index]!,
            t = uv[index]!;
          values.push(p.x - origin.x, p.y - origin.y, t[0]!, t[1]!, slot);
        }
      }
    this.atlas.flush();
    return [...groups].map(([page, values]) => {
      const vao = gl.createVertexArray(),
        buffer = gl.createBuffer();
      if (!vao || !buffer) throw new Error('Unable to allocate text geometry.');
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
      for (let i = 0; i < 3; i++) {
        gl.enableVertexAttribArray(i);
        gl.vertexAttribPointer(i, i === 2 ? 1 : 2, gl.FLOAT, false, 20, i === 2 ? 16 : i * 8);
      }
      return { page, vao, buffer, count: values.length / 5 };
    });
  }
  draw(
    buffers: readonly TextBuffers[],
    origin: Vec2,
    eye: Vec2,
    scale: number,
    width: number,
    height: number,
    count: number,
    pass: number,
  ) {
    if (!buffers.length) return 0;
    const gl = this.gl;
    gl.useProgram(this.program);
    const u = (name: string) => gl.getUniformLocation(this.program, name);
    gl.uniform1i(u('uStyles'), 0);
    gl.uniform1i(u('uGlyphs'), 2);
    gl.uniform1i(u('uPass'), pass);
    gl.uniform2f(u('uViewport'), width, height);
    gl.uniform2f(u('uOrigin'), origin.x - eye.x, origin.y - eye.y);
    gl.uniform1f(u('uScale'), scale);
    gl.uniform1f(u('uCount'), count);
    gl.activeTexture(gl.TEXTURE2);
    for (const part of buffers) {
      gl.bindTexture(gl.TEXTURE_2D, this.atlas.pages[part.page]!);
      gl.bindVertexArray(part.vao);
      gl.drawArrays(gl.TRIANGLES, 0, part.count);
    }
    return buffers.length;
  }
  release(buffers: readonly TextBuffers[]) {
    for (const part of buffers) {
      this.gl.deleteBuffer(part.buffer);
      this.gl.deleteVertexArray(part.vao);
    }
  }
  dispose() {
    this.atlas.dispose();
    this.gl.deleteProgram(this.program);
  }
}
