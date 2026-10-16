import { geometryFromFields } from '@hancad/geom';
import type { DisplayEntity, DisplayGeometry, Vec2 } from '../src/display/types';
import type { DisplayLayerStyle } from '../src/sources/style-tables';
import { WebGlRenderer } from '../src/webgl/renderer';
import { builtinLinetypes } from '../src/style/linetype';
import { compareGolden, goldenCanvases, goldenHeight, goldenWidth } from './pixel-comparison';

const scale = 3;
const names = [
  'tapered-polyline-fill',
  'analytic-ellipse-rational-nurbs',
  'point-symbols-infinite-lines',
  'aci7-light-background-bylayer-linetype-weights',
  'transparency-opaque-occlusion',
  'text-fill-painter-order',
  'survey-translated-tapered-fill',
  'wide-polyline-outlines',
];

export function runNativeGolden(index: number) {
  const nativeIndex = index - 20;
  const background = nativeIndex === 3 ? 0xffffff : 0x212830;
  const { reference, gpuCanvas } = goldenCanvases(background);
  reference.setTransform(scale, 0, 0, -scale, 0, goldenHeight);
  reference.lineCap = 'butt';
  reference.lineJoin = 'miter';
  const entities: DisplayEntity[] = [];
  const variables: Record<string, number> = {
    LWDISPLAY: 1,
    TRANSPARENCYDISPLAY: 1,
    PDMODE: 98,
    PDSIZE: 12,
  };
  const layers = new Map<string, DisplayLayerStyle>();
  const linetypes = new Map(builtinLinetypes());
  const probes: { name: string; x: number; y: number }[] = [];
  const origin = nativeIndex === 6 ? { x: 200000000, y: 450000000 } : { x: 0, y: 0 };
  const nativeStrokeWidth = [1, 2, 7].includes(nativeIndex) ? 2 : 1;
  let thinLines = nativeStrokeWidth === 1;
  const entity = (
    geometry: DisplayGeometry,
    rgb = 0xffffff,
    extra: Partial<DisplayEntity> = {},
  ) => {
    const value: DisplayEntity = {
      id: `native-${entities.length}`,
      geometry,
      layer: '0',
      color: { kind: 'rgb', rgb },
      linetype: 'CONTINUOUS',
      linetypeScale: 1,
      lineweight: nativeStrokeWidth === 2 ? 50 : 25,
      transparency: 0,
      plinegen: false,
      ...extra,
    };
    entities.push(value);
    return value;
  };
  const stroke = (
    points: readonly Vec2[],
    color = '#ffffff',
    width = nativeStrokeWidth,
    close = false,
  ) => {
    reference.strokeStyle = color;
    reference.lineWidth = width / scale;
    reference.beginPath();
    points.forEach((point, i) =>
      i ? reference.lineTo(point.x, point.y) : reference.moveTo(point.x, point.y),
    );
    if (close) reference.closePath();
    reference.stroke();
  };
  const fill = (points: readonly Vec2[], rgb: number, alpha = 1) => {
    reference.fillStyle = `#${rgb.toString(16).padStart(6, '0')}`;
    reference.globalAlpha = alpha;
    reference.beginPath();
    points.forEach((point, i) =>
      i ? reference.lineTo(point.x, point.y) : reference.moveTo(point.x, point.y),
    );
    reference.closePath();
    reference.fill();
    reference.globalAlpha = 1;
  };
  const rectangle = (
    x: number,
    y: number,
    width: number,
    height: number,
    rgb: number,
    transparency = 0,
  ) => {
    const a = { x, y },
      b = { x: x + width, y },
      c = { x: x + width, y: y + height },
      d = { x, y: y + height };
    entity(
      {
        type: 'composite',
        parts: [],
        triangles: [
          [a, b, c],
          [a, c, d],
        ],
      },
      rgb,
      { transparency },
    );
    fill([a, b, c, d], rgb, 1 - transparency / 100);
  };

  if (nativeIndex === 0 || nativeIndex === 6 || nativeIndex === 7) {
    thinLines = false;
    const outlined = nativeIndex === 7;
    variables.FILLMODE = outlined ? 0 : 1;
    const local = [
      { x: 20, y: 35 },
      { x: 120, y: 35 },
    ];
    entity(
      {
        type: 'polyline',
        closed: false,
        vertices: new Float64Array([
          local[0]!.x + origin.x,
          local[0]!.y + origin.y,
          0,
          4,
          16,
          local[1]!.x + origin.x,
          local[1]!.y + origin.y,
          0,
          0,
          0,
        ]),
      },
      0xffcc33,
    );
    const outline = [
      { x: 20, y: 33 },
      { x: 120, y: 27 },
      { x: 120, y: 43 },
      { x: 20, y: 37 },
    ];
    if (outlined) stroke(outline, '#ffcc33', nativeStrokeWidth, true);
    else fill(outline, 0xffcc33);
    entity(
      {
        type: 'polyline',
        closed: false,
        vertices: new Float64Array([
          25 + origin.x,
          70 + origin.y,
          0,
          8,
          8,
          105 + origin.x,
          110 + origin.y,
          0,
          0,
          0,
        ]),
      },
      0x44bbff,
    );
    const normal = { x: -4 / Math.sqrt(5), y: 8 / Math.sqrt(5) };
    const diagonal = [
      { x: 25 + normal.x, y: 70 + normal.y },
      { x: 105 + normal.x, y: 110 + normal.y },
      { x: 105 - normal.x, y: 110 - normal.y },
      { x: 25 - normal.x, y: 70 - normal.y },
    ];
    if (outlined) stroke(diagonal, '#44bbff', nativeStrokeWidth, true);
    else fill(diagonal, 0x44bbff);
    if (!outlined) probes.push({ name: 'tapered interior', x: 210, y: 315 });
  } else if (nativeIndex === 1) {
    const rotation = 0.3,
      cosine = Math.cos(rotation),
      sine = Math.sin(rotation);
    entity(
      {
        type: 'curve',
        curve: {
          type: 'ELLIPSE',
          center: { x: 75, y: 95, z: 0 },
          majorAxis: { x: 40 * cosine, y: 40 * sine, z: 0 },
          minorAxis: { x: -18 * sine, y: 18 * cosine, z: 0 },
          startParameter: 0,
          sweepParameter: Math.PI * 2,
        },
      },
      0xffcc33,
    );
    reference.strokeStyle = '#ffcc33';
    reference.lineWidth = nativeStrokeWidth / scale;
    reference.beginPath();
    reference.ellipse(75, 95, 40, 18, rotation, 0, Math.PI * 2);
    reference.stroke();
    const parsed = geometryFromFields('SPLINE', {
      degree: 2,
      knots: [0, 0, 0, 1, 1, 1],
      controlPoints: [
        [60, 20],
        [60, 60],
        [20, 60],
      ],
      weights: [1, Math.SQRT1_2, 1],
    });
    if (parsed.status !== 'ok') throw new Error('Invalid rational spline QA fixture.');
    entity({ type: 'curve', curve: parsed.geometry }, 0x44bbff);
    reference.strokeStyle = '#44bbff';
    reference.beginPath();
    reference.arc(20, 20, 40, 0, Math.PI / 2);
    reference.stroke();
  } else if (nativeIndex === 2) {
    for (const position of [
      { x: 40, y: 40 },
      { x: 100, y: 100 },
    ]) {
      entity({ type: 'point', position });
      stroke([
        { x: position.x - 6, y: position.y },
        { x: position.x + 6, y: position.y },
      ]);
      stroke([
        { x: position.x, y: position.y - 6 },
        { x: position.x, y: position.y + 6 },
      ]);
      stroke(
        [
          { x: position.x - 6, y: position.y - 6 },
          { x: position.x + 6, y: position.y - 6 },
          { x: position.x + 6, y: position.y + 6 },
          { x: position.x - 6, y: position.y + 6 },
        ],
        '#ffffff',
        nativeStrokeWidth,
        true,
      );
      reference.beginPath();
      reference.arc(position.x, position.y, 6, 0, Math.PI * 2);
      reference.stroke();
    }
    entity({ type: 'xline', basePoint: { x: 0, y: 70 }, direction: { x: 1, y: 0 } }, 0xffcc33);
    stroke(
      [
        { x: 0, y: 70 },
        { x: goldenWidth / scale, y: 70 },
      ],
      '#ffcc33',
    );
    entity({ type: 'ray', basePoint: { x: 70, y: 20 }, direction: { x: 1, y: 0.5 } }, 0x44bbff);
    stroke(
      [
        { x: 70, y: 20 },
        { x: goldenWidth / scale, y: 20 + (goldenWidth / scale - 70) / 2 },
      ],
      '#44bbff',
    );
  } else if (nativeIndex === 3) {
    thinLines = false;
    layers.set('Style', {
      name: 'Style',
      color: { kind: 'rgb', rgb: 0x00aa66 },
      linetype: 'QA',
      lineweight: 70,
      transparency: 0,
      visible: true,
      locked: false,
    });
    linetypes.set('QA', {
      name: 'QA',
      description: 'Original QA dash',
      elements: [{ length: 8 }, { length: -4 }],
      patternLength: 12,
    });
    for (let row = 0; row < 4; row++) {
      const y = 25 + row * 25;
      const color = row < 2 ? '#000000' : row === 2 ? '#ff6633' : '#00aa66';
      entity(
        { type: 'line', start: { x: 20, y }, end: { x: 100, y } },
        0xff6633,
        row === 0
          ? { color: { kind: 'aci', index: 7 }, lineweight: 70 }
          : row === 1
            ? { color: { kind: 'byblock' }, lineweight: 70 }
            : row === 2
              ? { lineweight: 70 }
              : { layer: 'Style', color: { kind: 'bylayer' }, linetype: 'BYLAYER', lineweight: -1 },
      );
      reference.setLineDash(row === 3 ? [8, 4] : []);
      stroke(
        [
          { x: 20, y },
          { x: 100, y },
        ],
        color,
        3,
      );
    }
    reference.setLineDash([]);
    probes.push(
      { name: 'ACI7 black on white', x: 150, y: 345 },
      { name: 'ByLayer green dash', x: 78, y: 120 },
    );
  } else if (nativeIndex === 4) {
    thinLines = false;
    rectangle(15, 20, 90, 85, 0x3366ff, 50);
    rectangle(40, 40, 90, 75, 0xff3333);
    rectangle(65, 60, 80, 65, 0x33ff66, 50);
    rectangle(100, 15, 30, 60, 0xffffff, 70);
    probes.push(
      { name: 'transparent front over opaque', x: 240, y: 180 },
      { name: 'opaque occludes earlier transparency', x: 150, y: 240 },
      { name: 'later translucent over mixed objects', x: 330, y: 225 },
    );
  } else if (nativeIndex === 5) {
    thinLines = false;
    rectangle(15, 35, 130, 60, 0xcc3333);
    entity({
      type: 'text',
      position: { x: 22, y: 60 },
      text: '한글 CAD',
      height: 18,
      rotation: 0,
      align: 'left',
    });
    reference.save();
    reference.translate(22, 60);
    reference.scale(1, -1);
    reference.font = '18px Arial, "Malgun Gothic", sans-serif';
    reference.fillStyle = '#ffffff';
    reference.fillText('한글 CAD', 0, 0);
    reference.restore();
    rectangle(65, 45, 70, 45, 0x3366cc);
    rectangle(90, 25, 50, 80, 0x33cc66, 50);
    probes.push(
      { name: 'later opaque fill hides prior text', x: 225, y: 210 },
      { name: 'later translucent fill', x: 315, y: 210 },
    );
  } else throw new RangeError('Unknown native golden scene.');

  const renderer = new WebGlRenderer(gpuCanvas, {
    variable: (name) => variables[name],
    layers: () => layers,
    linetypes: () => linetypes,
  });
  renderer.setDisplayEntities(entities);
  renderer.regenerate(goldenHeight / scale);
  const stats = renderer.draw(
    { x: origin.x + goldenWidth / scale / 2, y: origin.y + goldenHeight / scale / 2 },
    scale,
    goldenWidth,
    goldenHeight,
    background,
  );
  const { sample, ...metrics } = compareGolden(reference, renderer, background);
  const probeChecks = probes.map((probe) => {
    const expected = [...reference.getImageData(probe.x, probe.y, 1, 1).data];
    const actual = sample(probe.x, probe.y);
    return {
      name: probe.name,
      expected,
      actual,
      maximumError: Math.max(...expected.map((value, i) => Math.abs(value - actual[i]!))),
    };
  });
  renderer.dispose();
  return { index, name: names[nativeIndex]!, thinLines, stats, ...metrics, probeChecks };
}
