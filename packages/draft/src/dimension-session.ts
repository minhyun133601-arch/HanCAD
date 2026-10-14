import type {
  CadDimension,
  CadEntity,
  CadLine,
  CadPoint,
  CadSettings,
} from '@hancad/legacy-bridge';
import { parseDraftNumber, parseDraftPoint, validDraftPoint } from './coordinates';
import {
  angularDimension,
  automaticLinearKind,
  dimensionDistance,
  dimensionLineSelection,
  lineIntersection,
  linearDimension,
  radialDimension,
} from './dimension-geometry';
import type {
  DimensionError,
  DimensionInputResult,
  DimensionPrompt,
  DimensionSessionOptions,
  DimensionSnapshot,
  DimensionTool,
} from './dimension-types';

const epsilon = 1e-8;
const failure = (error: DimensionError): DimensionInputResult => ({ status: 'error', error });

/** One session commits one dimension. Construction points and rubber bands are never stored. */
export class DimensionSession {
  private readonly points: CadPoint[] = [];
  private cursor: CadPoint | undefined;
  private hoverEntity: CadEntity | undefined;
  private status: DimensionSnapshot['status'] = 'active';
  private prompt: DimensionPrompt;
  private mode: 'linear' | 'radial' | 'angular';
  private settings: CadSettings;
  private firstLine: CadLine | undefined;
  private twoLines = false;
  private radius = 0;
  private radialKind: 'radius' | 'diameter';
  private linearKind: 'horizontal' | 'vertical' | 'aligned' | undefined;
  private axisAngle: number | undefined;
  private text: string | undefined;
  private textRotation: number | undefined;

  constructor(
    readonly tool: DimensionTool,
    settings: CadSettings,
    private readonly options: DimensionSessionOptions,
  ) {
    this.settings = { ...settings };
    this.mode =
      tool === 'DIMANGULAR'
        ? 'angular'
        : tool === 'DIMRADIUS' || tool === 'DIMDIAMETER'
          ? 'radial'
          : 'linear';
    this.prompt = tool === 'DIM' || this.mode !== 'linear' ? 'selectObject' : 'firstPoint';
    this.radialKind = tool === 'DIMDIAMETER' ? 'diameter' : 'radius';
    this.linearKind = tool === 'DIMALIGNED' ? 'aligned' : undefined;
    this.notify();
  }

  setSettings(settings: CadSettings): void {
    this.settings = { ...settings };
    this.notify();
  }

  acceptPoint(point: CadPoint): DimensionInputResult {
    if (this.status !== 'active') return failure('closedSession');
    if (!validDraftPoint(point)) return failure('point');
    if (this.prompt === 'placement') {
      const entity = this.build(point);
      if (!entity) return failure('zeroLength');
      this.options.onCommit([entity]);
      this.status = 'committed';
      this.cursor = undefined;
      this.notify();
      return { status: 'committed' };
    }
    if (this.prompt === 'selectObject') {
      if (this.mode === 'radial') return failure('selectCircle');
      this.prompt = this.mode === 'angular' ? 'vertex' : 'firstPoint';
    }
    if (this.prompt === 'selectSecondLine') return failure('selectLineOrArc');
    if (this.prompt === 'rotationAngle' || this.prompt === 'textAngle' || this.prompt === 'text')
      return failure('point');
    const previous = this.points.at(-1);
    if (previous && dimensionDistance(previous, point) <= epsilon) return failure('zeroLength');
    const vertex = this.points[0];
    if (this.mode === 'angular' && vertex && dimensionDistance(vertex, point) <= epsilon)
      return failure('zeroLength');
    this.points.push({ ...point });
    const next: Partial<Record<DimensionPrompt, DimensionPrompt>> = {
      firstPoint: 'secondPoint',
      secondPoint: 'placement',
      vertex: 'firstRay',
      firstRay: 'secondRay',
      secondRay: 'placement',
      circleFirstPoint: 'circleSecondPoint',
      circleSecondPoint: 'placement',
    };
    this.prompt = next[this.prompt] ?? this.prompt;
    this.cursor = undefined;
    this.notify();
    return { status: 'continue' };
  }

  acceptEntity(entity: CadEntity, pickPoint?: CadPoint): DimensionInputResult {
    if (this.status !== 'active') return failure('closedSession');
    if (this.prompt === 'placement')
      return pickPoint ? this.acceptPoint(pickPoint) : failure('point');
    if (this.prompt === 'selectSecondLine') {
      const line = dimensionLineSelection(entity, pickPoint);
      const center = this.firstLine && line ? lineIntersection(this.firstLine, line) : undefined;
      if (!line || !this.firstLine) return failure('selectLineOrArc');
      if (!center) return failure('parallelLines');
      const farEnd = (value: CadLine): CadPoint =>
        dimensionDistance(center, value.a) > dimensionDistance(center, value.b) ? value.a : value.b;
      this.points.splice(
        0,
        this.points.length,
        center,
        { ...farEnd(this.firstLine) },
        { ...farEnd(line) },
      );
      this.twoLines = true;
    } else if (this.mode === 'angular') {
      const line = dimensionLineSelection(entity, pickPoint);
      if (line) {
        this.firstLine = line;
        this.prompt = 'selectSecondLine';
        this.notify();
        return { status: 'continue' };
      }
      if (entity.type !== 'circle' && entity.type !== 'arc') return failure('selectLineOrArc');
      this.points.splice(0, this.points.length, { ...entity.center });
      if (entity.type === 'circle') {
        if (pickPoint && dimensionDistance(entity.center, pickPoint) > epsilon) {
          this.points.push({ ...pickPoint });
          this.prompt = 'circleSecondPoint';
        } else this.prompt = 'circleFirstPoint';
        this.notify();
        return { status: 'continue' };
      }
      this.points.push(
        rim(entity.center, entity.radius, entity.startAngle),
        rim(entity.center, entity.radius, entity.endAngle),
      );
    } else if (
      this.mode === 'radial' ||
      (this.tool === 'DIM' && (entity.type === 'circle' || entity.type === 'arc'))
    ) {
      if (entity.type !== 'circle' && entity.type !== 'arc') return failure('selectCircle');
      this.mode = 'radial';
      this.radius = entity.radius;
      if (this.tool === 'DIM') this.radialKind = entity.type === 'circle' ? 'diameter' : 'radius';
      this.points.splice(0, this.points.length, { ...entity.center });
    } else {
      const line = dimensionLineSelection(entity, pickPoint);
      if (line) this.points.splice(0, this.points.length, { ...line.a }, { ...line.b });
      else if (entity.type === 'arc')
        this.points.splice(
          0,
          this.points.length,
          rim(entity.center, entity.radius, entity.startAngle),
          rim(entity.center, entity.radius, entity.endAngle),
        );
      else if (entity.type === 'circle') {
        const p = pickPoint ?? rim(entity.center, entity.radius, 0);
        const angle =
          this.tool === 'DIMALIGNED'
            ? Math.atan2(p.y - entity.center.y, p.x - entity.center.x)
            : Math.abs(p.y - entity.center.y) >= Math.abs(p.x - entity.center.x)
              ? 0
              : Math.PI / 2;
        this.points.splice(
          0,
          this.points.length,
          rim(entity.center, entity.radius, angle),
          rim(entity.center, entity.radius, angle + Math.PI),
        );
        if (this.tool !== 'DIMALIGNED') this.linearKind = angle === 0 ? 'horizontal' : 'vertical';
      } else return failure('selectDimensionObject');
    }
    this.prompt = 'placement';
    this.cursor = undefined;
    this.notify();
    return { status: 'continue' };
  }

  acceptText(input: string): DimensionInputResult {
    if (this.status !== 'active') return failure('closedSession');
    const text = input.trim();
    if (text === '\u001b') return this.cancel();
    if (this.prompt === 'text') {
      this.text = input.length ? input.slice(0, 2000) : undefined;
      this.prompt = 'placement';
      this.notify();
      return { status: 'continue' };
    }
    if (this.prompt === 'rotationAngle' || this.prompt === 'textAngle') {
      const angle = parseDraftNumber(text);
      if (angle === undefined) return failure('invalidAngle');
      if (this.prompt === 'rotationAngle') {
        this.axisAngle = (-angle * Math.PI) / 180;
        this.linearKind = 'horizontal';
      } else this.textRotation = (-angle * Math.PI) / 180;
      this.prompt = 'placement';
      this.notify();
      return { status: 'continue' };
    }
    if (!text) return this.finish();
    if (this.prompt === 'placement') {
      if (/^(T|TEXT)$/i.test(text)) return this.changePrompt('text');
      if (/^(A|ANGLE)$/i.test(text)) return this.changePrompt('textAngle');
      if (this.mode === 'linear' && this.linearKind !== 'aligned') {
        if (/^(H|HORIZONTAL)$/i.test(text)) {
          this.linearKind = 'horizontal';
          this.axisAngle = undefined;
          this.notify();
          return { status: 'continue' };
        }
        if (/^(V|VERTICAL)$/i.test(text)) {
          this.linearKind = 'vertical';
          this.axisAngle = undefined;
          this.notify();
          return { status: 'continue' };
        }
        if (/^(R|ROTATED)$/i.test(text)) return this.changePrompt('rotationAngle');
      }
    }
    if (this.tool === 'DIM' && this.prompt === 'selectObject' && /^(A|ANGULAR)$/i.test(text)) {
      this.mode = 'angular';
      return this.changePrompt('vertex');
    }
    const point = parseDraftPoint(text, this.points.at(-1));
    return point ? this.acceptPoint(point) : failure('point');
  }

  moveCursor(point: CadPoint, entity?: CadEntity): void {
    if (this.status !== 'active' || !validDraftPoint(point)) return;
    this.cursor = { ...point };
    this.hoverEntity = entity;
    this.notify();
  }

  finish(): DimensionInputResult {
    if (this.status !== 'active') return failure('closedSession');
    if (this.prompt === 'firstPoint') return this.changePrompt('selectObject');
    if (this.mode === 'angular' && this.prompt === 'selectObject')
      return this.changePrompt('vertex');
    return failure('needPoints');
  }
  cancel(): DimensionInputResult {
    if (this.status !== 'active') return failure('closedSession');
    this.status = 'cancelled';
    this.cursor = undefined;
    this.notify();
    return { status: 'cancelled' };
  }
  getSnapshot(): DimensionSnapshot {
    const inputMode =
      this.prompt === 'text'
        ? 'text'
        : this.prompt === 'textAngle' || this.prompt === 'rotationAngle'
          ? 'number'
          : this.prompt === 'selectObject' || this.prompt === 'selectSecondLine'
            ? 'entity'
            : 'point';
    return {
      tool: this.tool,
      mode: this.mode === 'linear' && this.linearKind === 'aligned' ? 'aligned' : this.mode,
      status: this.status,
      prompt: this.prompt,
      inputMode,
      points: this.points.map((point) => ({ ...point })),
      preview: this.preview(),
      canClose: false,
    };
  }

  private build(placement: CadPoint, preview = false): CadDimension | undefined {
    const [a, b, c] = this.points;
    if (!a) return undefined;
    const id = preview ? 'preview-dimension' : undefined;
    const entity =
      this.mode === 'radial'
        ? radialDimension(this.settings, this.radialKind, a, this.radius, placement, id)
        : this.mode === 'angular'
          ? b && c
            ? angularDimension(this.settings, a, b, c, placement, this.twoLines, id)
            : undefined
          : b
            ? linearDimension(
                this.settings,
                this.linearKind ?? automaticLinearKind(a, b, placement),
                a,
                b,
                placement,
                this.axisAngle,
                id,
              )
            : undefined;
    return entity
      ? {
          ...entity,
          ...(this.text === undefined ? {} : { text: this.text }),
          ...(this.textRotation === undefined ? {} : { textRotation: this.textRotation }),
        }
      : undefined;
  }
  private preview(): CadEntity[] {
    if (this.status !== 'active' || !this.cursor) return [];
    if (
      this.prompt === 'placement' ||
      this.prompt === 'text' ||
      this.prompt === 'textAngle' ||
      this.prompt === 'rotationAngle'
    ) {
      const entity = this.build(this.cursor, true);
      return entity ? [entity] : [];
    }
    if (this.tool !== 'DIM' || this.prompt !== 'selectObject' || !this.hoverEntity) return [];
    const entity = this.hoverEntity;
    if (entity.type === 'circle' || entity.type === 'arc') {
      const preview = radialDimension(
        this.settings,
        entity.type === 'circle' ? 'diameter' : 'radius',
        entity.center,
        entity.radius,
        this.cursor,
        'preview-dimension',
      );
      return preview ? [preview] : [];
    }
    const line = dimensionLineSelection(entity, this.cursor);
    if (!line) return [];
    const placement = {
      x: this.cursor.x,
      y: this.cursor.y - Math.max(10, this.settings.dimTextSize * this.settings.dimScale * 4),
    };
    const preview = linearDimension(
      this.settings,
      automaticLinearKind(line.a, line.b, placement),
      line.a,
      line.b,
      placement,
      undefined,
      'preview-dimension',
    );
    return preview ? [preview] : [];
  }
  private changePrompt(prompt: DimensionPrompt): DimensionInputResult {
    this.prompt = prompt;
    this.notify();
    return { status: 'continue' };
  }
  private notify(): void {
    this.options.onChange?.(this.getSnapshot());
  }
}
function rim(center: CadPoint, radius: number, angle: number): CadPoint {
  return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
}
