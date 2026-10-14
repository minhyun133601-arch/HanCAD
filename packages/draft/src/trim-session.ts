import type { CadEntity, CadLine, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import { CAD_ENTITY_LIMIT } from '@hancad/legacy-bridge';
import { validDraftPoint } from './coordinates';
import { lineBoundaryParameters, linePoint, trimExtendLine } from './trim-geometry';
import type { TrimExtendTool } from './trim-geometry';

export type TrimPrompt = 'trimBoundary' | 'trimTarget' | 'trimMode' | 'trimEdge';
export interface TrimSnapshot {
  tool: TrimExtendTool;
  prompt: TrimPrompt;
  inputMode: 'entity' | 'keyword';
  state: LegacyCadState;
  preview: readonly CadEntity[];
  previewHiddenIds: readonly string[];
  boundaryIds: readonly string[];
  changed: boolean;
  mode: 0 | 1;
  edgeMode: 0 | 1;
}
export interface TrimResult {
  error?: 'locked' | 'unsupported' | 'noIntersection' | 'input' | 'closed' | 'entityLimit';
  changed?: boolean;
  finish?: boolean;
  mode?: 0 | 1;
  edgeMode?: 0 | 1;
}

/** Owns accepted provisional edits; consumers commit finish/cancel once to shared history. */
export class TrimExtendSession {
  private state: LegacyCadState;
  private history: LegacyCadState[] = [];
  private boundaryIds = new Set<string>();
  private allBoundaries: boolean;
  private prompt: TrimPrompt;
  private previousPrompt: TrimPrompt = 'trimTarget';
  private preview: CadEntity[] = [];
  private previewHiddenIds: string[] = [];
  private closed = false;
  private mode: 0 | 1;
  private edgeMode: 0 | 1;

  constructor(
    readonly tool: TrimExtendTool,
    state: LegacyCadState,
    options: { mode?: 0 | 1; edgeMode?: 0 | 1 } = {},
  ) {
    this.state = { ...state, entities: [...state.entities], selectedIds: [] };
    this.mode = options.mode ?? 1;
    this.edgeMode = options.edgeMode ?? 0;
    this.allBoundaries = this.mode === 1;
    this.prompt = this.mode ? 'trimTarget' : 'trimBoundary';
  }

  /** The owned shadow state is exposed for rendering and must be treated as immutable. */
  getSnapshot(): TrimSnapshot {
    return {
      tool: this.tool,
      prompt: this.prompt,
      inputMode: this.prompt === 'trimMode' || this.prompt === 'trimEdge' ? 'keyword' : 'entity',
      state: this.state,
      preview: this.preview,
      previewHiddenIds: this.previewHiddenIds,
      boundaryIds: [...this.boundaryIds],
      changed: this.history.length > 0,
      mode: this.mode,
      edgeMode: this.edgeMode,
    };
  }

  acceptPick(point: CadPoint, entity?: CadEntity | null, shift = false): TrimResult {
    this.preview = [];
    this.previewHiddenIds = [];
    if (this.closed) return { error: 'closed' };
    if (!validDraftPoint(point)) return { error: 'input' };
    const current = entity && this.state.entities.find((e) => e.id === entity.id);
    if (!current) return {};
    if (!this.visible(current)) return { error: 'locked' };
    if (this.prompt === 'trimBoundary') {
      if (!this.isBoundary(current)) return { error: 'unsupported' };
      this.boundaryIds.add(current.id);
      return {};
    }
    if (this.prompt !== 'trimTarget') return { error: 'input' };
    if (this.state.layers.some((l) => l.name === current.layer && l.locked))
      return { error: 'locked' };
    if (current.type !== 'line') return { error: 'unsupported' };
    const replacements = this.calculate(current, point, shift);
    if (!replacements) return { error: 'noIntersection' };
    if (this.state.entities.length - 1 + replacements.length > CAD_ENTITY_LIMIT)
      return { error: 'entityLimit' };
    this.apply(current, replacements);
    return { changed: true };
  }

  moveCursor(point: CadPoint, entity?: CadEntity | null, shift = false): void {
    this.preview = [];
    this.previewHiddenIds = [];
    if (this.closed || this.prompt !== 'trimTarget' || !entity || !validDraftPoint(point)) return;
    const current = this.state.entities.find((e) => e.id === entity.id);
    if (
      !current ||
      current.type !== 'line' ||
      !this.visible(current) ||
      this.state.layers.some((l) => l.name === current.layer && l.locked)
    )
      return;
    const result = this.calculate(current, point, shift);
    if (result && this.state.entities.length - 1 + result.length <= CAD_ENTITY_LIMIT) {
      this.preview = result;
      this.previewHiddenIds = [current.id];
    }
  }

  /** A fence acts on each crossed original LINE once and is one command-local Undo step. */
  acceptFence(points: readonly CadPoint[], shift = false): TrimResult {
    this.preview = [];
    this.previewHiddenIds = [];
    if (this.closed) return { error: 'closed' };
    if (this.prompt !== 'trimTarget' || points.length < 2 || !points.every(validDraftPoint))
      return { error: 'input' };
    const hits: { entity: CadLine; point: CadPoint; order: number }[] = [];
    for (const entity of this.state.entities) {
      if (entity.type !== 'line' || !this.visible(entity)) continue;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i];
        if (!a || !b) continue;
        const parameters = lineBoundaryParameters(entity, { ...entity, id: 'fence', a, b });
        const t = parameters.find((t) => t >= 0 && t <= 1);
        if (t === undefined) continue;
        const point = linePoint(entity, t);
        const along = Math.hypot(point.x - a.x, point.y - a.y) / Math.hypot(b.x - a.x, b.y - a.y);
        hits.push({ entity, point, order: i + along });
        break;
      }
    }
    const historyStart = this.history.length;
    const before = this.state;
    let capacityError = false;
    for (const hit of hits.sort((a, b) => a.order - b.order)) {
      const result = this.acceptPick(hit.point, hit.entity, shift);
      capacityError ||= result.error === 'entityLimit';
    }
    if (this.history.length === historyStart) return capacityError ? { error: 'entityLimit' } : {};
    this.history.splice(historyStart, this.history.length - historyStart, before);
    return { changed: true, ...(capacityError ? { error: 'entityLimit' as const } : {}) };
  }

  acceptText(value: string): TrimResult {
    this.preview = [];
    this.previewHiddenIds = [];
    if (this.closed) return { error: 'closed' };
    const text = value.trim().toUpperCase().replace(/^_/, '');
    if (this.prompt === 'trimMode') {
      const mode = /^(Q|QUICK)$/.test(text) ? 1 : /^(S|STANDARD)$/.test(text) ? 0 : undefined;
      if (mode === undefined) {
        if (!text) {
          this.prompt = this.previousPrompt;
          return {};
        }
        return { error: 'input' };
      }
      this.mode = mode;
      this.boundaryIds.clear();
      this.allBoundaries = mode === 1;
      this.prompt = mode ? 'trimTarget' : 'trimBoundary';
      return { mode };
    }
    if (this.prompt === 'trimEdge') {
      const edgeMode = /^(E|EXTEND)$/.test(text)
        ? 1
        : /^(N|NO|NOEXTEND)$/.test(text)
          ? 0
          : undefined;
      if (edgeMode === undefined && text) return { error: 'input' };
      if (edgeMode !== undefined) this.edgeMode = edgeMode;
      this.prompt = this.previousPrompt;
      return edgeMode === undefined ? {} : { edgeMode };
    }
    if (!text) {
      if (this.prompt === 'trimBoundary') {
        this.allBoundaries = this.boundaryIds.size === 0;
        this.prompt = 'trimTarget';
        return {};
      }
      return { finish: true };
    }
    if (/^(U|UNDO)$/.test(text)) {
      const previous = this.history.pop();
      if (previous) this.state = previous;
      return { changed: Boolean(previous) };
    }
    if (/^(O|MO|MODE)$/.test(text)) {
      this.previousPrompt = this.prompt;
      this.prompt = 'trimMode';
      return {};
    }
    if (/^(E|EDGE)$/.test(text)) {
      this.previousPrompt = this.prompt;
      this.prompt = 'trimEdge';
      return {};
    }
    if (/^(T|CUTTING|CUTTINGEDGES|B|BOUNDARY|BOUNDARIES)$/.test(text)) {
      this.prompt = 'trimBoundary';
      this.boundaryIds.clear();
      return {};
    }
    return { error: 'input' };
  }

  finish(): LegacyCadState | undefined {
    if (this.closed) return;
    this.closed = true;
    this.preview = [];
    this.previewHiddenIds = [];
    return this.history.length ? this.state : undefined;
  }
  cancel(): LegacyCadState | undefined {
    return this.finish();
  }

  private visible(entity: CadEntity): boolean {
    return !this.state.layers.some((l) => l.name === entity.layer && !l.visible);
  }
  private isBoundary(entity: CadEntity): boolean {
    return ['line', 'polyline', 'rect', 'circle', 'arc'].includes(entity.type);
  }
  private calculate(line: CadLine, point: CadPoint, shift: boolean): CadLine[] | undefined {
    const tool = shift ? (this.tool === 'TRIM' ? 'EXTEND' : 'TRIM') : this.tool;
    const boundaries = this.state.entities.filter(
      (e) => this.visible(e) && (this.allBoundaries || this.boundaryIds.has(e.id)),
    );
    return trimExtendLine(line, point, boundaries, tool, this.edgeMode === 1, this.mode === 1);
  }
  private apply(original: CadLine, replacements: CadLine[]): void {
    const fragments = replacements.map((entity, index) =>
      index ? { ...entity, id: `trim-${crypto.randomUUID()}` } : entity,
    );
    this.history.push(this.state);
    this.state = {
      ...this.state,
      entities: this.state.entities.flatMap((entity) =>
        entity.id === original.id ? fragments : [entity],
      ),
      selectedIds: [],
    };
  }
}
