import { useEffect, useRef, useState } from 'react';
import { OffsetSession, TrimExtendSession, selectCadArea, coordinateSettings } from '@hancad/draft';
import type { OffsetSnapshot, TrimSnapshot } from '@hancad/draft';
import { getLegacyRuntime, visibleCadEntities } from '@hancad/legacy-bridge';
import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import type { CommandRegistry } from '@hancad/commands';
import type { SystemVariables, SysvarValue } from '@hancad/sysvars';
import { getMessages } from '@hancad/ui';
import type { Messages, MessageKey } from '@hancad/ui';
import { tempOverrides } from './temp-overrides';
import { recordStatusPoint } from './status-point-store';
import { nativeSnapSources } from './native-snap-sources';
import { evaluateGeometry, closestGeometryPoint } from '@hancad/geom';

interface Options {
  registry: CommandRegistry;
  sysvars: SystemVariables;
  messages: Messages;
  getState: () => LegacyCadState;
  commitState: (
    label: string,
    state: LegacyCadState,
    variables?: Readonly<Record<string, SysvarValue>>,
  ) => void;
  cancelOthers: () => void;
  print: (message: string) => void;
  pickEntityId?: (point: CadPoint) => string | undefined;
}
type EditingSession = OffsetSession | TrimExtendSession;
type EditingSnapshot = OffsetSnapshot | TrimSnapshot;
const errors: Record<string, MessageKey> = {
  locked: 'editLocked',
  lockedEntity: 'editLocked',
  unsupported: 'editUnsupported',
  unsupportedEntity: 'editUnsupported',
  unsupportedPolyline: 'editUnsupported',
  unsupportedGapType: 'offsetUnsupportedGap',
  noIntersection: 'editNoIntersection',
  point: 'invalidPoint',
  closedSession: 'closedSession',
  invalidGeometry: 'offsetInvalidGeometry',
  collapsedOffset: 'offsetInvalidGeometry',
  ambiguousSide: 'offsetInvalidGeometry',
  throughPoint: 'offsetInvalidGeometry',
  selectOffsetObject: 'editUnsupported',
  entityLimit: 'editEntityLimit',
  nothingToUndo: 'editNothingToUndo',
  positiveDistance: 'offsetPositiveDistance',
};

export function useEditingTools(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const controller = useRef<EditingSession | null>(null);
  const [snapshot, setSnapshot] = useState<EditingSnapshot | null>(null);
  const indexedState = useRef<LegacyCadState | null>(null);
  const entityIndex = useRef(new Map<string, CadEntity>());
  const boundaryEntities = useRef<CadEntity[]>([]);
  function refresh(): void {
    setSnapshot(controller.current?.getSnapshot() ?? null);
  }
  function finish(notify = false): boolean {
    const active = controller.current;
    if (!active) return false;
    active.finish();
    const next = active.getSnapshot(),
      live = latest.current;
    if (next.changed) live.commitState(next.tool, next.state);
    controller.current = null;
    refresh();
    if (notify) live.print(live.messages.cancel);
    return true;
  }
  function begin(tool: 'TRIM' | 'EXTEND' | 'OFFSET'): void {
    finish();
    latest.current.cancelOthers();
    const live = latest.current;
    boundaryEntities.current = tool === 'OFFSET' ? [] : nativeBoundaries();
    controller.current =
      tool === 'OFFSET'
        ? new OffsetSession(live.getState(), {
            coordinates: () => coordinateSettings((name) => latest.current.sysvars.get(name)),
            onAcceptedPoint: (point) => recordStatusPoint(latest.current.sysvars, point),
            distance: live.sysvars.getNumber('OFFSETDIST'),
            gapType: live.sysvars.getNumber('OFFSETGAPTYPE'),
            onDistanceChange: (value) => {
              latest.current.sysvars.set('OFFSETDIST', value);
            },
          })
        : new TrimExtendSession(tool, live.getState(), {
            mode: live.sysvars.getNumber('TRIMEXTENDMODE') === 0 ? 0 : 1,
            edgeMode: live.sysvars.getNumber('EDGEMODE') === 1 ? 1 : 0,
            project:
              live.sysvars.getNumber('PROJMODE') === 0
                ? 0
                : live.sysvars.getNumber('PROJMODE') === 2
                  ? 2
                  : 1,
            boundaries: boundaryEntities.current,
          });
    refresh();
  }
  function report(result: {
    error?: string | boolean;
    finish?: boolean;
    mode?: 0 | 1;
    edgeMode?: 0 | 1;
    project?: 0 | 1 | 2;
  }): void {
    const live = latest.current;
    if (result.error) live.print(live.messages[errors[String(result.error)] ?? 'editInvalidInput']);
    if (result.mode !== undefined) live.sysvars.set('TRIMEXTENDMODE', result.mode);
    if (result.edgeMode !== undefined) live.sysvars.set('EDGEMODE', result.edgeMode);
    if (result.project !== undefined) live.sysvars.set('PROJMODE', result.project);
    if (result.finish) finish();
    else refresh();
  }
  function getState(): LegacyCadState {
    return controller.current?.getSnapshot().state ?? latest.current.getState();
  }
  function entityAt(point: CadPoint, tolerance: number): CadEntity | undefined {
    const state = getState();
    if (indexedState.current !== state) {
      entityIndex.current = new Map(state.entities.map((entity) => [entity.id, entity]));
      indexedState.current = state;
    }
    if (latest.current.pickEntityId) {
      const id = latest.current.pickEntityId(point);
      const entity = id ? entityIndex.current.get(id) : undefined;
      if (entity) return entity;
      return boundaryEntities.current.find((entity) => entity.id === id);
    }
    const legacy =
      getLegacyRuntime().core.cadEngine.hitTest(visibleCadEntities(getState()), point, tolerance) ??
      undefined;
    if (legacy) return legacy;
    return boundaryEntities.current.find(
      (entity) =>
        entity.curve &&
        closestGeometryPoint(entity.curve, { x: point.x, y: -point.y, z: point.z ?? 0 }).distance <=
          tolerance,
    );
  }
  function nativeBoundaries(): CadEntity[] {
    const model = latest.current.getState();
    return nativeSnapSources(latest.current.sysvars.database.all(), model)
      .filter((source) => source.hatch)
      .map((source) => {
        const at = evaluateGeometry(source.geometry, 0);
        return {
          ...model.settings,
          id: source.entityId ?? source.id,
          type: 'polyline' as const,
          points: [{ x: at.x, y: -at.y }],
          closed: false,
          curve: source.geometry,
          sourceType: 'HATCH',
        };
      });
  }
  function prompt(): string | null {
    if (!snapshot) return null;
    const messages = options.messages;
    if (snapshot.tool === 'OFFSET') {
      if (snapshot.prompt === 'offsetDistance')
        return messages.offsetDistancePrompt(
          snapshot.distance < 0 ? messages.offsetThroughDefault : String(snapshot.distance),
        );
      if (snapshot.prompt === 'offsetErase')
        return messages.offsetErasePrompt(snapshot.eraseSource);
      if (snapshot.prompt === 'offsetLayer')
        return messages.offsetLayerPrompt(snapshot.layerMode === 'Current');
      if (snapshot.multiple && snapshot.prompt === 'offsetSide')
        return messages.offsetMultipleSidePrompt;
      if (snapshot.multiple && snapshot.prompt === 'offsetThrough')
        return messages.offsetMultipleThroughPrompt;
      const prompts = {
        offsetSecondPoint: 'offsetSecondPointPrompt',
        offsetSelect: 'offsetSelectPrompt',
        offsetSide: 'offsetSidePrompt',
        offsetThrough: 'offsetThroughPrompt',
      } as const;
      return messages[prompts[snapshot.prompt]];
    }
    if (snapshot.prompt === 'trimTarget')
      return messages[snapshot.tool === 'TRIM' ? 'trimTargetPrompt' : 'extendTargetPrompt'];
    if (snapshot.prompt === 'trimMode') return messages.trimModePrompt(snapshot.mode === 1);
    if (snapshot.prompt === 'trimEdge') return messages.trimEdgePrompt(snapshot.edgeMode === 1);
    const korean = messages.cancel.includes('취소');
    if (snapshot.prompt === 'trimProject')
      return korean
        ? '투영 옵션 입력 [없음(N)/UCS(U)/뷰(V)] <UCS>:'
        : 'Enter a projection option [None/Ucs/View] <UCS>:';
    if (snapshot.prompt === 'trimFence')
      return korean ? '울타리의 다음 점 지정 또는 <완료>:' : 'Specify next fence point or <done>:';
    if (snapshot.prompt === 'trimCrossFirst')
      return korean ? '첫 번째 구석 지정:' : 'Specify first corner:';
    if (snapshot.prompt === 'trimCrossSecond')
      return korean ? '반대 구석 지정:' : 'Specify opposite corner:';
    if (snapshot.prompt === 'trimErase')
      return korean ? '지울 객체 선택:' : 'Select objects to erase:';
    return messages[snapshot.tool === 'TRIM' ? 'trimBoundaryPrompt' : 'extendBoundaryPrompt'];
  }
  useEffect(() => {
    const ko = getMessages('ko-KR'),
      en = getMessages('en-US');
    for (const [name, label] of [
      ['TRIM', 'trim'],
      ['EXTEND', 'extend'],
    ] as const)
      options.registry.register({
        name,
        displayName: { 'ko-KR': ko[label], 'en-US': en[label] },
        description: { 'ko-KR': ko.editingUsage, 'en-US': en.editingUsage },
        execute: () => begin(name),
      });
  }, [options.registry]);
  return {
    snapshot,
    active: snapshot !== null,
    prompt: prompt(),
    isActive: () => controller.current !== null,
    getState,
    entityAt,
    needsPoint: () => {
      const input = controller.current?.getSnapshot().inputMode;
      return input === 'point' || input === 'number';
    },
    canSelectArea: () => {
      const next = controller.current?.getSnapshot();
      return (
        next?.tool !== 'OFFSET' &&
        (next?.prompt === 'trimBoundary' || next?.prompt === 'trimTarget')
      );
    },
    needsFence: () => {
      const next = controller.current?.getSnapshot();
      return next?.tool !== 'OFFSET' && next?.prompt === 'trimTarget';
    },
    pick: (point: CadPoint, entity?: CadEntity, shift = false) => {
      const active = controller.current;
      if (!active) return false;
      const result = active.acceptPick(point, entity, shift);
      report(result);
      return !result.error;
    },
    cursor: (point: CadPoint, entity?: CadEntity, shift = false) => {
      const active = controller.current;
      if (active) {
        active.moveCursor(point, entity, shift);
        refresh();
      }
    },
    area: (start: CadPoint, end: CadPoint, points: readonly CadPoint[], shift: boolean) => {
      const active = controller.current;
      if (!(active instanceof TrimExtendSession)) return;
      if (active.getSnapshot().prompt === 'trimBoundary') {
        const state = active.getSnapshot().state;
        const selectable = {
          ...state,
          layers: state.layers.map((layer) => ({ ...layer, locked: false })),
        };
        for (const id of selectCadArea(selectable, start, end))
          active.acceptPick(
            end,
            state.entities.find((e) => e.id === id),
          );
        refresh();
      } else report(active.acceptFence(points, shift));
    },
    submit: (value: string): boolean => {
      const active = controller.current;
      if (!active) return false;
      latest.current.print(`${prompt() ?? ''} ${value}`);
      const mode = active.getSnapshot().inputMode;
      const result = active.acceptText(value);
      report(result);
      if (mode === 'point' || mode === 'number')
        tempOverrides.consumeObjectSnapInput(value, !result.error);
      return true;
    },
    cancel: (notify = true) => finish(notify),
  };
}
