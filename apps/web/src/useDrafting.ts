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
import { getSystemVariableDefinition, validateSystemVariable } from '@hancad/sysvars';
import { getMessages } from '@hancad/ui';
import type { MessageKey, Messages } from '@hancad/ui';
import { creationSettings } from './creation-settings';
import { tempOverrides } from './temp-overrides';
import { recordStatusPoint } from './status-point-store';
import { useSelectionController } from './useSelectionController';
import { drawingCommandMemory } from './drawing-command-memory';

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
const tools: readonly [DraftTool, MessageKey][] = [
  ['LINE', 'line'],
  ['CIRCLE', 'circle'],
  ['RECTANG', 'rectangle'],
  ['PLINE', 'polyline'],
];
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
  const controlHeld = useRef(false);
  useEffect(
    () =>
      options.sysvars.events.subscribe((event) => {
        if (event.name === 'SPLDEGREE') drawMemory.delete('SPLINE.DEGREE');
      }),
    [options.sysvars, drawMemory],
  );
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      controlHeld.current = event.ctrlKey;
    };
    const blur = () => {
      controlHeld.current = false;
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('keyup', key, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('keyup', key, true);
      window.removeEventListener('blur', blur);
    };
  }, []);
  const [snapshot, setSnapshot] = useState<DraftSnapshot | null>(null);
  const selection = useSelectionController({
    ...options,
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
  function begin(tool: DraftTool, repeat = false): void {
    cancel(false);
    const current = latest.current;
    const model = current.getState();
    const layer = model.layers.find((item) => item.name === model.settings.layer);
    if (layer && (!layer.visible || layer.locked)) {
      current.print(current.messages.currentLayerHidden);
      return;
    }
    selection.clearSelection();
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
            blocks: model.clipboardBlocks ?? [],
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
            isControlPressed: () => controlHeld.current,
            ...(sessionOptions.continuation ? { continuation: sessionOptions.continuation } : {}),
          },
          onComplete: (result, changes) => {
            const active = latest.current,
              database = active.sysvars.database;
            for (const message of result.messages ?? [])
              active.print(message[active.messages.cancel.includes('취소') ? 'ko' : 'en']);
            if (
              !result.entities.length &&
              !result.eraseIds?.length &&
              !changes.size &&
              !result.mlineStyles
            )
              return;
            const source = active.getState();
            const protectedLayers = new Set(
              source.layers
                .filter((layer) => !layer.visible || layer.locked)
                .map((layer) => layer.name),
            );
            if (
              source.entities.some(
                (entity) =>
                  result.eraseIds?.includes(entity.id) && protectedLayers.has(entity.layer),
              )
            )
              throw new Error('Cannot replace objects on hidden or locked layers.');
            const next =
              result.entities.length || result.eraseIds?.length || result.mlineStyles
                ? appendCadEntities(
                    {
                      ...source,
                      entities: source.entities.filter(
                        (entity) => !result.eraseIds?.includes(entity.id),
                      ),
                      ...(result.clipboardBlocks
                        ? {
                            clipboardBlocks: [
                              ...(source.clipboardBlocks ?? []),
                              ...result.clipboardBlocks,
                            ],
                          }
                        : {}),
                      ...(result.mlineStyles ? { mlineStyles: result.mlineStyles } : {}),
                    },
                    result.entities,
                  )
                : undefined;
            for (const [name, value] of changes) {
              const definition = getSystemVariableDefinition(name);
              if (!definition || definition.readonly)
                throw new Error(`Invalid drawing system variable ${name}.`);
              validateSystemVariable(definition, value);
            }
            const ownGroup = !database.undoGroupActive;
            if (ownGroup) database.beginUndoGroup();
            try {
              for (const [name, value] of changes) {
                if (typeof value !== 'object') active.sysvars.set(name, value);
                else if (value.length === 2) active.sysvars.set(name, [value[0]!, value[1]!]);
                else if (value.length === 3)
                  active.sysvars.set(name, [value[0]!, value[1]!, value[2]!]);
                else throw new Error(`Invalid point system variable ${name}.`);
              }
              if (next) {
                active.commitState(tool, next);
                if (result.previousIds) selection.rememberSelection(result.previousIds);
                active.print(active.messages.committedObjects(result.entities.length));
              }
            } finally {
              if (ownGroup && database.undoGroupActive) database.endUndoGroup();
            }
          },
          onNotice: (message) =>
            latest.current.print(
              message[latest.current.messages.cancel.includes('취소') ? 'ko' : 'en'],
            ),
        })
      : new DraftSession(tool, settings(), sessionOptions);
    const next = session.getSnapshot();
    activeSession.current = next.status === 'active' ? session : null;
    setSnapshot(next.status === 'active' ? next : null);
  }
  function cancel(print = true): boolean {
    const active = activeSession.current;
    const hadActive = active !== null || selection.isActive();
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
          ? session.acceptPoint(event.point, event, event.entityId)
          : session.acceptPoint(event.point, {
              ...event,
            });
      if (result.status === 'error') showError(result.error ?? 'point');
      return result.status !== 'error';
    }
    return selection.pick(event.point, event.entityId, event.shiftKey);
  }
  function cursor(point: CadPoint, pointOptions: DraftPointOptions = {}): void {
    cursorRef.current = point;
    cursorOptions.current = pointOptions;
    activeSession.current?.moveCursor(point, pointOptions);
  }
  function submit(value: string, textOptions: DraftTextOptions = {}): boolean {
    if (activeSession.current) {
      latest.current.print(`${currentPrompt(activeSession.current.getSnapshot())} ${value}`);
      const result = activeSession.current.acceptText(value, textOptions);
      if (result.status === 'error') showError(result.error ?? 'point');
      tempOverrides.consumeObjectSnapInput(value, result.status !== 'error');
      return true;
    }
    return selection.submit(value);
  }

  useEffect(() => {
    const ko = getMessages('ko-KR'),
      en = getMessages('en-US');
    for (const [name, label] of tools)
      registry.register({
        name,
        displayName: { 'ko-KR': ko[label], 'en-US': en[label] },
        description: { 'ko-KR': ko.draftingUsage, 'en-US': en.draftingUsage },
        execute: () => begin(name),
      });
    for (const name of Object.keys(drawFactories))
      if (!tools.some(([tool]) => tool === name))
        registry.register({
          name,
          displayName: { 'ko-KR': name, 'en-US': name },
          description: { 'ko-KR': ko.draftingUsage, 'en-US': en.draftingUsage },
          execute: () => begin(name as DraftTool),
        });
    registry.register({
      name: 'MULTIPLE',
      displayName: { 'ko-KR': '다중', 'en-US': 'Multiple' },
      description: { 'ko-KR': '명령을 반복합니다.', 'en-US': 'Repeats a command.' },
      nextPrompt: (values, context) =>
        values.length
          ? undefined
          : {
              prompt:
                context.locale === 'ko-KR'
                  ? '반복할 명령 이름 입력:'
                  : 'Enter command name to repeat:',
            },
      execute: (context) => {
        const name = context.input.requireString(),
          resolved = registry.resolve(name),
          tool = resolved?.canonicalName as DraftTool | undefined;
        if (!tool || !drawFactories[tool]) {
          context.print(
            context.locale === 'ko-KR'
              ? `알 수 없거나 아직 반복을 지원하지 않는 명령 "${name}". 도움말을 보려면 F1 키를 누르십시오.`
              : `Unknown or unsupported repeated command "${name}". Press F1 for help.`,
          );
          return;
        }
        begin(tool, true);
      },
    });
  }, [registry, messages]);

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
  const prompt = snapshot ? currentPrompt(snapshot) : selection.prompt;
  return {
    ...selection,
    snapshot,
    active: snapshot !== null || selection.isActive(),
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
    isActive: () => activeSession.current !== null || selection.isActive(),
    isDrafting: () => activeSession.current !== null,
  };
}
