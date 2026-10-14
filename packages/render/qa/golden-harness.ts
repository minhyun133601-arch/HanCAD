import { getLegacyRuntime, visibleCadEntities } from '@hancad/legacy-bridge';
import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { RetainedScene } from '../src/scene';

export function runGolden(index: number) {
  const origin = index === 19 ? { x: 200000000, y: 450000000 } : { x: 0, y: 0 };
  const p = (x: number, y: number): CadPoint => ({ x: x + origin.x, y: y + origin.y });
  const base = { layer: '0', lineWidth: 1 + (index % 3), color: '#ffffff' };
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
  document.body.replaceChildren();
  document.body.style.cssText = 'display:flex;gap:10px;margin:10px;background:#10151c';
  const canvases = [document.createElement('canvas'), document.createElement('canvas')];
  for (const canvas of canvases) {
    canvas.width = 500;
    canvas.height = 420;
    document.body.append(canvas);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#212830';
    ctx.fillRect(0, 0, 500, 420);
  }
  const reference = canvases[0]!.getContext('2d')!,
    cached = canvases[1]!.getContext('2d')!;
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
    });
  }
  cached.setTransform(scale, 0, 0, scale, -origin.x * scale, -origin.y * scale);
  const stats = new RetainedScene(state).draw(
    cached,
    { minX: origin.x, minY: origin.y, maxX: origin.x + 500 / scale, maxY: origin.y + 420 / scale },
    scale,
    selected,
    { origin, ratio: 1, scale, tx: 0, ty: 0 },
  );
  const a = reference.getImageData(0, 0, 500, 420).data,
    b = cached.getImageData(0, 0, 500, 420).data;
  let error = 0,
    differingPixels = 0,
    referenceInk = 0,
    cachedInk = 0,
    referenceCoverage = 0,
    cachedCoverage = 0;
  const referenceMask = new Uint8Array(500 * 420),
    cachedMask = new Uint8Array(500 * 420);
  for (let i = 0; i < a.length; i += 4) {
    let maximum = 0;
    for (let channel = 0; channel < 3; channel++) {
      const delta = Math.abs(a[i + channel]! - b[i + channel]!);
      error += delta;
      maximum = Math.max(maximum, delta);
    }
    if (maximum > 8) differingPixels++;
    const ra = Math.max(0, a[i]! - 33, a[i + 1]! - 40, a[i + 2]! - 48);
    const rb = Math.max(0, b[i]! - 33, b[i + 1]! - 40, b[i + 2]! - 48);
    referenceCoverage += ra;
    cachedCoverage += rb;
    if (ra > 8) {
      referenceInk++;
      referenceMask[i / 4] = 1;
    }
    if (rb > 8) {
      cachedInk++;
      cachedMask[i / 4] = 1;
    }
  }
  let geometryMissing = 0;
  for (let i = 0; i < referenceMask.length; i++) {
    if (!referenceMask[i]) continue;
    let matched = false;
    const x = i % 500,
      y = Math.floor(i / 500);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (
          x + dx >= 0 &&
          x + dx < 500 &&
          y + dy >= 0 &&
          y + dy < 420 &&
          cachedMask[(y + dy) * 500 + x + dx]
        )
          matched = true;
      }
    if (!matched) geometryMissing++;
  }
  return {
    index,
    meanChannelError: error / (500 * 420 * 3),
    differingPixels,
    referenceInk,
    cachedInk,
    referenceCoverage,
    cachedCoverage,
    geometryMissing,
    stats,
  };
}
