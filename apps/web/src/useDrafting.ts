import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  DraftSession,
  appendCadEntities,
  deleteCadEntities,
  coordinateSettings,
  lineContinuation,
  pointInputPrompt,
} from '@hancad/draft';
import type {
  DraftPointOptions,
  DraftSnapshot,
  DraftTool,
  PointSnapOverride,
  DraftTextOptions,
} from '@hancad/draft';
import type { CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import type { CommandRegistry } from '@hancad/commands';
import type { SystemVariables } from '@hancad/sysvars';
import { getMessages } from '@hancad/ui';
import type { MessageKey, Messages } from '@hancad/ui';
import { creationSettings } from './creation-settings';
import { tempOverrides } from './temp-overrides';
import { recordStatusPoint } from './status-point-store';

interface DraftingOptions {
  registry: CommandRegistry;
  sysvars: SystemVariables;
  messages: Messages;
  state: LegacyCadState;
  getState: () => LegacyCadState;
  commitState: (label: string, state: LegacyCadState) => void;
  print: (message: string) => void;
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
  const activeSession = useRef<DraftSession | null>(null);
  const [snapshot, setSnapshot] = useState<DraftSnapshot | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectionRef = useRef<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const eraseSelection = useRef(false);
  const selectionMode = useRef(false);
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
  function setSelectMode(value: boolean): void {
    selectionMode.current = value;
    setSelecting(value);
  }
  useEffect(() => {
    const active = activeSession.current;
    if (active) {
      active.setSettings(settings());
      if (cursorRef.current) active.moveCursor(cursorRef.current, cursorOptions.current);
    }
  }, [ortho, state.settings]);

  function select(ids: string[]): void {
    selectionRef.current = ids;
    setSelectedIds(ids);
  }
  useEffect(() => {
    const present = new Set(state.entities.map((entity) => entity.id));
    select(selectionRef.current.filter((id) => present.has(id)));
  }, [state]);

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
  function begin(tool: DraftTool): void {
    cancel(false);
    const current = latest.current;
    const model = current.getState();
    const layer = model.layers.find((item) => item.name === model.settings.layer);
    if (layer && (!layer.visible || layer.locked)) {
      current.print(current.messages.currentLayerHidden);
      return;
    }
    select([]);
    setSelectMode(false);
    eraseSelection.current = false;
    const session = new DraftSession(tool, settings(), {
      coordinates: () => coordinateSettings((name) => latest.current.sysvars.get(name)),
      resolveTypedPoint: (point, override) => latest.current.resolveTypedPoint?.(point, override),
      getSnapOverride: () => tempOverrides.getObjectSnap(),
      ...(tool === 'LINE' && lineContinuation(model.entities)
        ? { continuation: lineContinuation(model.entities)! }
        : {}),
      onSnapOverride: (mode) => tempOverrides.setObjectSnap(mode),
      onAcceptedPoint: (point) => recordStatusPoint(latest.current.sysvars, point),
      onPointSampleAccepted: () => tempOverrides.consumeObjectSnap(),
      onCommit: (entities) => {
        const active = latest.current;
        active.commitState(tool, appendCadEntities(active.getState(), entities));
        active.print(active.messages.committedObjects(entities.length));
      },
      onChange: changed,
    });
    activeSession.current = session;
    setSnapshot(session.getSnapshot());
  }
  function cancel(print = true): boolean {
    const active = activeSession.current;
    const hadActive = active !== null || selectionMode.current;
    if (active) active.cancel();
    activeSession.current = null;
    setSnapshot(null);
    eraseSelection.current = false;
    setSelectMode(false);
    if (!hadActive) select([]);
    if (print) latest.current.print(latest.current.messages.cancel);
    return hadActive;
  }
  function erase(): void {
    const active = latest.current;
    const result = deleteCadEntities(active.getState(), selectionRef.current);
    if (result.deleted) {
      active.commitState('ERASE', result.state);
      select([]);
      active.print(active.messages.erasedObjects(result.deleted));
    } else active.print(active.messages.noSelection);
    eraseSelection.current = false;
    setSelectMode(false);
  }
  function pick(event: PickInput): boolean {
    if (activeSession.current) {
      const result = activeSession.current.acceptPoint(event.point, {
        ...event,
      });
      if (result.status === 'error') showError(result.error ?? 'point');
      return result.status !== 'error';
    }
    if (!event.entityId) {
      if (!eraseSelection.current) select([]);
      return false;
    }
    selectIds([event.entityId], event.shiftKey);
    return false;
  }
  function cursor(point: CadPoint, pointOptions: DraftPointOptions = {}): void {
    cursorRef.current = point;
    cursorOptions.current = pointOptions;
    activeSession.current?.moveCursor(point, pointOptions);
  }
  function selectIds(ids: readonly string[], remove = false): void {
    const wanted = new Set(ids);
    const current = latest.current.sysvars.getNumber('PICKADD') === 0 ? [] : selectionRef.current;
    select(
      remove
        ? selectionRef.current.filter((id) => !wanted.has(id))
        : [...new Set([...current, ...ids])],
    );
  }
  function submit(value: string, textOptions: DraftTextOptions = {}): boolean {
    if (activeSession.current) {
      latest.current.print(`${currentPrompt(activeSession.current.getSnapshot())} ${value}`);
      const result = activeSession.current.acceptText(value, textOptions);
      if (result.status === 'error') showError(result.error ?? 'point');
      tempOverrides.consumeObjectSnapInput(value, result.status !== 'error');
      return true;
    }
    if (selectionMode.current) {
      if (!value.trim()) {
        if (eraseSelection.current) erase();
        else setSelectMode(false);
      } else latest.current.print(latest.current.messages.selectObjects);
      return true;
    }
    return false;
  }
  function selectAll(): void {
    const current = latest.current.getState();
    select(
      current.entities
        .filter((entity) =>
          current.layers.some(
            (layer) => layer.name === entity.layer && layer.visible && !layer.locked,
          ),
        )
        .map((entity) => entity.id),
    );
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
    registry.register({
      name: 'SELECT',
      displayName: { 'ko-KR': ko.select, 'en-US': en.select },
      description: { 'ko-KR': ko.selectObjects, 'en-US': en.selectObjects },
      execute: () => {
        cancel(false);
        setSelectMode(true);
      },
    });
    registry.register({
      name: 'ERASE',
      displayName: { 'ko-KR': ko.erase, 'en-US': en.erase },
      description: { 'ko-KR': ko.selectObjects, 'en-US': en.selectObjects },
      execute: () => {
        if (activeSession.current || selectionMode.current) cancel(false);
        if (selectionRef.current.length) erase();
        else {
          eraseSelection.current = true;
          setSelectMode(true);
        }
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
      ) ?? latest.current.messages[current.prompt]
    );
  }
  const prompt = snapshot ? currentPrompt(snapshot) : selecting ? messages.selectObjects : null;
  return {
    snapshot,
    selectedIds,
    active: snapshot !== null || selectionMode.current,
    prompt,
    begin,
    cancel,
    pick,
    cursor,
    submit,
    erase,
    selectAll,
    selectIds,
    clearSelection: () => select([]),
    getSelectedIds: () => selectionRef.current,
    getSnapEntities: () => activeSession.current?.getSnapEntities() ?? [],
    getPointInput: () => activeSession.current?.getPointInput(),
    getAidContext: (): ReturnType<DraftSession['getAidContext']> =>
      activeSession.current?.getAidContext() ?? {
        pointInput: { stage: 'point' as const, trackingPoints: [], sourcePoint: false },
        trackingPoints: [],
      },
    isActive: () => activeSession.current !== null || selectionMode.current,
    isDrafting: () => activeSession.current !== null,
  };
}
