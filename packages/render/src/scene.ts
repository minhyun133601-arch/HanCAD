import { getLegacyRuntime, visibleCadEntities } from '@hancad/legacy-bridge';
import type { CadBounds, CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import { appendStroke, entityBounds, overlaps, relativeEntity, strokeGeometry } from './geometry';
export interface SceneTransform {
  origin: CadPoint;
  scale: number;
  ratio: number;
  tx: number;
  ty: number;
}

interface StrokeRun {
  path: Path2D;
  origin: CadPoint;
  bounds: CadBounds;
  color: string;
  width: number;
  layer: string;
  entities: CadEntity[];
  lodPath?: Path2D;
  lodScale?: number;
}
interface DirectEntity {
  entity: CadEntity;
  bounds: CadBounds | null;
}
type SceneItem = StrokeRun | DirectEntity;
export interface SceneStats {
  entities: number;
  calls: number;
}
const noHiddenIds: ReadonlySet<string> = new Set<string>();

/** Only adjacent equal-style geometry is batched, so painter order remains unchanged. */
export class RetainedScene {
  readonly entities: readonly CadEntity[];
  private readonly items: SceneItem[] = [];
  private readonly bounds: Float64Array;
  private readonly locked: Set<string>;
  constructor(private readonly state: LegacyCadState) {
    this.entities = visibleCadEntities(state);
    this.locked = new Set(state.layers.filter((layer) => layer.locked).map((layer) => layer.name));
    this.bounds = new Float64Array(this.entities.length * 4);
    let run: StrokeRun | undefined;
    this.entities.forEach((entity, index) => {
      const bounds = entityBounds(entity);
      const offset = index * 4;
      this.bounds.set(
        bounds
          ? [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]
          : [-Infinity, -Infinity, Infinity, Infinity],
        offset,
      );
      if (!bounds || !strokeGeometry(entity) || typeof Path2D !== 'function') {
        this.items.push({ entity, bounds });
        run = undefined;
        return;
      }
      const color = /^#[0-9a-f]{6}$/i.test(entity.color)
        ? entity.color
        : /^#[0-9a-f]{3}$/i.test(entity.color)
          ? `#${entity.color
              .slice(1)
              .split('')
              .map((digit) => digit + digit)
              .join('')}`
          : '#26364c';
      const width = Math.max(0.25, entity.lineWidth);
      if (
        !run ||
        run.color !== color ||
        run.width !== width ||
        run.layer !== entity.layer ||
        run.entities.length >= 256
      ) {
        run = {
          path: new Path2D(),
          origin: {
            x: bounds.minX + (bounds.maxX - bounds.minX) / 2,
            y: bounds.minY + (bounds.maxY - bounds.minY) / 2,
          },
          bounds: { ...bounds },
          color,
          width,
          layer: entity.layer,
          entities: [],
        };
        this.items.push(run);
      }
      run.bounds.minX = Math.min(run.bounds.minX, bounds.minX);
      run.bounds.minY = Math.min(run.bounds.minY, bounds.minY);
      run.bounds.maxX = Math.max(run.bounds.maxX, bounds.maxX);
      run.bounds.maxY = Math.max(run.bounds.maxY, bounds.maxY);
      run.entities.push(entity);
    });
  }

  draw(
    context: CanvasRenderingContext2D,
    viewport: CadBounds,
    scale: number,
    selected: ReadonlySet<string>,
    transform?: SceneTransform,
    hidden: ReadonlySet<string> = noHiddenIds,
  ): SceneStats {
    const stats = { entities: 0, calls: 0 };
    const draw = getLegacyRuntime().core.cadExporters.drawEntity;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const item of this.items) {
      const padding = ('path' in item ? item.width : item.entity.lineWidth) / scale + 2 / scale;
      if (item.bounds && !overlaps(item.bounds, viewport, padding)) continue;
      if (!('path' in item)) {
        if (hidden.has(item.entity.id)) continue;
        if (transform) this.setTransform(context, transform, transform.origin);
        draw(context, transform ? relativeEntity(item.entity, transform.origin) : item.entity, {
          scale,
          unit: this.state.settings.unit,
          selected: selected.has(item.entity.id),
        });
        stats.entities++;
        stats.calls++;
        continue;
      }
      context.save();
      if (transform) this.setTransform(context, transform, item.origin);
      else context.translate(item.origin.x, item.origin.y);
      context.lineWidth = item.width / scale;
      context.strokeStyle = item.color;
      if (
        (selected.size && item.entities.some((entity) => selected.has(entity.id))) ||
        (hidden.size && item.entities.some((entity) => hidden.has(entity.id)))
      ) {
        for (const entity of item.entities) {
          if (hidden.has(entity.id)) continue;
          const path = new Path2D();
          appendStroke(path, entity, item.origin);
          context.strokeStyle = selected.has(entity.id) ? '#38bdf8' : item.color;
          context.stroke(path);
          stats.calls++;
          stats.entities++;
        }
      } else {
        const bucketScale = 2 ** Math.ceil(Math.log2(scale));
        if (item.lodScale !== bucketScale) {
          item.lodPath = new Path2D();
          item.lodScale = bucketScale;
          for (const entity of item.entities)
            appendStroke(item.lodPath, entity, item.origin, 0.25 / bucketScale);
        }
        context.stroke(item.lodPath!);
        stats.calls++;
        stats.entities += item.entities.length;
      }
      context.restore();
    }
    return stats;
  }
  private setTransform(
    context: CanvasRenderingContext2D,
    view: SceneTransform,
    origin: CadPoint,
  ): void {
    const scale = view.scale * view.ratio;
    context.setTransform(
      scale,
      0,
      0,
      scale,
      view.ratio * (view.tx + (origin.x - view.origin.x) * view.scale),
      view.ratio * (view.ty + (origin.y - view.origin.y) * view.scale),
    );
  }

  pick(point: CadPoint, tolerance: number): string | undefined {
    const candidates: CadEntity[] = [];
    this.entities.forEach((entity, index) => {
      const offset = index * 4;
      if (
        !this.locked.has(entity.layer) &&
        this.bounds[offset]! - tolerance <= point.x &&
        this.bounds[offset + 1]! - tolerance <= point.y &&
        this.bounds[offset + 2]! + tolerance >= point.x &&
        this.bounds[offset + 3]! + tolerance >= point.y
      )
        candidates.push(entity);
    });
    return getLegacyRuntime().core.cadEngine.hitTest(candidates, point, tolerance)?.id;
  }
}
