import { useEffect, useRef, useState } from 'react';
import { OffsetSession, TrimExtendSession, selectCadArea } from '@hancad/draft';
import type { OffsetSnapshot, TrimSnapshot } from '@hancad/draft';
import { getLegacyRuntime, visibleCadEntities } from '@hancad/legacy-bridge';
import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import type { CommandRegistry } from '@hancad/commands';
import type { SystemVariables, SysvarValue } from '@hancad/sysvars';
import { getMessages } from '@hancad/ui';
import type { Messages, MessageKey } from '@hancad/ui';

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
    controller.current =
      tool === 'OFFSET'
        ? new OffsetSession(live.getState(), {
            distance: live.sysvars.getNumber('OFFSETDIST'),
            gapType: live.sysvars.getNumber('OFFSETGAPTYPE'),
            onDistanceChange: (value) => {
              latest.current.sysvars.set('OFFSETDIST', value);
            },
          })
        : new TrimExtendSession(tool, live.getState(), {
            mode: live.sysvars.getNumber('TRIMEXTENDMODE') === 0 ? 0 : 1,
            edgeMode: live.sysvars.getNumber('EDGEMODE') === 1 ? 1 : 0,
          });
    refresh();
  }
  function report(result: {
    error?: string | boolean;
    finish?: boolean;
    mode?: 0 | 1;
    edgeMode?: 0 | 1;
  }): void {
    const live = latest.current;
    if (result.error) live.print(live.messages[errors[String(result.error)] ?? 'editInvalidInput']);
    if (result.mode !== undefined) live.sysvars.set('TRIMEXTENDMODE', result.mode);
    if (result.edgeMode !== undefined) live.sysvars.set('EDGEMODE', result.edgeMode);
    if (result.finish) finish();
    else refresh();
  }
  function getState(): LegacyCadState {
    return controller.current?.getSnapshot().state ?? latest.current.getState();
  }
  function entityAt(point: CadPoint, tolerance: number): CadEntity | undefined {
    return (
      getLegacyRuntime().core.cadEngine.hitTest(visibleCadEntities(getState()), point, tolerance) ??
      undefined
    );
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
    return messages[snapshot.tool === 'TRIM' ? 'trimBoundaryPrompt' : 'extendBoundaryPrompt'];
  }
  useEffect(() => {
    const ko = getMessages('ko-KR'),
      en = getMessages('en-US');
    for (const [name, label] of [
      ['TRIM', 'trim'],
      ['EXTEND', 'extend'],
      ['OFFSET', 'offset'],
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
      if (active) report(active.acceptPick(point, entity, shift));
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
      report(active.acceptText(value));
      return true;
    },
    cancel: (notify = true) => finish(notify),
  };
}
