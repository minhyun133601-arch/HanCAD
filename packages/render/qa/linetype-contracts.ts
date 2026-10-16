import type { DisplayEntity, DisplayGeometry } from '../src/display/types';
import { WebGlRenderer } from '../src/webgl/renderer';
import { builtinLinetypes } from '../src/style/linetype';
import { goldenCanvases } from './pixel-comparison';

const background = [33, 40, 48, 255];
const pen = [255, 204, 51, 255];

/** Exact ink/gap probes retain small dash phases along two-hundred-million-unit runs. */
export function runLinetypeContracts() {
  const { gpuCanvas } = goldenCanvases();
  const definitions = new Map(builtinLinetypes());
  definitions.set('QA', {
    name: 'QA',
    description: 'Independent GPU phase probes',
    elements: [{ length: 8 }, { length: -4 }],
    patternLength: 12,
  });
  const variables: Record<string, number> = { LWDISPLAY: 1, LINESMOOTHING: 0, PDMODE: 0 };
  const entity = (id: string, geometry: DisplayGeometry, linetypeScale = 1): DisplayEntity => ({
    id,
    geometry,
    layer: '0',
    color: { kind: 'rgb', rgb: 0xffcc33 },
    linetype: 'QA',
    linetypeScale,
    lineweight: 70,
    transparency: 0,
    plinegen: false,
  });
  const entities: DisplayEntity[] = [
    entity('long-line', {
      type: 'line',
      start: { x: -100000000, y: 40.5 },
      end: { x: 100000000, y: 40.5 },
    }),
    entity('long-wide-ribbon', {
      type: 'polyline',
      closed: false,
      vertices: new Float64Array([-100000000, 80.5, 0, 12, 12, 100000000, 80.5, 0, 0, 0]),
    }),
    entity(
      'scaled-long-line',
      { type: 'line', start: { x: -100000000, y: 115.5 }, end: { x: 100000000, y: 115.5 } },
      2,
    ),
    {
      ...entity('default-point', { type: 'point', position: { x: 40.5, y: 20.5 } }),
      linetype: 'CONTINUOUS',
      color: { kind: 'rgb', rgb: 0xffffff },
    },
  ];
  const renderer = new WebGlRenderer(gpuCanvas, {
    variable: (name) => variables[name],
    linetypes: () => definitions,
  });
  renderer.setDisplayEntities(entities);
  const eye = { x: 30, y: 70 };
  renderer.draw(eye, 3, 500, 420, 0x212830);
  const gl = renderer.device.gl;
  const sample = (x: number, y: number) => {
    const actual = new Uint8Array(4);
    gl.readPixels(
      Math.floor(250 + (x - eye.x) * 3),
      Math.floor(210 + (y - eye.y) * 3),
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      actual,
    );
    return [...actual];
  };
  const results: {
    name: string;
    expected: number[];
    actual: number[];
    maximumError: number;
    glError: number;
  }[] = [];
  const record = (name: string, expected: number[], actual: number[]) =>
    results.push({
      name,
      expected,
      actual,
      maximumError: Math.max(...expected.map((value, i) => Math.abs(value - actual[i]!))),
      glError: gl.getError(),
    });
  for (const row of [
    { name: 'line', y: 40.5, scale: 1 },
    { name: 'wide fill', y: 80.5, scale: 1 },
    { name: 'scaled line', y: 115.5, scale: 2 },
  ]) {
    const length = 200000000,
      period = 12 * row.scale,
      first = 8 * row.scale;
    const endDash = ((length % period) + first) / 2;
    for (const x of [-5.5, 0.5, 4.5, 6.5, 12.5, 16.5, 24.5, 28.5, 30.5, 40.5, 52.5]) {
      const phase = (((100000000 + x - endDash + first) % period) + period) % period;
      record(
        `${row.name} ${x} ${phase < first ? 'ink' : 'gap'}`,
        phase < first ? pen : background,
        sample(x, row.y),
      );
    }
  }
  record('PDMODE 0 visible dot', [255, 255, 255, 255], sample(40.5, 20.5));
  variables.PDMODE = 1;
  renderer.setDisplayEntities([entities[3]!]);
  renderer.draw(eye, 3, 500, 420, 0x212830);
  record('PDMODE 1 invisible dot', background, sample(40.5, 20.5));
  renderer.dispose();
  return results;
}
