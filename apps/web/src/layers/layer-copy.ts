import {
  coordinateSettings,
  PointInputController,
  pointInputPrompt,
  transformGripEntity,
} from '@hancad/draft';
import type { PointInputResult } from '@hancad/draft';
import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import type { LayerHost } from './layer-host';

/** COPYTOLAYER uses COPY's coordinate parser, sysvars and point-acquisition aids. */
export class LayerCopySession {
  readonly input = new PointInputController();
  private mode: 'base' | 'second' | 'displacement' = 'base';
  private base: CadPoint | undefined;
  private cursorPoint: CadPoint | undefined;
  private ids: readonly string[] = [];
  private target = '0';
  preview: CadEntity[] = [];
  constructor(
    private readonly host: () => LayerHost,
    private readonly changed: () => void,
    private readonly finish: (delta: CadPoint) => void,
  ) {}
  begin(ids: readonly string[], target: string): void {
    this.cancel();
    this.ids = ids;
    this.target = target;
  }
  cancel(): void {
    this.mode = 'base';
    this.base = undefined;
    this.cursorPoint = undefined;
    this.preview = [];
    this.input.reset();
  }
  private context() {
    return {
      ...(this.base ? { base: this.base } : {}),
      ...(this.cursorPoint ? { cursor: this.cursorPoint } : {}),
      settings: coordinateSettings((name) => this.host().sysvars.get(name)),
    };
  }
  private accept(result: PointInputResult): boolean {
    if (result.kind === 'invalid') {
      this.host().print(this.host().korean ? '점이 필요합니다.' : 'Point required.');
      return false;
    }
    if (result.kind === 'continue') {
      this.changed();
      return true;
    }
    if (this.mode === 'base') {
      this.base = result.point;
      this.mode = 'second';
      this.input.reset();
      this.changed();
    } else
      this.finish(
        this.mode === 'second' && this.base
          ? {
              x: result.point.x - this.base.x,
              y: result.point.y - this.base.y,
              z: (result.point.z ?? 0) - (this.base.z ?? 0),
            }
          : result.point,
      );
    return true;
  }
  submit(value: string): boolean {
    if (this.mode === 'base' && (!value.trim() || /^_?D(?:ISPLACEMENT)?$/i.test(value.trim()))) {
      this.mode = 'displacement';
      this.changed();
      return true;
    }
    if (this.mode === 'second' && !value.trim() && this.base) {
      this.finish(this.base);
      return true;
    }
    if (this.mode === 'displacement' && !value.trim()) {
      this.finish({ x: 0, y: 0, z: 0 });
      return true;
    }
    return this.accept(this.input.acceptText(value, this.context()));
  }
  pick(point: CadPoint): boolean {
    return this.accept(this.input.acceptPoint(point, this.context()));
  }
  cursor(point: CadPoint): void {
    this.cursorPoint = point;
    if (this.mode === 'base') return;
    const delta =
      this.mode === 'second' && this.base
        ? { x: point.x - this.base.x, y: point.y - this.base.y }
        : point;
    const wanted = new Set(this.ids);
    const host = this.host();
    const entities = host.getPreviewEntities?.() ?? host.getState().entities;
    this.preview = entities
      .filter((entity) => wanted.has(entity.id))
      .map((entity) => ({
        ...transformGripEntity(entity, 'MOVE', { x: 0, y: 0 }, delta),
        layer: this.target,
      }));
    this.changed();
  }
  get prompt(): string {
    const ko = this.host().korean;
    return (
      pointInputPrompt(this.input.getState(), ko ? 'ko-KR' : 'en-US') ??
      (this.mode === 'base'
        ? ko
          ? '기준점 지정 또는 [변위(D)] <변위>:'
          : 'Specify base point or [Displacement] <Displacement>:'
        : this.mode === 'second'
          ? ko
            ? '두 번째 점 지정 또는 <첫 번째 점을 변위로 사용>:'
            : 'Specify second point or <use first point as displacement>:'
          : ko
            ? '변위 지정 <0,0,0>:'
            : 'Specify displacement <0,0,0>:')
    );
  }
  getAidContext() {
    return {
      pointInput: this.input.getState(),
      ...(this.base ? { basePoint: this.base } : {}),
      trackingPoints: this.input.getState().trackingPoints,
    };
  }
}
