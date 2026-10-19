import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import { CAD_ENTITY_LIMIT } from '@hancad/legacy-bridge';
import { parseDraftPoint, validDraftPoint } from './coordinates';
import { editCurve } from './modify-curve-geometry';
import { trimExtendEntity } from './trim-curves';
import { trimFenceHits, trimCrossingHits } from './trim-selection-hits';
import { snapWcs } from './snap-types';
import { nearestSnapPoint, prepareSnapCurve } from './snap-curves';
import type { TrimExtendTool } from './trim-geometry';

export type TrimPrompt =
  | 'trimBoundary'
  | 'trimTarget'
  | 'trimMode'
  | 'trimEdge'
  | 'trimProject'
  | 'trimFence'
  | 'trimCrossFirst'
  | 'trimCrossSecond'
  | 'trimErase';
export interface TrimSnapshot {
  tool: TrimExtendTool;
  prompt: TrimPrompt;
  inputMode: 'entity' | 'keyword' | 'point';
  state: LegacyCadState;
  preview: readonly CadEntity[];
  previewHiddenIds: readonly string[];
  boundaryIds: readonly string[];
  changed: boolean;
  mode: 0 | 1;
  edgeMode: 0 | 1;
  project: 0 | 1 | 2;
}
export interface TrimResult {
  error?: 'locked' | 'unsupported' | 'noIntersection' | 'input' | 'closed' | 'entityLimit';
  changed?: boolean;
  finish?: boolean;
  mode?: 0 | 1;
  edgeMode?: 0 | 1;
  project?: 0 | 1 | 2;
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
  private project: 0 | 1 | 2;
  private fencePoints: CadPoint[] = [];
  private readonly extraBoundaries: readonly CadEntity[];

  constructor(
    readonly tool: TrimExtendTool,
    state: LegacyCadState,
    options: {
      mode?: 0 | 1;
      edgeMode?: 0 | 1;
      project?: 0 | 1 | 2;
      boundaries?: readonly CadEntity[];
    } = {},
  ) {
    this.state = { ...state, entities: [...state.entities], selectedIds: [] };
    this.mode = options.mode ?? 1;
    this.edgeMode = options.edgeMode ?? 0;
    this.project = options.project ?? 1;
    this.extraBoundaries = options.boundaries ?? [];
    this.allBoundaries = this.mode === 1;
    this.prompt = this.mode ? 'trimTarget' : 'trimBoundary';
  }

  /** The owned shadow state is exposed for rendering and must be treated as immutable. */
  getSnapshot(): TrimSnapshot {
    return {
      tool: this.tool,
      prompt: this.prompt,
      inputMode: ['trimMode', 'trimEdge', 'trimProject'].includes(this.prompt)
        ? 'keyword'
        : ['trimFence', 'trimCrossFirst', 'trimCrossSecond'].includes(this.prompt)
          ? 'point'
          : 'entity',
      state: this.state,
      preview: this.preview,
      previewHiddenIds: this.previewHiddenIds,
      boundaryIds: [...this.boundaryIds],
      changed: this.history.length > 0,
      mode: this.mode,
      edgeMode: this.edgeMode,
      project: this.project,
    };
  }

  acceptPick(point: CadPoint, entity?: CadEntity | null, shift = false): TrimResult {
    this.preview = [];
    this.previewHiddenIds = [];
    if (this.closed) return { error: 'closed' };
    if (!validDraftPoint(point)) return { error: 'input' };
    if (this.prompt === 'trimFence') {
      this.fencePoints.push({ ...point });
      return {};
    }
    if (this.prompt === 'trimCrossFirst') {
      this.fencePoints = [{ ...point }];
      this.prompt = 'trimCrossSecond';
      return {};
    }
    if (this.prompt === 'trimCrossSecond') {
      const start = this.fencePoints[0]!;
      this.prompt = 'trimTarget';
      this.fencePoints = [];
      return this.acceptCrossing(start, point, shift);
    }
    const current =
      entity &&
      (this.state.entities.find((e) => e.id === entity.id) ??
        this.extraBoundaries.find((e) => e.id === entity.id));
    if (!current) return {};
    if (!this.visible(current)) return { error: 'locked' };
    if (this.prompt === 'trimBoundary') {
      if (!this.isBoundary(current)) return { error: 'unsupported' };
      this.boundaryIds.add(current.id);
      return {};
    }
    if (this.prompt !== 'trimTarget' && this.prompt !== 'trimErase') return { error: 'input' };
    if (this.state.layers.some((l) => l.name === current.layer && l.locked))
      return { error: 'locked' };
    if (this.prompt === 'trimErase') {
      if (!this.state.entities.includes(current)) return { error: 'unsupported' };
      this.apply(current, []);
      return { changed: true };
    }
    if (!this.state.entities.includes(current) || !editCurve(current))
      return { error: 'unsupported' };
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
      !editCurve(current) ||
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

  /** Process intersections in physical fence order, including surviving fragments of one source. */
  acceptFence(points: readonly CadPoint[], shift = false): TrimResult {
    this.preview = [];
    this.previewHiddenIds = [];
    if (this.closed) return { error: 'closed' };
    if (this.prompt !== 'trimTarget' || points.length < 2 || !points.every(validDraftPoint))
      return { error: 'input' };
    const hits = trimFenceHits(this.state.entities, points, (entity) => this.visible(entity));
    const historyStart = this.history.length;
    const before = this.state;
    const fragments = new Map(hits.map((hit) => [hit.sourceId, new Set([hit.sourceId])]));
    let capacityError = false;
    for (const hit of hits.sort((a, b) => a.order - b.order)) {
      const family = fragments.get(hit.sourceId)!;
      const tolerance = Math.max(
        1e-7,
        Number.EPSILON * 64 * Math.max(Math.abs(hit.point.x), Math.abs(hit.point.y)),
      );
      const index = this.state.entities.findIndex((candidate) => {
        if (!family.has(candidate.id)) return false;
        const curve = editCurve(candidate);
        if (!curve) return false;
        const nearest = nearestSnapPoint(prepareSnapCurve(curve), snapWcs(hit.point)).point;
        return Math.hypot(nearest.x - hit.point.x, nearest.y + hit.point.y) <= tolerance;
      });
      const entity = this.state.entities[index];
      if (!entity) continue;
      const previousLength = this.state.entities.length;
      const result = this.acceptPick(hit.point, entity, shift);
      if (result.changed)
        for (let i = 0; i < this.state.entities.length - previousLength + 1; i++)
          family.add(this.state.entities[index + i]!.id);
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
    if (['trimFence', 'trimCrossFirst', 'trimCrossSecond'].includes(this.prompt)) {
      if (!text && this.prompt === 'trimFence') {
        const points = this.fencePoints;
        this.fencePoints = [];
        this.prompt = 'trimTarget';
        return points.length > 1 ? this.acceptFence(points) : {};
      }
      const point = parseDraftPoint(value, this.fencePoints.at(-1));
      return point ? this.acceptPick(point) : { error: 'input' };
    }
    if (this.prompt === 'trimProject') {
      const project = /^(N|NONE)$/.test(text)
        ? 0
        : /^(U|UCS)$/.test(text)
          ? 1
          : /^(V|VIEW)$/.test(text)
            ? 2
            : undefined;
      if (text && project === undefined) return { error: 'input' };
      if (project !== undefined) this.project = project;
      this.prompt = this.previousPrompt;
      return project === undefined ? {} : { project };
    }
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
      if (this.prompt === 'trimErase') {
        this.prompt = 'trimTarget';
        return {};
      }
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
    if (/^(P|PROJECT)$/.test(text)) {
      this.previousPrompt = this.prompt;
      this.prompt = 'trimProject';
      return {};
    }
    if (/^(F|FENCE)$/.test(text)) {
      this.fencePoints = [];
      this.prompt = 'trimFence';
      return {};
    }
    if (/^(C|CROSSING)$/.test(text)) {
      this.fencePoints = [];
      this.prompt = 'trimCrossFirst';
      return {};
    }
    if (/^(R|ERASE)$/.test(text)) {
      this.prompt = 'trimErase';
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
    return !!editCurve(entity);
  }
  private calculate(line: CadEntity, point: CadPoint, shift: boolean): CadEntity[] | undefined {
    const tool = shift ? (this.tool === 'TRIM' ? 'EXTEND' : 'TRIM') : this.tool;
    const boundaries = [...this.state.entities, ...this.extraBoundaries]
      .filter(
        (e) =>
          e.id !== line.id && this.visible(e) && (this.allBoundaries || this.boundaryIds.has(e.id)),
      )
      .flatMap((entity) => {
        const curve = editCurve(entity);
        return curve ? [curve] : [];
      });
    return trimExtendEntity(
      line,
      point,
      boundaries,
      tool,
      this.edgeMode === 1,
      this.mode === 1,
      this.project === 0 ? 'None' : this.project === 2 ? 'View' : 'UCS',
    );
  }
  private apply(original: CadEntity, replacements: CadEntity[]): void {
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
  private acceptCrossing(a: CadPoint, b: CadPoint, shift: boolean): TrimResult {
    const before = this.state,
      start = this.history.length;
    const hits = trimCrossingHits(this.state, a, b);
    for (const hit of hits) this.acceptPick(hit.point, hit.entity, shift);
    if (this.history.length > start) {
      this.history.splice(start, this.history.length - start, before);
      return { changed: true };
    }
    return {};
  }
}
