import { createProgram } from './shaders';

const vertex = `#version 300 es
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
const fragment = `#version 300 es
precision highp float;
uniform sampler2D image;
uniform vec2 pixel;
uniform int smoothing;
in vec2 uv;
out vec4 color;
float brightness(vec3 rgb){return dot(rgb,vec3(.299,.587,.114));}
void main(){
  vec3 c=texture(image,uv).rgb;
  if(smoothing==0){color=vec4(c,1.);return;}
  vec3 nw=texture(image,uv+pixel*vec2(-1.,1.)).rgb,ne=texture(image,uv+pixel*vec2(1.,1.)).rgb;
  vec3 sw=texture(image,uv+pixel*vec2(-1.,-1.)).rgb,se=texture(image,uv+pixel*vec2(1.,-1.)).rgb;
  float a=brightness(nw),b=brightness(ne),d=brightness(sw),e=brightness(se),middle=brightness(c);
  float minimum=min(middle,min(min(a,b),min(d,e))),maximum=max(middle,max(max(a,b),max(d,e)));
  if(maximum-minimum<.035){color=vec4(c,1.);return;}
  vec2 direction=vec2(-((a+b)-(d+e)),(a+d)-(b+e));
  float reduce=max((a+b+d+e)*.03125,.0078125);
  direction=clamp(direction/(min(abs(direction.x),abs(direction.y))+reduce),vec2(-4.),vec2(4.))*pixel;
  vec3 close=(texture(image,uv-direction/6.).rgb+texture(image,uv+direction/6.).rgb)*.5;
  vec3 far=close*.5+(texture(image,uv-direction*.5).rgb+texture(image,uv+direction*.5).rgb)*.25;
  float luma=brightness(far);
  color=vec4(luma<minimum||luma>maximum?close:far,1.);
}`;

/** Single-sample geometry plus a screen-space smoothing pass avoids costly per-vertex MSAA. */
export class PresentationDevice {
  private readonly framebuffer: WebGLFramebuffer;
  private readonly color: WebGLTexture;
  private readonly depth: WebGLRenderbuffer;
  private readonly vao: WebGLVertexArrayObject;
  private readonly program: WebGLProgram;
  private width = 0;
  private height = 0;
  constructor(private readonly gl: WebGL2RenderingContext) {
    const framebuffer = gl.createFramebuffer(),
      color = gl.createTexture(),
      depth = gl.createRenderbuffer(),
      vao = gl.createVertexArray();
    if (!framebuffer || !color || !depth || !vao)
      throw new Error('Unable to allocate the renderer framebuffer.');
    this.framebuffer = framebuffer;
    this.color = color;
    this.depth = depth;
    this.vao = vao;
    this.program = createProgram(gl, vertex, fragment);
  }
  begin(width: number, height: number) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.color);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.color, 0);
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, width, height);
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.DEPTH_STENCIL_ATTACHMENT,
      gl.RENDERBUFFER,
      this.depth,
    );
  }
  present(smoothing: number) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.color);
    gl.uniform1i(gl.getUniformLocation(this.program, 'image'), 3);
    gl.uniform1i(gl.getUniformLocation(this.program, 'smoothing'), smoothing);
    gl.uniform2f(gl.getUniformLocation(this.program, 'pixel'), 1 / this.width, 1 / this.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // Preserve painter order while drawing already-antialiased glyphs after smoothing.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.framebuffer);
    gl.blitFramebuffer(
      0,
      0,
      this.width,
      this.height,
      0,
      0,
      this.width,
      this.height,
      gl.DEPTH_BUFFER_BIT,
      gl.NEAREST,
    );
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
  }
  dispose() {
    const gl = this.gl;
    gl.deleteFramebuffer(this.framebuffer);
    gl.deleteTexture(this.color);
    gl.deleteRenderbuffer(this.depth);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }
}
