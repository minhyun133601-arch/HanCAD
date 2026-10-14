import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import { parseDraftNumber, parseDraftPoint, validDraftPoint } from './coordinates';
import { editableSelection, translateCadEntities } from './selection';

export type ModifyTool = 'MOVE' | 'COPY';
export type ModifyPrompt =
  'selectObjects' | 'modifyBasePoint' | 'modifySecondPoint' | 'copyNextPoint';
export interface ModifySnapshot {
  tool: ModifyTool;
  prompt: ModifyPrompt;
  preview: readonly CadEntity[];
  needsPoint: boolean;
}

/** The session owns provisional geometry. Its consumer commits the final displacement once. */
export class ModifySession {
  private entities: CadEntity[] = [];
  private ids: string[] = [];
  private base: CadPoint | undefined;
  private cursor: CadPoint | undefined;
  private placed = false;
  private copies: CadPoint[] = [];
  constructor(readonly tool: ModifyTool) {}

  select(state: LegacyCadState, ids: readonly string[]): boolean {
    this.entities = editableSelection(state, ids);
    this.ids = this.entities.map((entity) => entity.id);
    return this.entities.length > 0;
  }
  getIds(): string[] {
    return [...this.ids];
  }
  getSnapshot(): ModifySnapshot {
    return {
      tool: this.tool,
      prompt: !this.entities.length
        ? 'selectObjects'
        : !this.base
          ? 'modifyBasePoint'
          : this.placed
            ? 'copyNextPoint'
            : 'modifySecondPoint',
      needsPoint: this.entities.length > 0,
      preview: [
        ...this.copies.flatMap((delta) => translateCadEntities(this.entities, delta)),
        ...(this.base && this.cursor
          ? translateCadEntities(this.entities, {
              x: this.cursor.x - this.base.x,
              y: this.cursor.y - this.base.y,
            })
          : []),
      ],
    };
  }
  moveCursor(point: CadPoint, ortho: boolean, snapped = false): void {
    if (validDraftPoint(point)) this.cursor = this.constrain(point, ortho && !snapped);
  }
  acceptPoint(point: CadPoint, ortho = false, snapped = false): CadPoint | undefined {
    if (!validDraftPoint(point) || !this.entities.length) return;
    if (!this.base) {
      this.base = { ...point };
      this.cursor = undefined;
      return;
    }
    const target = this.constrain(point, ortho && !snapped);
    const delta = { x: target.x - this.base.x, y: target.y - this.base.y };
    this.placed = true;
    if (this.tool === 'COPY') this.copies.push(delta);
    this.cursor = undefined;
    return delta;
  }
  acceptText(value: string): { delta?: CadPoint; error?: boolean; finish?: boolean } {
    if (this.placed && /^(E|EXIT)$/i.test(value.trim())) return { finish: true };
    if (!value.trim() && this.base) {
      if (this.placed) return { finish: true };
      const delta = this.acceptPoint({ x: this.base.x * 2, y: this.base.y * 2 });
      return delta ? { delta } : { error: true };
    }
    let point = parseDraftPoint(value, this.base);
    const distance = parseDraftNumber(value);
    if (!point && distance !== undefined && distance >= 0 && this.base && this.cursor) {
      const dx = this.cursor.x - this.base.x,
        dy = this.cursor.y - this.base.y;
      const length = Math.hypot(dx, dy);
      if (length)
        point = {
          x: this.base.x + (dx / length) * distance,
          y: this.base.y + (dy / length) * distance,
        };
    }
    if (!point) return { error: true };
    const hadBase = this.base !== undefined;
    const delta = this.acceptPoint(point);
    return hadBase && !delta ? { error: true } : delta ? { delta } : {};
  }
  private constrain(point: CadPoint, ortho: boolean): CadPoint {
    if (!this.base || !ortho) return { ...point };
    return Math.abs(point.x - this.base.x) >= Math.abs(point.y - this.base.y)
      ? { x: point.x, y: this.base.y }
      : { x: this.base.x, y: point.y };
  }
}
