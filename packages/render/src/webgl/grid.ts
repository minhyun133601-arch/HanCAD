import { adaptiveGridSpacing } from '../drafting-aids';
import type { CadAidSettings } from '../drafting-aids';
import type { Vec2 } from '../display/types';
import { createProgram } from './shaders';
const vertex = `#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,1.,1.);}`;
const fragment = `#version 300 es
precision highp float;
uniform vec2 uSize;
uniform vec2 uStep;
uniform vec2 uMajor;
uniform vec2 uPhase;
uniform vec2 uMajorPhase;
uniform vec2 uAxes;
uniform vec4 uLimits;
uniform vec3 uBackground;
uniform float uRatio;
uniform int uDots;
uniform int uLight;
out vec4 color;
vec2 distanceGrid(vec2 p,vec2 phase,vec2 stepSize){return abs(mod(p+phase+stepSize*.5,stepSize)-stepSize*.5);}
void main(){
  vec2 p=gl_FragCoord.xy/uRatio-uSize*.5;
  if(p.x<uLimits.x||p.y<uLimits.y||p.x>uLimits.z||p.y>uLimits.w)discard;
  vec2 d=distanceGrid(p,uPhase,uStep),m=distanceGrid(p,uMajorPhase,uMajor);
  bool minor=uDots==1?max(d.x,d.y)<.6:min(d.x,d.y)<.5;
  bool major=uDots==1?max(m.x,m.y)<.7:min(m.x,m.y)<.5;
  vec3 ink=uLight==1?(major?vec3(.70,.73,.76):vec3(.85,.87,.89)):(major?vec3(.27,.33,.39):vec3(.18,.23,.27));
  if(!minor&&!major)discard;
  if(abs(p.y-uAxes.y)<.5)ink=vec3(.52,.22,.22);
  if(abs(p.x-uAxes.x)<.5)ink=vec3(.22,.44,.29);
  color=vec4(ink,1.);
}`;
export class GridDevice {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject | null;
  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program = createProgram(gl, vertex, fragment);
    this.vao = gl.createVertexArray();
  }
  draw(
    settings: CadAidSettings,
    eye: Vec2,
    scale: number,
    width: number,
    height: number,
    ratio: number,
  ) {
    if (!settings.gridMode) return;
    const sx = adaptiveGridSpacing(
      settings.gridUnit.x || settings.snapUnit.x,
      scale,
      settings.gridMajor,
      settings.gridDisplay,
    );
    const sy = adaptiveGridSpacing(
      settings.gridUnit.y || settings.snapUnit.y,
      scale,
      settings.gridMajor,
      settings.gridDisplay,
    );
    if (sx === undefined || sy === undefined) return;
    const major = Math.max(1, settings.gridMajor),
      gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    const u = (name: string) => gl.getUniformLocation(this.program, name);
    gl.uniform2f(u('uSize'), width, height);
    gl.uniform2f(u('uStep'), sx * scale, sy * scale);
    gl.uniform2f(u('uMajor'), sx * major * scale, sy * major * scale);
    gl.uniform2f(u('uPhase'), (eye.x % sx) * scale, (eye.y % sy) * scale);
    gl.uniform2f(u('uMajorPhase'), (eye.x % (sx * major)) * scale, (eye.y % (sy * major)) * scale);
    gl.uniform2f(u('uAxes'), -eye.x * scale, -eye.y * scale);
    gl.uniform1f(u('uRatio'), ratio);
    const b = settings.limits;
    if (settings.gridDisplay & 1) gl.uniform4f(u('uLimits'), -width, -height, width, height);
    else
      gl.uniform4f(
        u('uLimits'),
        (b.minX - eye.x) * scale,
        (-b.maxY - eye.y) * scale,
        (b.maxX - eye.x) * scale,
        (-b.minY - eye.y) * scale,
      );
    gl.uniform1i(u('uDots'), settings.gridStyle & 1);
    gl.uniform1i(u('uLight'), parseInt(settings.background.slice(1), 16) > 0x808080 ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
  }
  dispose() {
    this.gl.deleteProgram(this.program);
    this.gl.deleteVertexArray(this.vao);
  }
}
