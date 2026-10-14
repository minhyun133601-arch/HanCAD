import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import { CAD_ENTITY_LIMIT } from '@hancad/legacy-bridge';
import { parseDraftNumber, parseDraftPoint, validDraftPoint } from './coordinates';
import { draftLine } from './entities';
import { offsetCadEntity, offsetEntityError } from './offset-geometry';
import type {
  OffsetError,
  OffsetPrompt,
  OffsetResult,
  OffsetSessionOptions,
  OffsetSnapshot,
} from './offset-types';

interface OffsetHistory {
  createdId: string;
  source: CadEntity;
  sourceIndex: number;
  erased: boolean;
}
const failure = (error: OffsetError): OffsetResult => ({ error });

/** Accepted offsets stay in a shadow drawing until the caller commits the completed command once. */
export class OffsetSession {
  readonly tool = 'OFFSET';
  private state: LegacyCadState;
  private readonly history: OffsetHistory[] = [];
  private prompt: OffsetPrompt = 'offsetDistance';
  private status: OffsetSnapshot['status'] = 'active';
  private distance: number;
  private distanceBase: CadPoint | undefined;
  private cursor: CadPoint | undefined;
  private source: CadEntity | undefined;
  private eraseSource = false;
  private layerMode: OffsetSnapshot['layerMode'] = 'Source';
  private multiple = false;

  constructor(
    state: LegacyCadState,
    private readonly options: OffsetSessionOptions,
  ) {
    this.state = { ...state, selectedIds: [] };
    this.distance = Number.isFinite(options.distance) ? options.distance : -1;
  }

  getSnapshot(): OffsetSnapshot {
    return {
      tool: this.tool,
      prompt: this.prompt,
      status: this.status,
      inputMode:
        this.prompt === 'offsetSelect'
          ? 'entity'
          : this.prompt === 'offsetDistance'
            ? 'number'
            : this.prompt === 'offsetErase' || this.prompt === 'offsetLayer'
              ? 'keyword'
              : 'point',
      state: this.state,
      changed: this.history.length > 0,
      preview: this.preview(),
      distance: this.distance,
      through: this.distance < 0,
      eraseSource: this.eraseSource,
      layerMode: this.layerMode,
      multiple: this.multiple,
    };
  }

  moveCursor(point: CadPoint, _entity?: CadEntity, _shift = false): void {
    if (this.status === 'active' && validDraftPoint(point)) this.cursor = { ...point };
  }

  acceptPick(point: CadPoint, entity?: CadEntity, _shift = false): OffsetResult {
    if (this.status !== 'active') return failure('closedSession');
    if (!validDraftPoint(point)) return failure('point');
    if (this.prompt === 'offsetDistance') {
      this.distanceBase = { ...point };
      this.cursor = undefined;
      this.prompt = 'offsetSecondPoint';
      return {};
    }
    if (this.prompt === 'offsetSecondPoint') {
      if (!this.distanceBase) return failure('point');
      const distance = Math.hypot(point.x - this.distanceBase.x, point.y - this.distanceBase.y);
      return this.setDistance(distance);
    }
    if (this.prompt === 'offsetSelect') {
      const source = entity && this.state.entities.find((item) => item.id === entity.id);
      if (!source) return failure('selectOffsetObject');
      const layer = this.state.layers.find((item) => item.name === source.layer);
      if (layer && (!layer.visible || layer.locked)) return failure('lockedEntity');
      const error = offsetEntityError(source, this.options.gapType);
      if (error) return failure(error);
      this.source = source;
      this.cursor = undefined;
      this.prompt = this.distance < 0 ? 'offsetThrough' : 'offsetSide';
      return {};
    }
    if ((this.prompt !== 'offsetSide' && this.prompt !== 'offsetThrough') || !this.source)
      return failure('invalidOption');
    if (!this.eraseSource && this.state.entities.length >= CAD_ENTITY_LIMIT)
      return failure('entityLimit');
    const source = this.source;
    const result = this.build(source, point, `offset-${crypto.randomUUID()}`);
    if ('error' in result) return failure(result.error);
    const sourceIndex = this.state.entities.findIndex((item) => item.id === source.id);
    this.history.push({
      source,
      sourceIndex,
      createdId: result.entity.id,
      erased: this.eraseSource,
    });
    this.state = {
      ...this.state,
      entities: [
        ...this.state.entities.filter((item) => !this.eraseSource || item.id !== source.id),
        result.entity,
      ],
    };
    this.cursor = undefined;
    this.source = this.multiple ? result.entity : undefined;
    if (!this.multiple) this.prompt = 'offsetSelect';
    return {};
  }

  acceptText(input: string): OffsetResult {
    if (this.status !== 'active') return failure('closedSession');
    const value = input.trim().replace(/^_/, '').toUpperCase();
    if (value === '\u001b') return this.cancel();
    if (this.prompt === 'offsetErase') {
      if (value && !/^(Y|YES|N|NO)$/.test(value)) return failure('invalidOption');
      if (value) this.eraseSource = /^(Y|YES)$/.test(value);
      this.prompt = 'offsetDistance';
      return {};
    }
    if (this.prompt === 'offsetLayer') {
      if (value && !/^(C|CURRENT|S|SOURCE)$/.test(value)) return failure('invalidOption');
      if (value) this.layerMode = /^(C|CURRENT)$/.test(value) ? 'Current' : 'Source';
      this.prompt = 'offsetDistance';
      return {};
    }
    if (this.prompt === 'offsetDistance') {
      if (/^(T|THROUGH)$/.test(value)) return this.setDistance(-1);
      if (/^(E|ERASE)$/.test(value)) {
        this.prompt = 'offsetErase';
        return {};
      }
      if (/^(L|LAYER)$/.test(value)) {
        this.prompt = 'offsetLayer';
        return {};
      }
      if (!value)
        return this.distance === 0 ? failure('positiveDistance') : this.setDistance(this.distance);
      const number = parseDraftNumber(value);
      if (number !== undefined)
        return number > 0 ? this.setDistance(number) : failure('positiveDistance');
    } else if (this.prompt !== 'offsetSecondPoint') {
      if (/^(E|EXIT)$/.test(value)) return this.finish();
      if (/^(U|UNDO)$/.test(value)) return this.undo();
      if (/^(M|MULTIPLE)$/.test(value) && this.source) {
        this.multiple = true;
        return {};
      }
      if (!value) {
        if (this.multiple && this.source) {
          this.source = undefined;
          this.cursor = undefined;
          this.prompt = 'offsetSelect';
          return {};
        }
        return this.finish();
      }
    }
    const point = parseDraftPoint(input, this.distanceBase);
    if (point) return this.acceptPick(point);
    const number = parseDraftNumber(value);
    if (number !== undefined && this.prompt === 'offsetSecondPoint')
      return number > 0 ? this.setDistance(number) : failure('positiveDistance');
    return failure(this.prompt === 'offsetSelect' ? 'selectOffsetObject' : 'point');
  }

  finish(): OffsetResult {
    if (this.status !== 'active') return failure('closedSession');
    this.status = 'finished';
    this.cursor = undefined;
    this.source = undefined;
    return { finish: true };
  }
  cancel(): OffsetResult {
    if (this.status !== 'active') return failure('closedSession');
    this.status = 'cancelled';
    this.cursor = undefined;
    this.source = undefined;
    return { finish: true };
  }

  private setDistance(distance: number): OffsetResult {
    if (!Number.isFinite(distance) || distance === 0 || (distance > 0 && distance <= 1e-8))
      return failure('positiveDistance');
    this.distance = distance;
    this.options.onDistanceChange?.(distance);
    this.prompt = 'offsetSelect';
    this.cursor = undefined;
    this.distanceBase = undefined;
    return {};
  }
  private undo(): OffsetResult {
    const previous = this.history.pop();
    if (!previous) return failure('nothingToUndo');
    const entities = this.state.entities.filter((item) => item.id !== previous.createdId);
    if (previous.erased) entities.splice(previous.sourceIndex, 0, previous.source);
    this.state = { ...this.state, entities };
    this.cursor = undefined;
    this.source = this.multiple ? previous.source : undefined;
    this.prompt = this.source
      ? this.distance < 0
        ? 'offsetThrough'
        : 'offsetSide'
      : 'offsetSelect';
    return {};
  }
  private build(source: CadEntity, point: CadPoint, id: string) {
    return offsetCadEntity(source, {
      point,
      id,
      distance: this.distance,
      gapType: this.options.gapType,
      ...(this.layerMode === 'Current' ? { layer: this.state.settings.layer } : {}),
    });
  }
  private preview(): CadEntity[] {
    if (this.status !== 'active' || !this.cursor) return [];
    if (this.prompt === 'offsetSecondPoint' && this.distanceBase)
      return [
        draftLine(this.state.settings, this.distanceBase, this.cursor, 'preview-offset-distance'),
      ];
    if (!this.source || (this.prompt !== 'offsetSide' && this.prompt !== 'offsetThrough'))
      return [];
    const result = this.build(this.source, this.cursor, 'preview-offset');
    return 'entity' in result ? [result.entity] : [];
  }
}
