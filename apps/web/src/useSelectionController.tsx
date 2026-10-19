import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  cadGroupBounds,
  closestCadPolylineSegment,
  deleteCadEntities,
  filterCadSelection,
  GroupSession,
  SelectionSession,
  selectCadArea,
  selectCadPath,
  selectSimilarCadEntities,
  updateCadSelection,
  expandSelectionGroups,
  matchesCadFilter,
  validateCadFilterExpression,
} from '@hancad/draft';
import type { GroupTool, SelectionPathMode } from '@hancad/draft';
import type { CadFilterExpression, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import type { CommandRegistry } from '@hancad/commands';
import type { SystemVariables } from '@hancad/sysvars';
import type { Messages } from '@hancad/ui';
import { SelectionDialogs } from './SelectionDialogs';
import { SelectionSettingsDialog } from './SelectionSettingsDialog';
import type { SelectionDialogKind } from './SelectionDialogs';
import { selectionFilterStore } from './selection-filter-store';
import { registerSelectionCommands } from './selection-command-registration';

type SelectionMode = 'SELECT' | 'ERASE' | 'SELECTSIMILAR' | 'FILTER' | GroupTool;

export interface SelectionControllerOptions {
  registry: CommandRegistry;
  sysvars: SystemVariables;
  messages: Messages;
  state: LegacyCadState;
  getState: () => LegacyCadState;
  commitState: (label: string, state: LegacyCadState) => void;
  print: (message: string) => void;
  cancelDraft: () => void;
  onSelectionComplete?: () => void;
  selectionPromptActive?: () => boolean;
}
export function useSelectionController(options: SelectionControllerOptions) {
  const latest = useRef(options);
  latest.current = options;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectionRef = useRef<string[]>([]);
  const [selectedSubobjects, setSelectedSubobjects] = useState<Record<string, number[]>>({});
  const mode = useRef<SelectionMode | null>(null);
  const group = useRef<GroupSession | null>(null);
  const activeFilter = useRef<CadFilterExpression | null>(null);
  const filterParent = useRef<{
    mode: SelectionMode | null;
    group: GroupSession | null;
    ids: string[];
  } | null>(null);
  const filters = useSyncExternalStore(
    selectionFilterStore.subscribe,
    selectionFilterStore.snapshot,
  );
  const [dialog, setDialog] = useState<SelectionDialogKind | null>(null);
  const filterDialogOpen = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [, redraw] = useState(0);
  function changed(): void {
    redraw((value) => value + 1);
  }
  const korean = () => latest.current.messages.commandPrompt === '명령:';
  function replace(ids: string[]): void {
    selectionRef.current = ids;
    setSelectedIds(ids);
    setSelectedSubobjects((previous) =>
      Object.fromEntries(Object.entries(previous).filter(([id]) => ids.includes(id))),
    );
  }
  function apply(ids: readonly string[], remove = false, forceAdd = false): void {
    const live = latest.current;
    const state = live.getState();
    const expanded = activeFilter.current
      ? new Set(expandSelectionGroups(state, ids, live.sysvars.getNumber('PICKSTYLE')))
      : null;
    const picked = expanded
      ? state.entities
          .filter(
            (entity) =>
              expanded.has(entity.id) && matchesCadFilter(entity, activeFilter.current!, state),
          )
          .map((entity) => entity.id)
      : ids;
    const result = updateCadSelection(state, selectionRef.current, picked, {
      pickadd: live.sysvars.getNumber('PICKADD'),
      pickstyle:
        activeFilter.current || group.current?.stage === 'remove'
          ? 0
          : live.sysvars.getNumber('PICKSTYLE'),
      remove,
      forceAdd,
    });
    replace(result.ids);
    if (mode.current || result.locked || live.selectionPromptActive?.()) {
      const total = result.ids.length;
      live.print(
        korean()
          ? `${result.found}개를 찾음${result.duplicates ? `, ${result.duplicates}개 중복` : ''}, 총 ${total}개`
          : `${result.found} found${result.duplicates ? `, ${result.duplicates} duplicate` : ''}, ${total} total`,
      );
      if (result.locked)
        live.print(
          korean()
            ? `${result.locked}개가 잠긴 도면층에 있습니다.`
            : `${result.locked} were on a locked layer.`,
        );
    }
  }
  function stop(): void {
    mode.current = null;
    group.current = null;
    activeFilter.current = null;
    filterParent.current = null;
    selection.current?.reset();
    changed();
  }
  function erase(): void {
    const live = latest.current;
    selection.current?.remember();
    const result = deleteCadEntities(live.getState(), selectionRef.current);
    if (result.deleted) {
      live.commitState('ERASE', result.state);
      replace([]);
      live.print(live.messages.erasedObjects(result.deleted));
    } else live.print(live.messages.noSelection);
    stop();
  }
  function finish(): void {
    const live = latest.current;
    if (mode.current === 'FILTER') {
      const parent = filterParent.current,
        picked = [...selectionRef.current];
      selection.current?.remember();
      stop();
      if (parent) {
        mode.current = parent.mode;
        group.current = parent.group;
        replace([...new Set([...parent.ids, ...picked])]);
        changed();
      }
      return;
    }
    if (!mode.current) {
      selection.current?.remember();
      selection.current?.reset();
      live.onSelectionComplete?.();
      return;
    }
    if (group.current) {
      group.current.submit('');
      changed();
      return;
    }
    selection.current?.remember();
    if (mode.current === 'ERASE') {
      erase();
      return;
    }
    if (mode.current === 'SELECTSIMILAR')
      replace(
        selectSimilarCadEntities(
          live.getState(),
          selectionRef.current,
          live.sysvars.getNumber('SELECTSIMILARMODE'),
        ),
      );
    if (mode.current === 'SELECT' && live.sysvars.getNumber('PICKADD') !== 2) replace([]);
    stop();
  }
  const selection = useRef<SelectionSession | null>(null);
  selection.current ??= new SelectionSession({
    getState: () => latest.current.getState(),
    getIds: () => selectionRef.current,
    select: apply,
    replace,
    print: (text) => latest.current.print(text),
    changed,
    finish,
    korean,
  });
  const session = selection.current;
  function selectIds(ids: readonly string[], remove = false): void {
    session.apply(ids, remove);
  }
  function pickSubobject(entityId: string, point: CadPoint, remove = false): void {
    const entity = latest.current.getState().entities.find((item) => item.id === entityId);
    if (entity?.type !== 'polyline' && entity?.type !== 'rect') return;
    const index = closestCadPolylineSegment(entity, point);
    if (index === undefined) return;
    if (!remove && !selectionRef.current.includes(entityId)) apply([entityId], false, true);
    setSelectedSubobjects((previous) => {
      const indices = previous[entityId] ?? [];
      return {
        ...previous,
        [entityId]: remove ? indices.filter((i) => i !== index) : [...new Set([...indices, index])],
      };
    });
  }
  function cancel(notify = false): boolean {
    if (filterDialogOpen.current) {
      filterDialogOpen.current = false;
      setDialog(null);
      return true;
    }
    const hadActive = mode.current !== null || !!session.gesture;
    if (hadActive) {
      const parent = filterParent.current;
      stop();
      if (parent) {
        mode.current = parent.mode;
        group.current = parent.group;
        replace(parent.ids);
        changed();
      }
    } else replace([]);
    if (notify && hadActive) latest.current.print(latest.current.messages.cancel);
    return hadActive;
  }
  function startFilter(expression: CadFilterExpression): void {
    validateCadFilterExpression(expression);
    const nested = mode.current !== null || latest.current.selectionPromptActive?.();
    const parent = nested
      ? { mode: mode.current, group: group.current, ids: [...selectionRef.current] }
      : null;
    if (!nested) latest.current.cancelDraft();
    stop();
    filterParent.current = parent;
    activeFilter.current = expression;
    mode.current = 'FILTER';
    replace([]);
    changed();
  }
  function begin(command: 'SELECT' | 'ERASE' | 'SELECTSIMILAR' | GroupTool): void {
    latest.current.cancelDraft();
    stop();
    mode.current = command;
    if (latest.current.sysvars.getNumber('PICKFIRST') === 0) replace([]);
    if (command === 'ERASE' && selectionRef.current.length) {
      erase();
      return;
    }
    if (command === 'SELECTSIMILAR' && selectionRef.current.length) {
      finish();
      return;
    }
    if (['GROUP', '-GROUP', 'GROUPEDIT', 'UNGROUP'].includes(command)) {
      group.current = new GroupSession(command as GroupTool, {
        state: () => latest.current.getState(),
        ids: () => selectionRef.current,
        clear: () => replace([]),
        commit: (state) => latest.current.commitState(command, state),
        print: (text) => latest.current.print(text),
        finish: stop,
        korean,
      });
      if ((command === 'GROUP' || command === '-GROUP') && selectionRef.current.length)
        group.current.submit('');
      else if (selectionRef.current.length && command !== 'GROUP' && command !== '-GROUP')
        group.current.pick(selectionRef.current[0]!);
    }
    changed();
  }
  function submitSelection(value: string): boolean {
    const accepted = session.submit(value);
    if (accepted) changed();
    return accepted;
  }
  function submit(value: string): boolean {
    if (!mode.current)
      return session.gesture || session.expectsGroupName ? submitSelection(value) : false;
    const keyword = value.trim().toUpperCase();
    if (mode.current === 'SELECTSIMILAR' && ['SE', 'SETTINGS'].includes(keyword)) {
      setDialog('similar');
      return true;
    }
    if (session.gesture) return submitSelection(value);
    if (group.current && group.current.submit(value)) {
      changed();
      return true;
    }
    if (submitSelection(value)) return true;
    if (!value.trim()) finish();
    else
      latest.current.print(
        korean() ? '점 또는 옵션 키워드가 필요합니다.' : 'Point or option keyword required.',
      );
    return true;
  }
  function pick(point: CadPoint, entityId: string | undefined, shift = false): boolean {
    if (group.current && entityId && group.current.pick(entityId)) {
      changed();
      return true;
    }
    if (session.point(point)) return true;
    if (entityId) selectIds([entityId], shift);
    else if (session.automatic && latest.current.sysvars.getNumber('PICKAUTO') & 1) {
      session.gesture = { kind: 'box', points: [point] };
      changed();
    }
    return !!entityId;
  }
  useEffect(() => {
    const present = new Set(options.state.entities.map((entity) => entity.id));
    replace(selectionRef.current.filter((id) => present.has(id)));
    if (session.previous.some((id) => !present.has(id))) session.previous = [];
  }, [options.state]);
  useEffect(() => {
    registerSelectionCommands(options.registry, {
      begin,
      selectAll: () => selectIds(latest.current.getState().entities.map((entity) => entity.id)),
      openSettings: () => setSettingsOpen(true),
      openDialog: (kind) => {
        filterDialogOpen.current = kind === 'filter';
        setDialog(kind);
      },
    });
  }, [options.registry]);
  const dialogs = (
    <SelectionDialogs
      kind={dialog}
      korean={korean()}
      similarMode={options.sysvars.getNumber('SELECTSIMILARMODE')}
      hasSelection={selectedIds.length > 0}
      filters={filters}
      close={() => {
        filterDialogOpen.current = false;
        setDialog(null);
      }}
      setSimilarMode={(value) => latest.current.sysvars.set('SELECTSIMILARMODE', value)}
      saveFilter={(name, expression) => selectionFilterStore.save(name, expression)}
      apply={(expression, settings) => {
        if (dialog === 'filter') {
          startFilter(expression);
          return;
        }
        const live = latest.current;
        const ids = filterCadSelection(
          live.getState(),
          expression,
          settings.current ? selectionRef.current : undefined,
          settings.exclude,
        );
        replace(settings.append ? [...new Set([...selectionRef.current, ...ids])] : ids);
        live.print(korean() ? `${ids.length}개를 찾음` : `${ids.length} found`);
      }}
    />
  );
  return {
    selectedIds,
    visibleSelectedIds: session.multiple ? [] : selectedIds,
    selectedSubobjects,
    pickSubobject,
    prompt:
      mode.current || session.gesture || session.expectsGroupName
        ? (group.current?.prompt ?? session.prompt)
        : null,
    editable: (group.current?.editable ?? false) || session.expectsGroupName,
    inputMode:
      group.current?.editable || session.expectsGroupName
        ? ('text' as const)
        : ('selection' as const),
    dialogs: (
      <>
        {dialogs}
        <SelectionSettingsDialog
          open={settingsOpen}
          close={() => setSettingsOpen(false)}
          sysvars={options.sysvars}
          korean={korean()}
        />
      </>
    ),
    selecting: mode.current !== null || session.gesture !== undefined || session.expectsGroupName,
    selectIds,
    erase,
    submit,
    submitSelection,
    pick,
    cancel,
    selectAll: () => selectIds(latest.current.getState().entities.map((entity) => entity.id)),
    selectArea: (
      a: CadPoint,
      b: CadPoint,
      remove = false,
      kind: 'window' | 'crossing' | 'box' = 'box',
    ) => {
      session.gesture = undefined;
      selectIds(selectCadArea(latest.current.getState(), a, b, kind, true), remove);
      changed();
    },
    selectPath: (points: readonly CadPoint[], kind: SelectionPathMode, remove = false) => {
      session.gesture = undefined;
      selectIds(selectCadPath(latest.current.getState(), points, kind, true), remove);
      changed();
    },
    getSelectionGesture: () => session.gesture,
    hasSelectionSubprompt: () => session.gesture !== undefined || session.expectsGroupName,
    beginImpliedWindow: (point: CadPoint) => {
      session.gesture = { kind: 'box', points: [{ ...point }] };
      changed();
    },
    rememberSelection: (ids?: readonly string[]) => session.remember(ids),
    resetSelectionPrompt: () => session.reset(),
    selectionKeywords: 'W C BOX ALL F WP CP G A R M P U AU SI SU O L'.split(' '),
    clearSelection: () => replace([]),
    getSelectedIds: () => selectionRef.current,
    isActive: () =>
      mode.current !== null || session.gesture !== undefined || session.expectsGroupName,
    isSubobjectSelection: () => session.subobject,
    isFilterSelection: () => mode.current === 'FILTER',
    isFilterCommandActive: () => filterDialogOpen.current || mode.current === 'FILTER',
    groupBounds:
      options.sysvars.getNumber('GROUPDISPLAYMODE') === 2
        ? cadGroupBounds(options.state, selectedIds, options.sysvars.getNumber('PICKSTYLE'))
        : [],
  };
}
