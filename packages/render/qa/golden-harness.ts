import { getLegacyRuntime, visibleCadEntities } from '@hancad/legacy-bridge';
import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { WebGlRenderer } from '../src/webgl/renderer';
import { compareGolden, goldenCanvases } from './pixel-comparison';
import { runNativeGolden } from './native-goldens';
export { runPainterContracts } from './painter-contracts';
export { runLinetypeContracts } from './linetype-contracts';
export { runPrecisionContracts } from './precision-contracts';
export { runViewportContracts } from './viewport-contracts';

export function runGolden(index: number) {
  if (index >= 20) return runNativeGolden(index);
  const origin = index === 19 ? { x: 200000000, y: 450000000 } : { x: 0, y: 0 };
  const p = (x: number, y: number): CadPoint => ({ x: x + origin.x, y: y + origin.y });
  const base = {
    layer: '0',
    lineWidth: 1 + (index % 3),
    lineweight: [25, 50, 70][index % 3]!,
    color: '#ffffff',
  };
  const entities: CadEntity[] = [
    ...Array.from({ length: 6 }, (_, i): CadEntity => ({
      ...base,
      id: `line-${i}`,
      type: 'line',
      color: i < 3 ? '#ff3333' : '#3399ff',
      a: p(15 + i * 4, 15),
      b: p(95 - i * 5, 60 + i * 3),
    })),
    {
      ...base,
      id: 'rect',
      type: 'rect',
      points: [p(70, 75), p(110, 75), p(110, 95), p(70, 95)],
      closed: true,
    },
    {
      ...base,
      id: 'poly',
      type: 'polyline',
      points: [p(15, 40), p(38, 60), p(10, 70)],
      closed: index % 2 === 0,
    },
    { ...base, id: 'circle', type: 'circle', center: p(72, 38), radius: 12, layer: 'detail' },
    {
      ...base,
      id: 'arc',
      type: 'arc',
      center: p(100, 60),
      radius: 12,
      startAngle: 0.2,
      endAngle: index % 3 === 0 ? Math.PI * 2 + 0.2 : 4.4,
      clockwise: index % 2 === 0,
    },
    {
      ...base,
      id: 'text',
      type: 'text',
      point: p(25, 105),
      text: '한글 도면 / CAD',
      textSize: 5,
      rotation: (index % 4) * 0.15,
    },
    {
      ...base,
      id: 'dimension',
      type: 'dimension',
      kind: 'aligned',
      a: p(22, 75),
      b: p(55, 90),
      offset: 7,
      precision: 2,
      dimScale: 1,
      textSize: 2.5,
      arrowSize: 2.5,
      extensionGap: 1,
      extensionOvershoot: 2,
      unit: 'mm',
    },
  ];
  const runtime = getLegacyRuntime();
  if (index === 17 || index === 18)
    entities.push({
      ...base,
      id: 'tiny-curve',
      type: 'polyline',
      closed: true,
      points: Array.from({ length: 360 }, (_value, i) =>
        p(130 + Math.cos((i * Math.PI) / 180) * 0.02, 110 + Math.sin((i * Math.PI) / 180) * 0.02),
      ),
    });
  const state = runtime.core.cadEngine.normalizeState({
    entities,
    settings: { unit: 'mm' },
    layers: [
      { name: '0', color: '#ffffff', visible: index !== 14, locked: false },
      { name: 'detail', color: '#ffffff', visible: index % 4 !== 0, locked: false },
    ],
  });
  const selected = new Set(index % 5 === 0 ? ['line-2', 'dimension'] : []);
  const { reference, gpuCanvas } = goldenCanvases();
  const scale = 3;
  reference.scale(scale, scale);
  const relative = (point: CadPoint): CadPoint => ({
    x: point.x - origin.x,
    y: point.y - origin.y,
  });
  for (const entity of visibleCadEntities(state)) {
    // Translate the reference model on the CPU to avoid the previous renderer's float precision loss.
    let local = entity;
    if (entity.type === 'line') local = { ...entity, a: relative(entity.a), b: relative(entity.b) };
    else if (entity.type === 'circle' || entity.type === 'arc')
      local = { ...entity, center: relative(entity.center) };
    else if (entity.type === 'polyline' || entity.type === 'rect')
      local = { ...entity, points: entity.points.map(relative) };
    else if (entity.type === 'text') local = { ...entity, point: relative(entity.point) };
    else if (entity.type === 'dimension')
      local = {
        ...entity,
        ...(entity.a && { a: relative(entity.a) }),
        ...(entity.b && { b: relative(entity.b) }),
      };
    runtime.core.cadExporters.drawEntity(reference, local, {
      scale,
      unit: state.settings.unit,
      selected: selected.has(entity.id),
      // Phase 05 selected strokes have a minimum three-CSS-pixel highlight.
      ...(selected.has(entity.id) ? { lineWidth: Math.max(3, entity.lineWidth) } : {}),
    });
  }
  const renderer = new WebGlRenderer(gpuCanvas, {
    variable: (name) => (name === 'LWDISPLAY' ? 1 : undefined),
  });
  renderer.setDrawing(state);
  renderer.setSelection(selected, new Set());
  const stats = renderer.draw(
    { x: origin.x + 500 / scale / 2, y: -origin.y - 420 / scale / 2 },
    scale,
    500,
    420,
    0x212830,
  );
  const comparison = compareGolden(reference, renderer);
  renderer.dispose();
  const { sample: _sample, ...metrics } = comparison;
  return {
    index,
    name: `legacy-${index}-width${base.lineWidth}-${index % 2 ? 'ccw' : 'cw'}`,
    thinLines: base.lineWidth === 1,
    stats,
    ...metrics,
  };
}
