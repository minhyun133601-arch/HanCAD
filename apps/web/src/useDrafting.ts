import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  DraftSession,
  DrawSession,
  appendCadEntities,
  coordinateSettings,
  lineContinuation,
  pointInputPrompt,
  drawFactories,
  repeatDrawFactory,
  modifyingTools,
  selectionModifyTools,
} from '@hancad/draft';
import type {
  DraftPointOptions,
  DraftSnapshot,
  DraftTool,
  PointSnapOverride,
  DraftTextOptions,
  DraftSessionOptions,
} from '@hancad/draft';
import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import type { CommandRegistry } from '@hancad/commands';
import type { SystemVariables } from '@hancad/sysvars';
import { getMessages } from '@hancad/ui';
import type { MessageKey, Messages } from '@hancad/ui';
import { creationSettings } from './creation-settings';
import { tempOverrides } from './temp-overrides';
import { recordStatusPoint } from './status-point-store';
import { useSelectionController } from './useSelectionController';
import { drawingCommandMemory } from './drawing-command-memory';
import { completeDrawCommand } from './complete-draw-command';
import { registerDrawingCommands } from './register-drawing-commands';
import { drawSelectionBridge, provisionalEntityId } from './draw-selection-bridge';
import {
  mirrorNativeObjects,
  nativeMirrorSelectionState,
  nativeMirrorContext,
  pickNativeHatch,
  nativeHatchIdentities,
  nativeHatchEditorIds,
} from './native-hatch-selection';
import { useModifyKeys } from './use-modify-keys';

interface DraftingOptions {
  registry: CommandRegistry;
  sysvars: SystemVariables;
  messages: Messages;
  state: LegacyCadState;
  getState: () => LegacyCadState;
  commitState: (label: string, state: LegacyCadState) => void;
  print: (message: string) => void;
  cancelOthers?: () => void;
  onSelectionComplete?: () => void;
  selectionPromptActive?: () => boolean;
  pickEntityId?: (point: CadPoint) => string | undefined;
  resolveTypedPoint?: (
    point: CadPoint,
    override?: PointSnapOverride,
  ) => ({ point: CadPoint } & DraftPointOptions) | undefined;
}
interface PickInput extends DraftPointOptions {
  point: CadPoint;
  entityId?: string;
  shiftKey: boolean;
}
const errors: Record<string, MessageKey> = {
  point: 'invalidPoint',
  positiveRadius: 'positiveRadius',
  needPoints: 'needPoints',
  noContinuation: 'noContinuation',
  zeroLength: 'zeroLength',
  closedSession: 'closedSession',
};

export function useDrafting(options: DraftingOptions) {
  const { registry, messages, state } = options;
  const latest = useRef(options);
  latest.current = options;
  const activeSession = useRef<DraftSession | DrawSession | null>(null);
  const drawMemory = drawingCommandMemory(options.sysvars.database);
  const heldKeys = useModifyKeys();
  const pendingModify = useRef<DraftTool | null>(null);
  const [pendingTool, setPendingTool] = useState<DraftTool | null>(null);
  useEffect(
    () =>
      options.sysvars.events.subscribe((event) => {
        if (event.name === 'SPLDEGREE') drawMemory.delete('SPLINE.DEGREE');
      }),
    [options.sysvars, drawMemory],
  );
  const [snapshot, setSnapshot] = useState<DraftSnapshot | null>(null);
  const selection = useSelectionController({
    ...options,
    additionalValidIds: () =>
      nativeHatchIdentities(latest.current.sysvars.database, latest.current.getState()),
    getState: () => {
      const current = latest.current,
        model = current.getState();
      return pendingModify.current === 'MIRROR'
        ? nativeMirrorSelectionState(current.sysvars.database, model)
        : model;
    },
    selectionPromptActive: () =>
      pendingModify.current !== null || !!latest.current.selectionPromptActive?.(),
    onSelectionComplete: () => {
      if (pendingModify.current) completeModifySelection();
      else latest.current.onSelectionComplete?.();
    },
    cancelDraft: () => {
      latest.current.cancelOthers?.();
      activeSession.current?.cancel();
      activeSession.current = null;
      setSnapshot(null);
    },
  });
  const cursorRef = useRef<CadPoint | null>(null);
  const cursorOptions = useRef<DraftPointOptions>({});
  // Re-render when a temporary override (Shift for Ortho) is pressed or released.
  useSyncExternalStore(tempOverrides.subscribe, tempOverrides.snapshot);
  const ortho = tempOverrides.number(options.sysvars, 'ORTHOMODE') === 1;

  function settings() {
    return {
      ...creationSettings(latest.current.getState().settings, (name) =>
        latest.current.sysvars.get(name),
      ),
      ortho: tempOverrides.number(latest.current.sysvars, 'ORTHOMODE') === 1,
    };
  }
  useEffect(() => {
    const active = activeSession.current;
    if (active) {
      active.setSettings(settings());
      if (cursorRef.current) active.moveCursor(cursorRef.current, cursorOptions.current);
    }
  }, [ortho, state.settings]);

  function showError(code: string): void {
    const key = errors[code] ?? 'invalidPoint';
    latest.current.print(latest.current.messages[key]);
  }
  function changed(next: DraftSnapshot): void {
    if (next.status !== 'active') {
      activeSession.current = null;
      setSnapshot(null);
    } else setSnapshot(next);
  }
  function completeModifySelection(): void {
    const tool = pendingModify.current;
    if (!tool) return;
    const ids = [...selection.getSelectedIds()];
    const windows = structuredClone(selection.getSelectionWindows());
    const individual = [...selection.getIndividuallySelectedIds()];
    if (!ids.length) {
      latest.current.print(latest.current.messages.noSelection);
      cancel(false);
      return;
    }
    begin(tool, false, ids, windows, individual);
  }
  function begin(
    tool: DraftTool,
    repeat = false,
    selectedOverride?: readonly string[],
    windowsOverride?: readonly {
      points: readonly CadPoint[];
      crossing: boolean;
      ids?: readonly string[];
    }[],
    individualOverride?: readonly string[],
  ): void {
    const selectedIds =
      selectedOverride ??
      (latest.current.sysvars.getNumber('PICKFIRST') === 1 ? [...selection.getSelectedIds()] : []);
    const selectionWindows = windowsOverride ?? structuredClone(selection.getSelectionWindows());
    const individuallySelectedIds = individualOverride ?? [
      ...selection.getIndividuallySelectedIds(),
    ];
    cancel(false);
    latest.current.cancelOthers?.();
    const current = latest.current;
    const model = current.getState();
    const entitiesById = new Map(model.entities.map((entity) => [entity.id, entity]));
    const layer = model.layers.find((item) => item.name === model.settings.layer);
    if (!modifyingTools.has(tool) && layer && (!layer.visible || layer.locked)) {
      current.print(current.messages.currentLayerHidden);
      return;
    }
    if (selectionModifyTools.has(tool) && selectedIds.length)
      selection.rememberSelection(selectedIds);
    selection.clearSelection();
    if (selectionModifyTools.has(tool) && !selectedIds.length) {
      pendingModify.current = tool;
      setPendingTool(tool);
      return;
    }
    const sessionOptions: DraftSessionOptions = {
      coordinates: () => coordinateSettings((name) => latest.current.sysvars.get(name)),
      resolveTypedPoint: (point, override) => latest.current.resolveTypedPoint?.(point, override),
      getSnapOverride: () => tempOverrides.getObjectSnap(),
      ...(lineContinuation(model.entities)
        ? { continuation: lineContinuation(model.entities)! }
        : {}),
      onSnapOverride: (mode: PointSnapOverride) => tempOverrides.setObjectSnap(mode),
      onAcceptedPoint: (point: CadPoint) => recordStatusPoint(latest.current.sysvars, point),
      onPointSampleAccepted: () => tempOverrides.consumeObjectSnap(),
      onCommit: (entities: CadEntity[]) => {
        const active = latest.current;
        active.commitState(tool, appendCadEntities(active.getState(), entities));
        active.print(active.messages.committedObjects(entities.length));
      },
      onChange: changed,
    };
    const singleFactory = drawFactories[tool];
    const factory = repeat && singleFactory ? repeatDrawFactory(singleFactory) : singleFactory;
    const screen = current.sysvars.get('SCREENSIZE');
    const viewDiagonal =
      Array.isArray(screen) && screen[1] > 0
        ? (current.sysvars.getNumber('VIEWSIZE') * Math.hypot(screen[0], screen[1])) / screen[1]
        : current.sysvars.getNumber('VIEWSIZE');
    const session = factory
      ? new DrawSession(tool, factory, {
          ...sessionOptions,
          context: {
            settings: settings(),
            coordinates: () => coordinateSettings((name) => latest.current.sysvars.get(name)),
            get: (name) => latest.current.sysvars.get(name),
            set: () => {},
            entities: model.entities,
            ...(tool === 'MIRROR' ? nativeMirrorContext(current.sysvars.database, model) : {}),
            layers: model.layers,
            linetypes: model.linetypes ?? [],
            selectedIds,
            selectionWindows,
            individuallySelectedIds,
            isShiftPressed: () => heldKeys.current.shift,
            pickEntity: (point) => {
              const id = latest.current.pickEntityId?.(point);
              return id ? entitiesById.get(id) : undefined;
            },
            blocks: model.clipboardBlocks ?? [],
            groups: model.groups ?? [],
            mlineStyles: model.mlineStyles ?? [],
            memory: drawMemory,
            editableIds: new Set(
              model.entities
                .filter((entity) => {
                  const layer = model.layers.find((item) => item.name === entity.layer);
                  return !layer || (layer.visible && !layer.locked);
                })
                .map((entity) => entity.id),
            ),
            viewDiagonal,
            isControlPressed: () => heldKeys.current.control,
            ...(sessionOptions.continuation ? { continuation: sessionOptions.continuation } : {}),
          },
          onComplete: (result, changes) => {
            const active = latest.current;
            completeDrawCommand(
              {
                tool,
                sysvars: active.sysvars,
                getState: active.getState,
                commitState: active.commitState,
                print: active.print,
                korean: active.messages.cancel.includes('취소'),
                rememberSelection: selection.rememberSelection,
                committedMessage: active.messages.committedObjects,
              },
              result,
              changes,
            );
          },
          onNotice: (message) =>
            latest.current.print(
              message[latest.current.messages.cancel.includes('취소') ? 'ko' : 'en'],
            ),
          onFailure: (error) => console.error('HanCAD command failure:', error),
        })
      : new DraftSession(tool, settings(), sessionOptions);
    const next = session.getSnapshot();
    activeSession.current = next.status === 'active' ? session : null;
    setSnapshot(next.status === 'active' ? next : null);
  }
  function cancel(print = true): boolean {
    const active = activeSession.current;
    const hadActive = active !== null || selection.isActive() || pendingModify.current !== null;
    pendingModify.current = null;
    setPendingTool(null);
    if (active) active.cancel();
    activeSession.current = null;
    setSnapshot(null);
    selection.cancel(false);
    if (!hadActive) selection.clearSelection();
    if (print) latest.current.print(latest.current.messages.cancel);
    return hadActive;
  }
  function pick(event: PickInput): boolean {
    if (activeSession.current) {
      const session = activeSession.current;
      const result =
        session instanceof DrawSession
          ? session.acceptPoint(
              event.point,
              event,
              provisionalEntityId(session, event.point, event.entityId, latest.current.sysvars),
            )
          : session.acceptPoint(event.point, {
              ...event,
            });
      if (result.status === 'error') showError(result.error ?? 'point');
      return result.status !== 'error';
    }
    const current = latest.current,
      screen = current.sysvars.get('SCREENSIZE'),
      height = Array.isArray(screen) ? Number(screen[1]) : 1,
      tolerance =
        (Math.max(1, current.sysvars.getNumber('PICKBOX')) *
          current.sysvars.getNumber('VIEWSIZE')) /
        Math.max(1, height);
    const id =
      event.entityId ??
      (pendingModify.current === 'MIRROR'
        ? pickNativeHatch(
            mirrorNativeObjects(current.sysvars.database, current.getState()),
            event.point,
            tolerance,
            new Set(current.getState().entities.map((entity) => entity.id)),
            nativeHatchEditorIds(current.sysvars.database, current.getState()),
          )
        : undefined);
    return selection.pick(event.point, id, event.shiftKey);
  }
  function cursor(point: CadPoint, pointOptions: DraftPointOptions = {}): void {
    cursorRef.current = point;
    cursorOptions.current = pointOptions;
    activeSession.current?.moveCursor(point, pointOptions);
  }
  function submit(value: string, textOptions: DraftTextOptions = {}): boolean {
    if (pendingModify.current) {
      if (selection.isFilterSelection()) return selection.submit(value);
      if (selection.submitSelection(value)) return true;
      if (!value.trim()) completeModifySelection();
      else latest.current.print(latest.current.messages.selectObjects);
      return true;
    }
    if (activeSession.current) {
      latest.current.print(`${currentPrompt(activeSession.current.getSnapshot())} ${value}`);
      const result = activeSession.current.acceptText(value, textOptions);
      if (result.status === 'error') showError(result.error ?? 'point');
      tempOverrides.consumeObjectSnapInput(value, result.status !== 'error');
      return true;
    }
    return selection.submit(value);
  }

  useEffect(() => registerDrawingCommands(registry, begin), [registry, messages]);

  function currentPrompt(current: DraftSnapshot): string {
    return (
      pointInputPrompt(
        current.pointInput,
        latest.current.messages.commandPrompt === getMessages('ko-KR').commandPrompt
          ? 'ko-KR'
          : 'en-US',
      ) ??
      (current.promptText
        ? current.promptText[
            latest.current.messages.commandPrompt === getMessages('ko-KR').commandPrompt
              ? 'ko'
              : 'en'
          ]
        : latest.current.messages[current.prompt])
    );
  }
  const prompt = snapshot
    ? currentPrompt(snapshot)
    : (selection.prompt ?? (pendingTool ? options.messages.selectObjects : null));
  return {
    ...selection,
    ...drawSelectionBridge({
      getSession: () => activeSession.current,
      getState: () => latest.current.getState(),
      selection,
    }),
    snapshot,
    active: snapshot !== null || selection.isActive() || pendingTool !== null,
    prompt,
    begin,
    cancel,
    pick,
    cursor,
    submit,
    getSnapEntities: () => activeSession.current?.getSnapEntities() ?? [],
    getPointInput: () => activeSession.current?.getPointInput(),
    getAidContext: (): ReturnType<DraftSession['getAidContext']> =>
      activeSession.current?.getAidContext() ?? {
        pointInput: { stage: 'point' as const, trackingPoints: [], sourcePoint: false },
        trackingPoints: [],
      },
    isActive: () =>
      activeSession.current !== null || selection.isActive() || pendingModify.current !== null,
    isModifySelecting: () => pendingModify.current !== null,
    isSelectionSet: () =>
      activeSession.current instanceof DrawSession &&
      !!activeSession.current.getRequest()?.selectionSet,
    isDrafting: () => activeSession.current !== null,
  };
}
