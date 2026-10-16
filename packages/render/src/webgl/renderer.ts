import type { CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import { LegacyDisplaySource } from '../sources/legacy-source';
import { drawingStyleTables } from '../sources/style-tables';
import type { DisplayLayerStyle } from '../sources/style-tables';
import type { Bounds2, DisplayEntity, TessellationOptions, Vec2 } from '../display/types';
import type { LinetypeDefinition } from '../style/linetype';
import { DisplaySpatialIndex } from '../spatial/display-index';
import { buildMesh, expandStrokeView } from './mesh';
import { GpuDevice } from './gpu';
import { entityDash, entityStyle, patternTable } from './styles';
import type { RenderEnvironment } from './styles';
import { stressMesh } from './stress';
import { TextDevice } from './text-device';
import { GridDevice } from './grid';
import type { CadAidSettings } from '../drafting-aids';
import { partitionEntities, visibleDisplayBounds } from './chunks';
import type { Chunk } from './chunks';
export interface RendererSettings {
  variable?: (name: string) => unknown;
  layers?: () => ReadonlyMap<string, DisplayLayerStyle>;
  linetypes?: () => ReadonlyMap<string, LinetypeDefinition>;
  aids?: () => CadAidSettings;
}
const intersects = (a: Bounds2, b: Bounds2) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

/** Retained chunk buffers and texture-only styling; ordinary frames never visit every entity. */
export class WebGlRenderer {
  readonly device: GpuDevice;
  private readonly text: TextDevice;
  private readonly grid: GridDevice;
  private readonly source = new LegacyDisplaySource();
  private readonly index = new DisplaySpatialIndex();
  private entities: readonly DisplayEntity[] = [];
  private chunks: Chunk[] = [];
  private transparentChunks: Chunk[] = [];
  private transparentKey = '';
  private state: LegacyCadState | undefined;
  private selected: ReadonlySet<string> = new Set();
  private hidden: ReadonlySet<string> = new Set();
  private stylesDirty = true;
  private styleKey = '';
  private hasWide = false;
  private maximumStrokeWidth = 1;
  private count = 0;
  private visibleCount = 0;
  private stressCount = 0;
  private regenHeight = 297;
  private geometryKey = '';
  private dashKey = '';
  constructor(
    canvas: HTMLCanvasElement,
    private readonly settings: RendererSettings = {},
  ) {
    this.device = new GpuDevice(canvas);
    this.text = new TextDevice(this.device.gl, canvas);
    this.grid = new GridDevice(this.device.gl);
  }
  setDrawing(state: LegacyCadState) {
    this.state = state;
    if (this.stressCount) return;
    const diff = this.source.sync(state),
      old = this.entities;
    this.entities = diff.entities;
    this.count = this.entities.length;
    const changed = new Set([...diff.added, ...diff.modified].map((e) => e.id));
    const layoutChanged =
      old.length !== this.entities.length || old.some((e, i) => e.id !== this.entities[i]?.id);
    if (layoutChanged) this.index.set(this.entities);
    else for (const entity of [...diff.added, ...diff.modified]) this.index.upsert(entity);
    if (layoutChanged) {
      this.releaseChunks();
      this.chunks = partitionEntities(this.entities);
    } else if (changed.size) {
      const environment = this.environment(0x212830);
      const geometryChanged = new Set<string>();
      for (const chunk of this.chunks) {
        if (!chunk.entries.some((e) => changed.has(e.entity.id))) continue;
        chunk.entries = chunk.entries.map((e) => {
          if (!changed.has(e.entity.id)) return e;
          const next = this.entities[e.slot]!;
          const previousDash = entityDash(e.entity, environment),
            nextDash = entityDash(next, environment);
          if (
            changed.has(e.entity.id) &&
            (JSON.stringify(e.entity.geometry) !== JSON.stringify(next.geometry) ||
              previousDash?.length !== nextDash?.length ||
              previousDash?.first !== nextDash?.first ||
              e.entity.plinegen !== next.plinegen)
          ) {
            chunk.dirty = true;
            geometryChanged.add(e.entity.id);
          }
          return { entity: next, slot: e.slot };
        });
      }
      for (const chunk of this.transparentChunks)
        if (chunk.entries.some((e) => geometryChanged.has(e.entity.id))) chunk.dirty = true;
    }
    this.stylesDirty = true;
  }
  setDisplayEntities(entities: readonly DisplayEntity[]) {
    this.releaseChunks();
    this.stressCount = 0;
    this.entities = entities;
    this.count = entities.length;
    this.index.set(entities);
    this.chunks = partitionEntities(this.entities);
    this.stylesDirty = true;
  }
  setSelection(selected: ReadonlySet<string>, hidden: ReadonlySet<string>) {
    this.selected = selected;
    this.hidden = hidden;
    this.stylesDirty = true;
  }
  pick(point: CadPoint, tolerance: number): string | undefined {
    if (this.stressCount) return undefined;
    const hits = this.index.pick({ x: point.x, y: -point.y }, tolerance);
    const locked = new Set(
      this.state?.layers.filter((l) => l.locked || !l.visible).map((l) => l.name),
    );
    const layers = this.settings.layers?.();
    return hits.find(
      (hit) =>
        !locked.has(hit.entity.layer) &&
        layers?.get(hit.entity.layer)?.locked !== true &&
        layers?.get(hit.entity.layer)?.visible !== false,
    )?.entity.id;
  }
  regenerate(height: number) {
    this.regenHeight = height;
    for (const chunk of [...this.chunks, ...this.transparentChunks]) chunk.dirty = true;
    this.stylesDirty = true;
  }
  setStress(count: number) {
    this.releaseChunks();
    this.stressCount = count;
    this.count = count;
    this.stylesDirty = true;
    if (!count) {
      this.setDisplayEntities(this.state ? this.source.sync(this.state).entities : this.entities);
      return;
    }
    for (let first = 0; first < count; first += 8192)
      this.chunks.push({
        entries: [],
        lod: 0,
        dirty: true,
        stressFirst: first,
        stressCount: Math.min(8192, count - first),
      });
  }
  getStressBounds(): Bounds2 | undefined {
    if (!this.stressCount) return undefined;
    return {
      minX: 0,
      minY: 0,
      maxX: Math.min(12, Math.ceil(this.stressCount / 8192)) * 1000,
      maxY: Math.ceil(this.stressCount / 8192 / 12) * 1000,
    };
  }
  getBounds(ids?: readonly string[]): Bounds2 | undefined {
    if (this.stressCount && !ids) return this.getStressBounds();
    return visibleDisplayBounds(this.entities, this.environment(0x212830), this.regenHeight, ids);
  }
  private environment(background: number): RenderEnvironment {
    const tables = drawingStyleTables([], this.state);
    return {
      background,
      variable: this.settings.variable ?? (() => undefined),
      layers: this.settings.layers?.() ?? tables.layers,
      linetypes: this.settings.linetypes?.() ?? tables.linetypes,
      selected: this.selected,
      hidden: this.hidden,
    };
  }
  draw(eye: Vec2, scale: number, width: number, height: number, background: number) {
    const environment = this.environment(background);
    const numeric = (name: string, fallback: number) => {
      const v = environment.variable(name);
      return typeof v === 'number' ? v : fallback;
    };
    const geometryKey = JSON.stringify([
      numeric('PDMODE', 0),
      numeric('PDSIZE', 0),
      numeric('FILLMODE', 1),
      this.regenHeight,
    ]);
    if (geometryKey !== this.geometryKey) {
      this.geometryKey = geometryKey;
      const options = {
        pdmode: numeric('PDMODE', 0),
        pdsize: numeric('PDSIZE', 0),
        fillmode: numeric('FILLMODE', 1) !== 0,
        regenViewHeight: this.regenHeight,
      };
      this.index.configure(options);
      for (const chunk of [...this.chunks, ...this.transparentChunks]) chunk.dirty = true;
    }
    const key = JSON.stringify([
      background,
      ...[
        'LWDISPLAY',
        'LWDEFAULT',
        'LTSCALE',
        'MSLTSCALE',
        'PSLTSCALE',
        'CANNOSCALEVALUE',
        'TRANSPARENCYDISPLAY',
      ].map((n) => environment.variable(n)),
      [...environment.layers].map(([name, l]) => [
        name,
        l.color,
        l.lineweight,
        l.transparency,
        l.visible,
      ]),
    ]);
    if (key !== this.styleKey) {
      this.stylesDirty = true;
      this.styleKey = key;
    }
    const dashKey = JSON.stringify([
      numeric('LTSCALE', 1),
      numeric('MSLTSCALE', 1),
      numeric('CANNOSCALEVALUE', 1),
      [...environment.linetypes].map(([name, d]) => [name, d.elements.map((e) => e.length)]),
      [...environment.layers].map(([name, l]) => [name, l.linetype]),
    ]);
    if (dashKey !== this.dashKey) {
      this.dashKey = dashKey;
      for (const chunk of [...this.chunks, ...this.transparentChunks]) chunk.dirty = true;
      this.stylesDirty = true;
    }
    if (this.stylesDirty) {
      const patterns = patternTable(environment.linetypes);
      this.device.uploadPatterns(patterns.data, patterns.height);
      const data = new Float32Array(Math.max(8, this.entities.length * 8));
      const transparent: { entity: DisplayEntity; slot: number }[] = [];
      this.hasWide = false;
      this.maximumStrokeWidth = 1;
      this.visibleCount = 0;
      if (this.stressCount) data.set([0.55, 0.78, 1, 1, 1, 0, 1, 0]);
      else
        this.entities.forEach((entity, i) => {
          const style = entityStyle(entity, environment, patterns.names);
          if (entity.visible !== false && environment.layers.get(entity.layer)?.visible !== false)
            this.visibleCount++;
          data.set(style, i * 8);
          this.hasWide ||= style[4]! > 1;
          this.maximumStrokeWidth = Math.max(this.maximumStrokeWidth, style[4]!);
          if (style[3]! > 0 && style[3]! < 1) transparent.push({ entity, slot: i });
        });
      for (const chunk of this.chunks)
        chunk.visible =
          chunk.stressCount ??
          chunk.entries.reduce((sum, e) => sum + (data[e.slot * 8 + 3]! > 0 ? 1 : 0), 0);
      this.device.uploadStyles(data);
      this.stylesDirty = false;
      const transparentKey = transparent.map((e) => e.entity.id).join('\0');
      if (transparentKey !== this.transparentKey) {
        this.release(this.transparentChunks);
        this.transparentKey = transparentKey;
        // A transparent entity's text/fill/stroke must blend before the next entity.
        this.transparentChunks = transparent.map((entry) => ({
          entries: [entry],
          lod: 0,
          dirty: true,
        }));
      } else
        for (const chunk of this.transparentChunks)
          chunk.entries = chunk.entries.map((e) => ({
            entity: this.entities[e.slot]!,
            slot: e.slot,
          }));
    }
    const view: Bounds2 = {
      minX: eye.x - width / scale / 2,
      minY: eye.y - height / scale / 2,
      maxX: eye.x + width / scale / 2,
      maxY: eye.y + height / scale / 2,
    };
    const lod = 2 ** Math.ceil(Math.log2(scale));
    const strokePadding = (this.maximumStrokeWidth / 2 + 0.5) / scale;
    const strokeView = expandStrokeView(view, strokePadding);
    const viewKey = [eye.x, eye.y, width, height, scale, strokePadding].join(',');
    const options: TessellationOptions = {
      tolerance: 0.25 / lod,
      view,
      pdmode: numeric('PDMODE', 0),
      pdsize: numeric('PDSIZE', 0),
      regenViewHeight: this.regenHeight,
      fillmode: numeric('FILLMODE', 1) !== 0,
    };
    this.device.begin(background);
    const aids = this.settings.aids?.();
    if (aids) this.grid.draw(aids, eye, scale, width, height, this.device.canvas.width / width);
    let calls = 0,
      drawn = 0,
      rebuilt = 0,
      pending = 0;
    const began = performance.now();
    const prepare = (chunk: Chunk) => {
      if (
        !chunk.dirty &&
        chunk.gpu &&
        !chunk.gpu.viewDependent &&
        !intersects(chunk.gpu.bounds, strokeView)
      )
        return false;
      const viewChanged = chunk.gpu?.viewDependent && chunk.viewKey !== viewKey;
      const refine = chunk.curved !== false && (scale > chunk.lod || scale < chunk.lod / 8);
      if (chunk.dirty || !chunk.gpu || viewChanged || refine) {
        if (!chunk.dirty && chunk.gpu && !viewChanged && performance.now() - began > 4) {
          pending++;
          return true;
        }
        if (chunk.gpu) this.device.release(chunk.gpu);
        if (chunk.texts) this.text.release(chunk.texts);
        const mesh =
          chunk.stressFirst === undefined
            ? buildMesh(chunk.entries, {
                ...options,
                strokePadding,
                dash: (entity) => entityDash(entity, environment),
              })
            : stressMesh(chunk.stressFirst, chunk.stressCount!, lod);
        chunk.gpu = this.device.upload(mesh);
        chunk.lod = lod;
        chunk.dirty = false;
        chunk.viewKey = viewKey;
        rebuilt++;
        chunk.curved =
          chunk.stressFirst !== undefined ||
          chunk.entries.some(({ entity }) => !['line', 'text'].includes(entity.geometry.type));
        chunk.texts = this.text.upload(
          mesh.texts ?? [],
          mesh.origin,
          (scale * this.device.canvas.width) / width,
        );
      }
      return true;
    };
    for (const chunk of this.chunks) {
      if (!prepare(chunk)) continue;
      if (chunk.gpu) {
        drawn += chunk.visible ?? chunk.gpu.entities;
        calls += this.device.draw(
          chunk.gpu,
          eye,
          scale,
          width,
          height,
          Math.max(1, this.count),
          0,
          this.hasWide,
          numeric('LINESMOOTHING', 1),
        );
      }
    }
    this.device.present(numeric('LINESMOOTHING', 1));
    for (const chunk of this.chunks)
      if (chunk.gpu && intersects(chunk.gpu.bounds, strokeView))
        calls += this.text.draw(
          chunk.texts ?? [],
          chunk.gpu.origin,
          eye,
          scale,
          width,
          height,
          Math.max(1, this.count),
          0,
        );
    for (const chunk of this.transparentChunks)
      if (prepare(chunk) && chunk.gpu) {
        calls += this.device.draw(
          chunk.gpu,
          eye,
          scale,
          width,
          height,
          Math.max(1, this.count),
          1,
          this.hasWide,
          numeric('LINESMOOTHING', 1),
        );
        calls += this.text.draw(
          chunk.texts ?? [],
          chunk.gpu.origin,
          eye,
          scale,
          width,
          height,
          Math.max(1, this.count),
          1,
        );
      }
    return {
      entities: drawn,
      calls: calls + 1,
      rebuilt,
      pending,
      count: this.stressCount || this.visibleCount,
    };
  }
  private release(chunks: readonly Chunk[]) {
    for (const chunk of chunks) {
      if (chunk.gpu) this.device.release(chunk.gpu);
      if (chunk.texts) this.text.release(chunk.texts);
    }
  }
  private releaseChunks() {
    this.release(this.chunks);
    this.release(this.transparentChunks);
    this.chunks = [];
    this.transparentChunks = [];
    this.transparentKey = '';
  }
  dispose() {
    this.releaseChunks();
    this.grid.dispose();
    this.text.dispose();
    this.device.dispose();
  }
}
