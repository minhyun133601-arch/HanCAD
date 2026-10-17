import type {
  CadClipboardBlock,
  CadEntity,
  CadGroup,
  CadPoint,
  LegacyCadState,
} from '@hancad/legacy-bridge';
import { parseDraftAngle, parseDraftNumber, validDraftPoint } from './coordinates';
import { editableSelection } from './selection';
import { PointInputController, pointInputPrompt } from './point-input';
import { gripPointInputContext } from './grip-point-input';
import { gripDimensionCursorContext } from './grip-dimensions';
import { applyGripAction } from './grip-actions';
import { gripProvider } from './grip-providers';
import { gripPrompt } from './grip-prompts';
import type { GripStage } from './grip-prompts';
import { transformGripEntity } from './grip-transform';
import { gripModes } from './grip-types';
import { updatedGripBlocks } from './grip-blocks';
import type { GripOperation } from './grip-blocks';
import { copyCadGroups } from './selection-rules';
import type {
  EntityGrip,
  GripAction,
  GripMode,
  GripResult,
  GripSessionOptions,
  GripSnapshot,
} from './grip-types';

/** A grip interaction owns all previews/copies and publishes only one final journal state. */
export class GripSession {
  private readonly source: CadEntity[];
  private mode: GripMode = 'STRETCH';
  private base: CadPoint;
  private cursor: CadPoint | undefined;
  private stage: GripStage = 'target';
  private copying = false;
  private readonly accepted: CadEntity[][] = [];
  private readonly acceptedBlocks: CadClipboardBlock[][] = [];
  private readonly acceptedGroups: CadGroup[][] = [];
  private replacementBlocks: CadClipboardBlock[] = [];
  private operation: GripOperation | undefined;
  private replacement: CadEntity[] | undefined;
  private readonly pointInput: PointInputController;
  private reference = 1;
  private referenceFirst: CadPoint | undefined;
  private action: GripAction | undefined;
  private readonly initial: LegacyCadState;
  constructor(
    state: LegacyCadState,
    ids: readonly string[],
    private readonly hot: readonly EntityGrip[],
    private readonly anchor: EntityGrip,
    private readonly options: GripSessionOptions = {},
  ) {
    this.initial = state;
    this.source = structuredClone(editableSelection(state, ids));
    this.base = { ...anchor.point };
    this.pointInput = new PointInputController({
      ...(options.onSnapOverride ? { onSnapOverride: options.onSnapOverride } : {}),
    });
  }
  getSnapshot(korean = true): GripSnapshot {
    const input = this.pointInput.getState();
    const pending =
      this.cursor &&
      !input.sourcePoint &&
      (this.stage === 'target' || this.stage === 'new-reference')
        ? this.editAt(this.cursor)
        : [];
    return {
      mode: this.mode,
      basePoint: { ...(this.referenceFirst ?? this.base) },
      prompt:
        pointInputPrompt(input, korean ? 'ko-KR' : 'en-US') ??
        (this.action && this.action !== 'stretch'
          ? korean
            ? '새 점 지정:'
            : 'Specify new point:'
          : gripPrompt(this.mode, this.stage, korean)),
      preview: [...this.accepted.flat(), ...(this.replacement ?? pending)],
      previewHiddenIds: this.copying ? [] : pending.map((entity) => entity.id),
      needsPoint: true,
      inputMode:
        !this.action &&
        input.stage === 'point' &&
        (this.mode === 'SCALE' || this.mode === 'ROTATE') &&
        this.stage !== 'base' &&
        this.stage !== 'reference-second'
          ? 'number'
          : 'point',
      pointInput: {
        ...input,
        sourcePoint: input.sourcePoint || this.stage === 'base' || this.stage === 'reference',
      },
      copy: this.copying,
      changed: this.accepted.length > 0 || this.replacement !== undefined,
    };
  }
  cycle(): void {
    this.mode = gripModes[(gripModes.indexOf(this.mode) + 1) % gripModes.length]!;
    this.stage = 'target';
    this.action = undefined;
    this.operation = undefined;
    this.cursor = undefined;
    this.pointInput.reset();
  }
  getAnchor(): EntityGrip {
    return this.anchor;
  }
  getSnapEntities(): readonly CadEntity[] {
    return this.accepted.flat();
  }
  getDynamicContext() {
    if (
      this.mode !== 'STRETCH' ||
      this.stage !== 'target' ||
      this.pointInput.getState().stage !== 'point' ||
      (this.action && this.action !== 'stretch')
    )
      return;
    return gripDimensionCursorContext(this.source, this.hot, this.anchor, this.base, this.cursor);
  }
  setMode(mode: GripMode): void {
    this.mode = mode;
    this.stage = 'target';
    this.action = undefined;
    this.operation = undefined;
    this.cursor = undefined;
    this.pointInput.reset();
  }
  setAction(action: GripAction): GripResult {
    this.operation = undefined;
    if (!this.anchor.actions.includes(action)) return { error: true };
    if (action === 'removeVertex' || action === 'convertLine') {
      const source = this.source.find((entity) => entity.id === this.anchor.entityId);
      const result = source && applyGripAction(source, this.anchor, action);
      if (!result) return { error: true };
      this.replacement = [result];
      return { accepted: true, finish: true };
    }
    this.action = action;
    this.mode = 'STRETCH';
    return {};
  }
  cycleAction(): GripResult {
    if (this.mode !== 'STRETCH') return {};
    const index = this.anchor.actions.indexOf(this.action ?? 'stretch');
    this.action = this.anchor.actions[(index + 1) % this.anchor.actions.length];
    this.mode = 'STRETCH';
    this.cursor = undefined;
    return {};
  }
  moveCursor(point: CadPoint): void {
    if (validDraftPoint(point)) this.cursor = this.pointInput.project(point, this.context());
  }
  acceptPoint(point: CadPoint): GripResult {
    const context = this.context();
    const result = this.pointInput.acceptPoint(this.pointInput.project(point, context), context);
    if (result.kind === 'invalid') return { error: true };
    if (result.kind === 'continue') return {};
    return this.acceptResolvedPoint(result.point);
  }
  acceptText(input: string, source: 'interactive' | 'script' = 'interactive'): GripResult {
    const text = input.trim().replace(/^_+/, '').toUpperCase();
    const pointStage = this.pointInput.getState().stage;
    if (!text && pointStage === 'tracking-next') {
      const result = this.pointInput.acceptText('', this.context(source));
      return result.kind === 'point' ? this.acceptResolvedPoint(result.point) : {};
    }
    if (text === '@' && (this.stage === 'reference' || this.stage === 'base'))
      return this.acceptResolvedPoint(this.base);
    if (!text && this.stage === 'target' && pointStage === 'point') {
      this.cycle();
      return {};
    }
    if (/^(X|EXIT)$/.test(text)) return { finish: true };
    if (this.stage === 'target' && pointStage === 'point') {
      if (/^(B|BASE|BASE POINT|BASEPOINT)$/.test(text)) {
        this.stage = 'base';
        this.pointInput.reset();
        return {};
      }
      if (/^(C|COPY)$/.test(text)) {
        this.copying = true;
        return {};
      }
      if (/^(U|UNDO)$/.test(text)) {
        this.accepted.pop();
        this.acceptedBlocks.pop();
        this.acceptedGroups.pop();
        this.replacement = undefined;
        this.replacementBlocks = [];
        return {};
      }
      if (/^(R|REFERENCE)$/.test(text) && (this.mode === 'SCALE' || this.mode === 'ROTATE')) {
        this.stage = 'reference';
        this.reference = this.mode === 'SCALE' ? 1 : 0;
        this.pointInput.reset();
        return {};
      }
    }
    const scalar =
      this.mode === 'ROTATE'
        ? parseDraftAngle(input, this.options.coordinates?.())
        : parseDraftNumber(input, this.options.coordinates?.());
    const anchorEntity = this.source.find((entity) => entity.id === this.anchor.entityId);
    if (
      scalar !== undefined &&
      pointStage === 'point' &&
      this.mode === 'STRETCH' &&
      this.stage === 'target'
    ) {
      this.operation = undefined;
      if (scalar <= 0 && (this.anchor.kind === 'quadrant' || this.action === 'lengthen'))
        return { error: true };
      if (anchorEntity?.type === 'circle' && this.anchor.kind === 'quadrant' && !this.action)
        return this.place([{ ...anchorEntity, radius: scalar }]);
      if (anchorEntity?.type === 'line' && this.action === 'lengthen') {
        const origin = this.anchor.key === 'a' ? anchorEntity.b : anchorEntity.a;
        const end = this.anchor.key === 'a' ? anchorEntity.a : anchorEntity.b;
        const length = Math.hypot(end.x - origin.x, end.y - origin.y);
        if (length <= 1e-12) return { error: true };
        const target = {
          x: origin.x + ((end.x - origin.x) * scalar) / length,
          y: origin.y + ((end.y - origin.y) * scalar) / length,
        };
        const result = applyGripAction(anchorEntity, this.anchor, 'lengthen', target);
        return result ? this.place([result]) : { error: true };
      }
    }
    if (
      !this.action &&
      pointStage === 'point' &&
      (this.mode === 'SCALE' || this.mode === 'ROTATE') &&
      this.stage !== 'base' &&
      this.stage !== 'reference-second' &&
      (scalar !== undefined || (!text && this.stage === 'reference'))
    ) {
      const value = scalar ?? (this.mode === 'SCALE' ? 1 : 0);
      if (this.mode === 'SCALE' && value <= 0) return { error: true };
      if (this.stage === 'reference') {
        this.reference = this.mode === 'ROTATE' ? -value : value;
        this.stage = 'new-reference';
        return {};
      }
      const parameter =
        this.mode === 'ROTATE'
          ? -value - (this.stage === 'new-reference' ? this.reference : 0)
          : value / (this.stage === 'new-reference' ? this.reference : 1);
      return this.place(this.edit(parameter));
    }
    const result = this.pointInput.acceptText(input, this.context(source));
    if (result.kind === 'invalid') return { error: true };
    if (result.kind === 'continue') return {};
    return this.acceptResolvedPoint(result.point);
  }
  getResult(): LegacyCadState {
    const changes = new Map(this.replacement?.map((entity) => [entity.id, entity]) ?? []);
    return {
      ...this.initial,
      entities: [
        ...this.initial.entities.map((entity) => changes.get(entity.id) ?? entity),
        ...this.accepted.flat(),
      ],
      selectedIds: [],
      ...(this.initial.groups || this.acceptedGroups.length
        ? { groups: [...(this.initial.groups ?? []), ...this.acceptedGroups.flat()] }
        : {}),
      ...(this.initial.clipboardBlocks || this.acceptedBlocks.length
        ? {
            clipboardBlocks: [
              ...(this.initial.clipboardBlocks ?? []).map(
                (block) =>
                  this.replacementBlocks.find((changed) => changed.name === block.name) ?? block,
              ),
              ...this.acceptedBlocks.flat(),
            ],
          }
        : {}),
    };
  }
  private context(source: 'interactive' | 'script' = 'interactive') {
    return gripPointInputContext(
      this.referenceFirst ?? this.base,
      this.cursor,
      this.options,
      source,
    );
  }
  private acceptResolvedPoint(point: CadPoint): GripResult {
    if (!validDraftPoint(point)) return { error: true };
    this.options.onAcceptedPoint?.(point);
    if (this.stage === 'base') {
      this.base = { ...point };
      this.stage = 'target';
      this.cursor = undefined;
      return { accepted: true };
    }
    if (this.stage === 'reference') {
      this.referenceFirst = { ...point };
      this.stage = 'reference-second';
      return { accepted: true };
    }
    if (this.stage === 'reference-second' && this.referenceFirst) {
      const dx = point.x - this.referenceFirst.x,
        dy = point.y - this.referenceFirst.y;
      if (Math.hypot(dx, dy) < 1e-12) return { error: true };
      this.reference = this.mode === 'SCALE' ? Math.hypot(dx, dy) : Math.atan2(dy, dx);
      this.referenceFirst = undefined;
      this.stage = 'new-reference';
      return { accepted: true };
    }
    return this.place(this.editAt(point));
  }
  private editAt(point: CadPoint): CadEntity[] {
    this.operation = undefined;
    const dx = point.x - this.base.x,
      dy = point.y - this.base.y;
    if (this.action && this.action !== 'stretch') {
      const source = this.source.find((entity) => entity.id === this.anchor.entityId);
      const target = {
        x: this.anchor.point.x + dx,
        y: this.anchor.point.y + dy,
        ...(point.z === undefined ? {} : { z: point.z }),
      };
      const result = source && applyGripAction(source, this.anchor, this.action, target);
      return result ? [result] : [];
    }
    const parameter =
      this.mode === 'ROTATE'
        ? Math.atan2(dy, dx) - (this.stage === 'new-reference' ? this.reference : 0)
        : this.mode === 'SCALE'
          ? Math.hypot(dx, dy) / (this.stage === 'new-reference' ? this.reference : 1)
          : this.mode === 'MIRROR'
            ? point
            : {
                x: dx,
                y: dy,
                ...(point.z === undefined && this.base.z === undefined
                  ? {}
                  : { z: (point.z ?? 0) - (this.base.z ?? 0) }),
              };
    return this.edit(parameter);
  }
  private edit(parameter: number | CadPoint): CadEntity[] {
    if (
      typeof parameter === 'number' &&
      (!Number.isFinite(parameter) || (this.mode === 'SCALE' && parameter <= 1e-12))
    )
      return [];
    this.operation = { mode: this.mode, base: { ...this.base }, value: parameter };
    return this.source.flatMap((entity) => {
      if (this.mode !== 'STRETCH')
        return [
          transformGripEntity(entity, this.mode, this.base, parameter, this.options.mirrorText?.()),
        ];
      const keys = this.hot.filter((grip) => grip.entityId === entity.id).map((grip) => grip.key);
      if (
        typeof parameter !== 'number' &&
        this.hot.some((grip) => grip.entityIds?.includes(entity.id))
      )
        return [transformGripEntity(entity, 'MOVE', this.base, parameter)];
      return keys.length && typeof parameter !== 'number'
        ? [gripProvider(entity).stretch(entity, keys, parameter)]
        : [];
    });
  }
  private place(entities: CadEntity[]): GripResult {
    if (!entities.length) return { error: true };
    if (this.copying) {
      const copies = entities.map((entity) => ({ ...entity, id: `grip-${crypto.randomUUID()}` }));
      this.accepted.push(copies);
      const remap = new Map(entities.map((entity, index) => [entity.id, copies[index]!.id]));
      const groups = [...(this.initial.groups ?? []), ...this.acceptedGroups.flat()];
      this.acceptedGroups.push(
        copyCadGroups(
          { ...this.initial, groups },
          remap,
          this.options.copyGroups?.() ?? true,
        ).slice(groups.length),
      );
      this.acceptedBlocks.push(
        updatedGripBlocks(this.initial, remap, this.hot, this.operation, true),
      );
      this.cursor = undefined;
      this.stage = 'target';
      return { accepted: true };
    }
    this.replacement = entities;
    this.replacementBlocks = updatedGripBlocks(
      this.initial,
      new Map(entities.map((entity) => [entity.id, entity.id])),
      this.hot,
      this.operation,
    );
    return { accepted: true, finish: true };
  }
}
