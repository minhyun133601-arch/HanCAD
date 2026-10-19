import { getLegacyRuntime } from '@hancad/legacy-bridge';
import type { CadArc, CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import type {
  DisplayArc,
  DisplayEntity,
  DisplayGeometry,
  DisplayTriangle,
  Vec2,
} from '../display/types';
import { colorFromDxf, colorFromHex } from '../style/aci';
import { triangulatePolygon } from '../display/polygon';

const tau = Math.PI * 2;
const wcs = (point: CadPoint): Vec2 => ({ x: point.x, y: -point.y });
const modulo = (angle: number): number => ((angle % tau) + tau) % tau;

export function legacyArcGeometry(
  arc: Pick<CadArc, 'center' | 'radius' | 'startAngle' | 'endAngle' | 'clockwise'>,
): DisplayArc {
  const start = arc.clockwise ? -arc.endAngle : -arc.startAngle;
  const end = arc.clockwise ? -arc.startAngle : -arc.endAngle;
  return {
    type: 'arc',
    center: wcs(arc.center),
    radius: arc.radius,
    startAngle: modulo(start),
    sweepAngle: Math.abs(arc.endAngle - arc.startAngle) >= tau - 1e-9 ? tau : modulo(end - start),
  };
}

export function legacyDisplayGeometry(entity: CadEntity, unit?: string): DisplayGeometry {
  if (entity.curve) return { type: 'curve', curve: entity.curve };
  if (entity.regionLoops)
    return {
      type: 'composite',
      triangles: [],
      parts: entity.regionLoops.flatMap((loop) =>
        loop.map((curve) => ({ type: 'curve' as const, curve })),
      ),
    };
  if (entity.drawPaths)
    return {
      type: 'composite',
      triangles: [],
      parts: entity.drawPaths.map((path) => {
        const vertices = new Float64Array(path.length * 5);
        path.forEach((point, index) => {
          vertices[index * 5] = point.x;
          vertices[index * 5 + 1] = -point.y;
        });
        return { type: 'polyline', vertices, closed: false };
      }),
    };
  if (entity.drawFill) {
    const triangles = entity.drawFill.flatMap((polygon) => triangulatePolygon(polygon.map(wcs)));
    const parts: DisplayGeometry[] =
      entity.sourceType === 'WIPEOUT'
        ? []
        : entity.drawFill.map((polygon) => {
            const vertices = new Float64Array(polygon.length * 5);
            polygon.forEach((p, i) => {
              vertices[i * 5] = p.x;
              vertices[i * 5 + 1] = -p.y;
            });
            return { type: 'polyline', vertices, closed: true };
          });
    return { type: 'composite', parts, triangles, fillControlled: entity.sourceType !== 'WIPEOUT' };
  }
  switch (entity.type) {
    case 'line':
      return { type: 'line', start: wcs(entity.a), end: wcs(entity.b) };
    case 'circle':
      return {
        type: 'arc',
        center: wcs(entity.center),
        radius: entity.radius,
        startAngle: 0,
        sweepAngle: tau,
      };
    case 'arc':
      return legacyArcGeometry(entity);
    case 'rect':
    case 'polyline': {
      const vertices = new Float64Array(entity.points.length * 5);
      entity.points.forEach((point, index) => {
        vertices[index * 5] = point.x;
        vertices[index * 5 + 1] = -point.y;
        vertices[index * 5 + 2] = -(entity.bulges?.[index] ?? 0);
        vertices[index * 5 + 3] = entity.startWidths?.[index] ?? entity.constantWidth ?? 0;
        vertices[index * 5 + 4] = entity.endWidths?.[index] ?? entity.constantWidth ?? 0;
      });
      return { type: 'polyline', vertices, closed: entity.closed };
    }
    case 'text':
      return {
        type: 'text',
        position: wcs(entity.point),
        text: entity.text,
        height: entity.textSize,
        rotation: -entity.rotation,
        ...(entity.mirroredX ? { mirroredX: true } : {}),
        align: 'left',
      };
    case 'dimension': {
      const geometry = getLegacyRuntime().core.cadEngine.dimensionGeometry(entity, unit);
      if (!geometry) return { type: 'composite', parts: [], triangles: [] };
      const parts: DisplayGeometry[] = geometry.lines.map(([start, end]) => ({
        type: 'line',
        start: wcs(start),
        end: wcs(end),
      }));
      parts.push(...geometry.arcs.map(legacyArcGeometry));
      const height = geometry.textSize;
      const rotation = -geometry.rotation;
      const anchor = wcs(geometry.textPoint);
      // The legacy label anchor uses Canvas's middle baseline, while DisplayText uses alphabetic.
      parts.push({
        type: 'text',
        text: geometry.label,
        height,
        rotation,
        align: 'center',
        position: {
          x: anchor.x + Math.sin(rotation) * height * 0.35,
          y: anchor.y - Math.cos(rotation) * height * 0.35,
        },
      });
      const triangles: DisplayTriangle[] = [];
      for (const polygon of geometry.arrows) {
        const first = polygon[0];
        if (!first) continue;
        for (let i = 1; i + 1 < polygon.length; i++)
          triangles.push([wcs(first), wcs(polygon[i]!), wcs(polygon[i + 1]!)]);
      }
      return { type: 'composite', parts, triangles };
    }
  }
}

export function legacyDisplayEntity(entity: CadEntity, unit?: string): DisplayEntity {
  return {
    id: entity.id,
    geometry: legacyDisplayGeometry(entity, unit),
    layer: entity.layer,
    color:
      entity.aci === undefined && entity.trueColor === undefined
        ? (colorFromHex(entity.color) ?? { kind: 'aci', index: 7 })
        : colorFromDxf(entity.aci ?? 256, entity.trueColor),
    linetype: entity.linetype ?? 'CONTINUOUS',
    linetypeScale: entity.linetypeScale ?? 1,
    lineweight: entity.lineweight ?? -1,
    transparency: entity.transparency ?? 0,
    plinegen: entity.plinegen ?? false,
    ...(entity.sourceType === 'WIPEOUT' ? { backgroundMask: true } : {}),
  };
}

function legacyDisplayEntities(entity: CadEntity, unit?: string): DisplayEntity[] {
  const display = legacyDisplayEntity(entity, unit);
  if (entity.sourceType !== 'WIPEOUT' || !('points' in entity)) return [display];
  const { drawFill: _fill, ...outline } = entity;
  const frame = legacyDisplayEntity(outline, unit);
  delete frame.backgroundMask;
  return [
    display,
    { ...frame, id: `${entity.id}::frame`, sourceId: entity.id, wipeoutFrame: true },
  ];
}

export interface DisplaySourceChanges {
  entities: readonly DisplayEntity[];
  added: readonly DisplayEntity[];
  modified: readonly DisplayEntity[];
  removed: readonly string[];
}

/** ID-keyed diffs retain unaffected display geometry across immutable legacy snapshots. */
export class LegacyDisplaySource {
  private previous = new Map<
    string,
    { entity: CadEntity; signature: string; displays: DisplayEntity[] }
  >();
  private unit: string | undefined;

  sync(state: LegacyCadState): DisplaySourceChanges {
    const next = new Map<
      string,
      { entity: CadEntity; signature: string; displays: DisplayEntity[] }
    >();
    const entities: DisplayEntity[] = [],
      added: DisplayEntity[] = [],
      modified: DisplayEntity[] = [];
    for (const entity of state.entities) {
      const previous = this.previous.get(entity.id);
      const signature = previous?.entity === entity ? previous.signature : JSON.stringify(entity);
      const changed =
        !previous || signature !== previous.signature || this.unit !== state.settings.unit;
      const displays = changed
        ? legacyDisplayEntities(entity, state.settings.unit)
        : previous.displays;
      next.set(entity.id, { entity, signature, displays });
      entities.push(...displays);
      const previousIds = new Set(previous?.displays.map((display) => display.id));
      for (const display of displays) {
        if (!previousIds.has(display.id)) added.push(display);
        else if (changed) modified.push(display);
      }
    }
    const retained = new Set(entities.map((entity) => entity.id));
    const removed = [...this.previous.values()]
      .flatMap((item) => item.displays.map((display) => display.id))
      .filter((id) => !retained.has(id));
    this.previous = next;
    this.unit = state.settings.unit;
    return { entities, added, modified, removed };
  }
}
