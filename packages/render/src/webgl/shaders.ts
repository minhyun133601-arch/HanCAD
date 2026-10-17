/** Screen-relative positions keep large WCS translations out of float32 buffers. */
const common = `
precision highp float;
precision highp int;
uniform sampler2D uStyles;
uniform sampler2D uPatterns;
uniform vec2 uViewport;
uniform vec2 uOrigin;
uniform float uScale;
uniform float uCount;
uniform float uRatio;
vec4 style(float slot, int part) {
  int i = int(slot) * 2 + part;
  return texelFetch(uStyles, ivec2(i % 1024, i / 1024), 0);
}
vec2 screen(vec2 point) { return (point + uOrigin) * uScale; }
vec4 project(vec2 point, float slot) {
  return vec4(point * vec2(2., 2.) / uViewport,
    1. - 2. * (slot + 1.) / (uCount + 1.), 1.);
}
`;
const varyings = `
out vec4 vColor;
out vec2 vDistance;
flat out vec4 vStyle;
out float vAcross;
flat out float vHalfWidth;
`;

export const lineVertex = `#version 300 es
${common}
layout(location=0) in vec2 aPosition;
layout(location=1) in vec3 aRun;
${varyings}
void main() {
  vColor = style(aRun.z, 0);
  vStyle = style(aRun.z, 1);
  vDistance = aRun.xy;
  gl_Position = project(screen(aPosition), aRun.z);
  gl_PointSize = uRatio;
  vAcross=0.;vHalfWidth=.5;
}
`;

/** aEnds = x1,y1,x2,y2; aRun = distance,length,slot,nextDistance. */
export const wideVertex = `#version 300 es
${common}
layout(location=0) in vec4 aEnds;
layout(location=1) in vec4 aRun;
${varyings}
void main() {
  vec2 a = screen(aEnds.xy), b = screen(aEnds.zw);
  vec2 delta = b - a;
  vec2 normal = length(delta) > 0. ? normalize(vec2(-delta.y, delta.x)) : vec2(0.,1.);
  int corner = gl_VertexID;
  float along = (corner == 1 || corner == 2 || corner == 4) ? 1. : 0.;
  float side = (corner == 0 || corner == 1 || corner == 3) ? -1. : 1.;
  vColor = style(aRun.z, 0);
  vStyle = style(aRun.z, 1);
  vDistance = vec2(mix(aRun.x, aRun.w, along), aRun.y);
  vHalfWidth=vStyle.x*.5;
  vAcross=side*(vHalfWidth+.5);
  gl_Position = project(mix(a,b,along) + normal * vAcross, aRun.z);
}
`;

export const lineFragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uPatterns;
uniform float uScale;
uniform int uPass;
uniform int uWide;
uniform int uFill;
uniform int uSmooth;
uniform int uForceWide;
in vec4 vColor;
in vec2 vDistance;
flat in vec4 vStyle;
in float vAcross;
flat in float vHalfWidth;
out vec4 color;
void main() {
  if (vColor.a <= 0.) discard;
  if (vStyle.w > .5 && mod(gl_FragCoord.x + gl_FragCoord.y, 8.) > 4.) discard;
  if (uPass == 0 && vColor.a < .999) discard;
  if (uPass == 1 && vColor.a >= .999) discard;
  if (uFill == 0 && ((uWide == 0 && vStyle.x > 1.) || (uWide == 1 && vStyle.x <= 1. && uForceWide == 0))) discard;
  float pattern = texelFetch(uPatterns, ivec2(12,int(vStyle.y)),0).r * vStyle.z;
  if ((uFill == 0 || vDistance.y < 0.) && pattern > 0. && (vDistance.y < 0. || vDistance.y >= pattern)) {
    float first = texelFetch(uPatterns, ivec2(0,int(vStyle.y)),0).r * vStyle.z;
    float endDash = (vDistance.y - floor(vDistance.y/pattern + .000001)*pattern + first)*.5;
    if (vDistance.y < 0. || (vDistance.x > endDash && vDistance.x < vDistance.y-endDash)) {
      float d = mod(vDistance.y < 0. ? vDistance.x : vDistance.x-endDash+first,pattern);
      bool ink = false;
      float offset = 0.;
      float fuzz = .5 / max(uScale,.000001);
      for (int i=0;i<12;i++) {
        float stepLength = texelFetch(uPatterns,ivec2(i,int(vStyle.y)),0).r*vStyle.z;
        if (stepLength >= 0. && d >= offset-fuzz && d <= offset+stepLength+fuzz) ink=true;
        offset += abs(stepLength);
        if (offset >= pattern-.000001) break;
      }
      if (!ink) discard;
    }
  }
  float coverage=uFill==0&&uWide==1?(uSmooth==1?clamp(vHalfWidth+.5-abs(vAcross),0.,1.):float(abs(vAcross)<=vHalfWidth)):1.;
  if(coverage<=0.)discard;
  color = vec4(vColor.rgb,vColor.a*coverage);
}
`;

export function createProgram(gl: WebGL2RenderingContext, vertex: string, fragment: string) {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Unable to allocate a WebGL shader.');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const diagnostic = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`WebGL shader: ${diagnostic ?? 'compile failed'}`);
    }
    return shader;
  };
  const a = compile(gl.VERTEX_SHADER, vertex),
    b = compile(gl.FRAGMENT_SHADER, fragment);
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to allocate a WebGL program.');
  gl.attachShader(program, a);
  gl.attachShader(program, b);
  gl.linkProgram(program);
  gl.deleteShader(a);
  gl.deleteShader(b);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const diagnostic = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`WebGL program: ${diagnostic ?? 'link failed'}`);
  }
  return program;
}
