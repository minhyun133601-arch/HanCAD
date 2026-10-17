import { useEffect, useRef, useState } from 'react';
import {
  DimensionSession,
  appendCadEntities,
  applyDimensionStyle,
  dimensionSettingsFromVariables,
  coordinateSettings,
} from '@hancad/draft';
import type {
  DimensionError,
  DimensionPrompt,
  DimensionSnapshot,
  DimensionTool,
} from '@hancad/draft';
import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import type { CommandRegistry } from '@hancad/commands';
import type { SystemVariables } from '@hancad/sysvars';
import { getMessages } from '@hancad/ui';
import type { MessageKey, Messages } from '@hancad/ui';
import type { DimensionStyleValues } from './dimension-style';
import { creationSettings } from './creation-settings';
import { tempOverrides } from './temp-overrides';
import { recordStatusPoint } from './status-point-store';

interface DimensionOptions {
  registry: CommandRegistry;
  sysvars: SystemVariables;
  messages: Messages;
  getState: () => LegacyCadState;
  commitState: (label: string, state: LegacyCadState, variables?: DimensionStyleValues) => void;
  selectedIds: readonly string[];
  cancelDraft: () => void;
  print: (message: string) => void;
}
const tools: readonly [DimensionTool, MessageKey][] = [
  ['DIMLINEAR', 'dimension'],
  ['DIMALIGNED', 'dimensionAligned'],
  ['DIMRADIUS', 'dimensionRadius'],
  ['DIMDIAMETER', 'dimensionDiameter'],
  ['DIMANGULAR', 'dimensionAngular'],
  ['DIM', 'dimensionSmart'],
];
const errors: Record<DimensionError, MessageKey> = {
  point: 'invalidPoint',
  selectCircle: 'dimSelectCircleError',
  selectLineOrArc: 'dimSelectLineOrArcError',
  selectDimensionObject: 'dimSelectObjectError',
  needPoints: 'needPoints',
  zeroLength: 'zeroLength',
  parallelLines: 'dimParallelLinesError',
  invalidAngle: 'dimInvalidAngleError',
  closedSession: 'closedSession',
};
const prompts: Partial<Record<DimensionPrompt, MessageKey>> = {
  firstPoint: 'dimFirstOriginPrompt',
  secondPoint: 'dimSecondOriginPrompt',
  selectSecondLine: 'dimSelectSecondLinePrompt',
  vertex: 'dimVertexPrompt',
  firstRay: 'dimFirstRayPrompt',
  secondRay: 'dimSecondRayPrompt',
  circleFirstPoint: 'dimCircleFirstPointPrompt',
  circleSecondPoint: 'dimCircleSecondPointPrompt',
  rotationAngle: 'dimRotationPrompt',
  textAngle: 'dimTextAnglePrompt',
  text: 'dimTextPrompt',
};

function promptKey(snapshot: DimensionSnapshot): MessageKey {
  if (snapshot.prompt === 'selectObject')
    return snapshot.tool === 'DIMRADIUS' || snapshot.tool === 'DIMDIAMETER'
      ? 'dimSelectCirclePrompt'
      : 'dimSelectObjectPrompt';
  if (snapshot.prompt === 'placement') {
    if (snapshot.mode === 'angular') return 'dimAngularPlacementPrompt';
    if (snapshot.mode === 'aligned') return 'dimAlignedPlacementPrompt';
    if (snapshot.mode === 'radial') return 'dimRadialPlacementPrompt';
    return 'dimLinearPlacementPrompt';
  }
  return prompts[snapshot.prompt] ?? 'dimFirstOriginPrompt';
}

export function useDimensions(options: DimensionOptions) {
  const latest = useRef(options);
  latest.current = options;
  const controller = useRef<DimensionSession | null>(null);
  const [snapshot, setSnapshot] = useState<DimensionSnapshot | null>(null);
  const [styleOpen, setStyleOpen] = useState(false);
  function settings() {
    const live = latest.current;
    return dimensionSettingsFromVariables(
      creationSettings(live.getState().settings, (name) => live.sysvars.get(name)),
      (name) => live.sysvars.getNumber(name),
      (name) => String(live.sysvars.get(name)),
    );
  }
  useEffect(
    () =>
      options.sysvars.events.subscribe((event) => {
        if (event.name.startsWith('DIM')) controller.current?.setSettings(settings());
      }),
    [options.sysvars],
  );
  function changed(next: DimensionSnapshot): void {
    if (next.status === 'active') setSnapshot(next);
    else {
      controller.current = null;
      setSnapshot(null);
    }
  }
  function cancel(notify = true): boolean {
    const active = controller.current !== null;
    controller.current?.cancel();
    controller.current = null;
    setSnapshot(null);
    if (notify) latest.current.print(latest.current.messages.cancel);
    return active;
  }
  function begin(tool: DimensionTool): void {
    cancel(false);
    const live = latest.current;
    live.cancelDraft();
    const model = live.getState();
    const layer = model.layers.find((item) => item.name === model.settings.layer);
    if (layer && (!layer.visible || layer.locked)) {
      live.print(live.messages.currentLayerHidden);
      return;
    }
    const session = new DimensionSession(tool, settings(), {
      coordinates: () => coordinateSettings((name) => latest.current.sysvars.get(name)),
      onAcceptedPoint: (point) => recordStatusPoint(latest.current.sysvars, point),
      onChange: changed,
      onCommit: (entities) => {
        const current = latest.current;
        const next = appendCadEntities(current.getState(), entities);
        current.commitState(tool, { ...next, settings: settings() });
        current.print(current.messages.committedObjects(entities.length));
      },
    });
    controller.current = session;
    setSnapshot(session.getSnapshot());
  }
  function report(error?: DimensionError): void {
    if (error) latest.current.print(latest.current.messages[errors[error]]);
  }
  function pick(point: CadPoint, entity?: CadEntity): boolean {
    const active = controller.current;
    if (!active) return false;
    const result = active.acceptPick(point, entity);
    report(result.error);
    return result.status !== 'error';
  }
  function cursor(point: CadPoint, entity?: CadEntity): void {
    controller.current?.moveCursor(point, entity);
  }
  function submit(value: string): boolean {
    const active = controller.current;
    if (!active) return false;
    latest.current.print(`${latest.current.messages[promptKey(active.getSnapshot())]} ${value}`);
    const pointInput = active.getSnapshot().inputMode;
    const result = active.acceptText(value);
    report(result.error);
    if (pointInput === 'point' || pointInput === 'number')
      tempOverrides.consumeObjectSnapInput(value, result.status !== 'error');
    return true;
  }
  function applyStyle(values: DimensionStyleValues, applySelected: boolean): void {
    const live = latest.current;
    const model = live.getState();
    const style = dimensionSettingsFromVariables(
      model.settings,
      (name) => {
        const value = values[name as keyof DimensionStyleValues];
        if (typeof value !== 'number') throw new Error(`Expected numeric variable ${name}`);
        return value;
      },
      () => values.DIMPOST,
    );
    const selected = new Set(applySelected ? live.selectedIds : []);
    const state = {
      ...model,
      settings: style,
      entities: model.entities.map((entity) =>
        entity.type === 'dimension' && selected.has(entity.id)
          ? applyDimensionStyle(entity, style)
          : entity,
      ),
    };
    live.commitState('DIMSTYLE', state, values);
    live.print(live.messages.dimensionStyleChanged);
  }
  useEffect(() => {
    const ko = getMessages('ko-KR'),
      en = getMessages('en-US');
    for (const [name, label] of tools)
      options.registry.register({
        name,
        displayName: { 'ko-KR': ko[label], 'en-US': en[label] },
        description: { 'ko-KR': ko.dimensionUsage, 'en-US': en.dimensionUsage },
        execute: () => begin(name),
      });
    options.registry.register({
      name: 'DIMSTYLE',
      displayName: { 'ko-KR': ko.dimensionStyle, 'en-US': en.dimensionStyle },
      description: { 'ko-KR': ko.dimensionSettingsNote, 'en-US': en.dimensionSettingsNote },
      execute: () => {
        cancel(false);
        setStyleOpen(true);
      },
    });
  }, [options.registry, options.messages]);

  const selected = new Set(options.selectedIds);
  return {
    snapshot,
    prompt: snapshot ? options.messages[promptKey(snapshot)] : null,
    editable: snapshot?.inputMode === 'text',
    active: snapshot !== null,
    styleOpen,
    closeStyle: () => setStyleOpen(false),
    applyStyle,
    selectedDimensionCount: selected.size
      ? options
          .getState()
          .entities.filter((entity) => entity.type === 'dimension' && selected.has(entity.id))
          .length
      : 0,
    begin,
    cancel,
    submit,
    pick,
    cursor,
    isActive: () => controller.current !== null,
    needsPoint: () => controller.current?.getSnapshot().inputMode === 'point',
    needsEntity: () => controller.current?.getSnapshot().inputMode === 'entity',
  };
}
