import { useEffect, useRef, useState } from 'react';
import type { CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import type { CommandRegistry } from '@hancad/commands';
import type { SystemVariables } from '@hancad/sysvars';
import { defaultMatchSettings, PropertyMatchSession } from './properties-match';
import type { MatchSettings } from './properties-match';
import { PropertiesMatchDialog } from './PropertiesMatchDialog';
import { isolateObjects } from './object-isolation';
import { endPropertyIsolation, registerPropertyCommands } from './properties-commands';

export interface PropertyCommandOptions {
  registry: CommandRegistry;
  sysvars: SystemVariables;
  getState: () => LegacyCadState;
  commitState: (label: string, state: LegacyCadState) => void;
  selectedIds: readonly string[];
  korean: boolean;
  getSelectedIds?: () => readonly string[];
  selectIds?: (ids: readonly string[]) => void;
  clearSelection?: () => void;
  cancelOthers?: () => void;
  print?: (message: string) => void;
  getPropertyState?: () => LegacyCadState;
  commitPropertyState?: (label: string, state: LegacyCadState) => void;
  pickEntityId?: (point: CadPoint) => string | undefined;
}
type Command = 'MATCHPROP' | 'ISOLATEOBJECTS' | 'HIDEOBJECTS';
interface Snapshot {
  command: Command;
  sourceId?: string;
}

export function usePropertyCommands(options: PropertyCommandOptions) {
  const latest = useRef(options);
  latest.current = options;
  const running = useRef<Snapshot | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<MatchSettings>(defaultMatchSettings);
  const currentSettings = useRef(settings);
  currentSettings.current = settings;
  const match = useRef<PropertyMatchSession | null>(null);
  const [, setPreviewRevision] = useState(0);
  function state(): LegacyCadState {
    return latest.current.getPropertyState?.() ?? latest.current.getState();
  }
  function selected(): readonly string[] {
    return latest.current.getSelectedIds?.() ?? latest.current.selectedIds;
  }
  function publish(value: Snapshot | null): void {
    running.current = value;
    setSnapshot(value);
  }
  function source(id: string): void {
    match.current = new PropertyMatchSession(state(), id);
    publish({ command: 'MATCHPROP', sourceId: id });
    latest.current.clearSelection?.();
  }
  function acceptTargets(): void {
    const effective = {
      ...currentSettings.current,
      plotStyle:
        currentSettings.current.plotStyle && latest.current.sysvars.getNumber('PSTYLEMODE') === 0,
    };
    if (match.current?.accept(selected(), effective)) setPreviewRevision((value) => value + 1);
  }
  function cancel(notify = true): boolean {
    const active = !!running.current;
    const current = running.current;
    if (current?.command === 'MATCHPROP' && current.sourceId) {
      acceptTargets();
      if (match.current?.hasTargets) commit('MATCHPROP', match.current.state);
      latest.current.clearSelection?.();
    }
    match.current = null;
    publish(null);
    setSettingsOpen(false);
    if (notify && active) latest.current.print?.(latest.current.korean ? '*취소*' : '*Cancel*');
    return active;
  }
  function commit(command: string, next: LegacyCadState): void {
    const live = latest.current;
    (live.commitPropertyState ?? live.commitState)(command, next);
  }
  function finish(): void {
    const current = running.current;
    if (!current) return;
    const ids = selected(),
      live = latest.current;
    if (!ids.length && !match.current?.hasTargets) {
      cancel(false);
      return;
    }
    if (current.command === 'MATCHPROP' && current.sourceId) {
      acceptTargets();
      if (match.current?.hasTargets) commit('MATCHPROP', match.current.state);
    } else if (current.command !== 'MATCHPROP')
      commit(
        current.command,
        isolateObjects(
          state(),
          ids,
          current.command,
          live.sysvars.getNumber('OBJECTISOLATIONMODE'),
        ),
      );
    publish(null);
    match.current = null;
    live.clearSelection?.();
    setSettingsOpen(false);
  }
  function begin(command: Command): void {
    cancel(false);
    latest.current.cancelOthers?.();
    const live = latest.current;
    const ids = live.sysvars.getNumber('PICKFIRST') ? selected() : [];
    if (!live.sysvars.getNumber('PICKFIRST')) live.clearSelection?.();
    publish({ command });
    if (command === 'MATCHPROP') {
      if (ids.length === 1) {
        source(ids[0]!);
      }
    } else if (ids.length) finish();
  }
  function pick(event: { point: CadPoint; entityId?: string }): boolean {
    const current = running.current;
    if (!current || settingsOpen || (current.command === 'MATCHPROP' && current.sourceId))
      return false;
    if (current.command !== 'MATCHPROP') return false;
    const id = event.entityId ?? latest.current.pickEntityId?.(event.point);
    if (id && state().entities.some((entity) => entity.id === id)) {
      source(id);
    }
    return true;
  }
  function submit(value: string): boolean {
    const current = running.current;
    if (!current) return false;
    if (settingsOpen) return true;
    const text = value.trim();
    if (current.command === 'MATCHPROP' && current.sourceId && /^_?(S|SETTINGS)$/i.test(text)) {
      acceptTargets();
      setSettingsOpen(true);
      return true;
    }
    if (current.command === 'MATCHPROP' && !current.sourceId) {
      const id = state().entities.find((entity) => entity.id === text)?.id;
      if (id) {
        source(id);
      } else if (!text) cancel(false);
      else
        latest.current.print?.(
          latest.current.korean ? '객체를 선택하십시오.' : 'Select an object.',
        );
    } else if (!text) finish();
    else {
      const ids = text
        .split(/[\s,]+/)
        .filter((id) => state().entities.some((entity) => entity.id === id));
      if (ids.length) latest.current.selectIds?.([...new Set([...selected(), ...ids])]);
    }
    return true;
  }
  useEffect(() => {
    if (snapshot?.command === 'MATCHPROP' && snapshot.sourceId) acceptTargets();
  }, [options.selectedIds, snapshot?.sourceId]);
  useEffect(() => {
    registerPropertyCommands(options.registry, {
      host: () => latest.current,
      begin,
      endIsolation: () => {
        cancel(false);
        latest.current.cancelOthers?.();
        endPropertyIsolation(latest.current);
      },
      beforeQueued: () => {
        cancel(false);
        latest.current.cancelOthers?.();
      },
      getSettings: () => currentSettings.current,
      setSettings: (next) => {
        currentSettings.current = next;
        setSettings(next);
      },
    });
  }, [options.registry]);
  const selects = !!snapshot && (snapshot.command !== 'MATCHPROP' || !!snapshot.sourceId);
  const prompt = !snapshot
    ? null
    : snapshot.command === 'MATCHPROP' && !snapshot.sourceId
      ? options.korean
        ? '원본 객체 선택:'
        : 'Select source object:'
      : snapshot.command === 'MATCHPROP'
        ? options.korean
          ? '대상 객체 선택 또는 [설정(S)]:'
          : 'Select destination object(s) or [Settings]:'
        : options.korean
          ? '객체 선택:'
          : 'Select objects:';
  const previewState = match.current?.hasTargets ? match.current.state : undefined;
  return {
    snapshot,
    prompt,
    active: !!snapshot,
    selecting: selects,
    inputMode: snapshot ? (selects ? ('selection' as const) : ('point' as const)) : undefined,
    previewState,
    isActive: () => !!running.current,
    isSelecting: () =>
      !!running.current && (running.current.command !== 'MATCHPROP' || !!running.current.sourceId),
    cancel,
    submit,
    pick,
    panels: settingsOpen ? (
      <PropertiesMatchDialog
        settings={settings}
        plotStyleAvailable={options.sysvars.getNumber('PSTYLEMODE') === 0}
        korean={options.korean}
        close={() => setSettingsOpen(false)}
        apply={(next) => {
          setSettings(next);
          setSettingsOpen(false);
        }}
      />
    ) : null,
  };
}
