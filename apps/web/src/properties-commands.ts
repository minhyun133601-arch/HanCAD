import type { CommandContext, CommandRegistry } from '@hancad/commands';
import type { LegacyCadState } from '@hancad/legacy-bridge';
import { visibleCadEntities } from '@hancad/legacy-bridge';
import { InputCancelled } from '@hancad/editor';
import { updateCadSelection } from '@hancad/draft';
import { isolateObjects, isolatedObjectIds, unisolateObjects } from './object-isolation';
import { matchPropertyLabels, PropertyMatchSession } from './properties-match';
import type { MatchProperty, MatchSettings } from './properties-match';

export type PropertyCommand = 'MATCHPROP' | 'ISOLATEOBJECTS' | 'HIDEOBJECTS';
interface Host {
  getState: () => LegacyCadState;
  getPropertyState?: () => LegacyCadState;
  commitState: (label: string, state: LegacyCadState) => void;
  commitPropertyState?: (label: string, state: LegacyCadState) => void;
  getSelectedIds?: () => readonly string[];
  selectedIds: readonly string[];
  clearSelection?: () => void;
}
interface Options {
  host: () => Host;
  begin: (command: PropertyCommand) => void;
  endIsolation: () => void;
  beforeQueued?: () => void;
  getSettings: () => MatchSettings;
  setSettings: (settings: MatchSettings) => void;
}
function message(context: CommandContext, ko: string, en: string): Error {
  return new Error(context.locale === 'ko-KR' ? ko : en);
}
function readDialogSettings(context: CommandContext): MatchSettings {
  const settings: Partial<Record<MatchProperty, boolean>> = {};
  // Headless dialog answers follow the same checkbox order as Property Settings.
  for (const key of Object.keys(matchPropertyLabels) as MatchProperty[]) {
    const value = context.input.take();
    if (typeof value !== 'boolean')
      throw message(
        context,
        '특성 설정 확인란에 논리 값이 필요합니다.',
        'Property Settings checkboxes require boolean answers.',
      );
    settings[key] = value;
  }
  return settings as MatchSettings;
}
function selection(state: LegacyCadState, input: string, context: CommandContext): string[] {
  const text = input.trim(),
    all = /^_?ALL$/i.test(text);
  const ids = all ? state.entities.map((entity) => entity.id) : text.split(/[\s,]+/);
  const present = new Set(state.entities.map((entity) => entity.id));
  if (!all && ids.some((id) => !present.has(id)))
    throw message(context, '객체를 찾을 수 없습니다.', 'Object not found.');
  return updateCadSelection(state, [], ids, {
    pickadd: context.sysvars.getNumber('PICKADD'),
    pickstyle: context.sysvars.getNumber('PICKSTYLE'),
  }).ids;
}
function runQueued(command: PropertyCommand, context: CommandContext, options: Options): void {
  options.beforeQueued?.();
  const host = options.host(),
    state = host.getPropertyState?.() ?? host.getState();
  const commit = host.commitPropertyState ?? host.commitState;
  const implied = context.sysvars.getNumber('PICKFIRST')
    ? (host.getSelectedIds?.() ?? host.selectedIds)
    : [];
  if (command !== 'MATCHPROP') {
    const selected = new Set(implied.length ? selection(state, implied.join(','), context) : []);
    if (!implied.length) {
      while (context.input.remaining) {
        const value = context.input.requireString();
        if (!value.trim()) break;
        for (const id of selection(state, value, context)) selected.add(id);
      }
    }
    if (selected.size)
      commit(
        command,
        isolateObjects(
          state,
          [...selected],
          command,
          context.sysvars.getNumber('OBJECTISOLATIONMODE'),
        ),
      );
    host.clearSelection?.();
    return;
  }
  const sourceId = implied.length === 1 ? implied[0]! : context.input.requireString().trim();
  if (!sourceId) {
    host.clearSelection?.();
    return;
  }
  if (!visibleCadEntities(state).some((entity) => entity.id === sourceId))
    throw message(context, '원본 객체를 찾을 수 없습니다.', 'Source object not found.');
  const session = new PropertyMatchSession(state, sourceId);
  const finish = () => {
    if (session.hasTargets) commit('MATCHPROP', session.state);
    host.clearSelection?.();
  };
  try {
    while (context.input.remaining) {
      const value = context.input.requireString();
      if (!value.trim()) break;
      if (/^_?(S|SETTINGS)$/i.test(value.trim())) {
        options.setSettings(readDialogSettings(context));
        continue;
      }
      const settings = options.getSettings();
      session.accept(selection(state, value, context), {
        ...settings,
        plotStyle: settings.plotStyle && context.sysvars.getNumber('PSTYLEMODE') === 0,
      });
    }
  } catch (error) {
    if (error instanceof InputCancelled) finish();
    throw error;
  }
  finish();
}

export function registerPropertyCommands(registry: CommandRegistry, options: Options): void {
  for (const command of ['MATCHPROP', 'ISOLATEOBJECTS', 'HIDEOBJECTS'] as const)
    registry.register({
      name: command,
      displayName: {
        'ko-KR': command === 'MATCHPROP' ? '특성 일치' : '객체 격리/숨기기',
        'en-US': command,
      },
      description: {
        'ko-KR': '객체 특성 또는 표시 상태를 변경합니다.',
        'en-US': 'Change object properties or visibility.',
      },
      execute: (context) =>
        context.input.remaining ? runQueued(command, context, options) : options.begin(command),
    });
  registry.register({
    name: 'UNISOLATEOBJECTS',
    displayName: { 'ko-KR': '객체 격리 끝내기', 'en-US': 'End Object Isolation' },
    description: {
      'ko-KR': '숨기거나 격리한 객체를 다시 표시합니다.',
      'en-US': 'Display isolated or hidden objects again.',
    },
    execute: () => options.endIsolation(),
  });
}

/** Shared immediate command for both interactive and queued UNISOLATEOBJECTS. */
export function endPropertyIsolation(host: Host): void {
  const state = host.getPropertyState?.() ?? host.getState();
  if (isolatedObjectIds(state).length)
    (host.commitPropertyState ?? host.commitState)('UNISOLATEOBJECTS', unisolateObjects(state));
}
