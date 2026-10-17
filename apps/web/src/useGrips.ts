import { useEffect, useRef, useState } from 'react';
import {
  collectEntityGrips,
  coordinateSettings,
  GripSession,
  nearestEntityGrip,
} from '@hancad/draft';
import type {
  DisplayGrip,
  DraftPointOptions,
  EntityGrip,
  GripAction,
  GripMode,
  GripResult,
  GripSnapshot,
  PointSnapOverride,
} from '@hancad/draft';
import type { CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import type { CommandRegistry } from '@hancad/commands';
import type { SystemVariables } from '@hancad/sysvars';
import type { Messages } from '@hancad/ui';
import { tempOverrides } from './temp-overrides';
import { recordStatusPoint } from './status-point-store';

interface Options {
  registry: CommandRegistry;
  sysvars: SystemVariables;
  messages: Messages;
  getState: () => LegacyCadState;
  getSelectedIds: () => readonly string[];
  getSelectedSubobjects?: () => Readonly<Record<string, readonly number[]>>;
  clearSelection: () => void;
  commitState: (label: string, state: LegacyCadState) => void;
  cancelOthers: () => void;
  print: (message: string) => void;
  resolveTypedPoint?: (
    point: CadPoint,
    override?: PointSnapOverride,
  ) => ({ point: CadPoint } & DraftPointOptions) | undefined;
}
export interface GripMenuState {
  grip: EntityGrip;
  x: number;
  y: number;
}
const identity = (grip: EntityGrip): string => `${grip.entityId}/${grip.key}`;

export function useGrips(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const controller = useRef<GripSession | null>(null);
  const hot = useRef(new Set<string>());
  const hoverRef = useRef<EntityGrip | undefined>(undefined);
  const pointerRevision = useRef(0);
  const hoverPointerRevision = useRef(0);
  const pointerOnCanvas = useRef(false);
  const tipTarget = useRef<{ canvas: HTMLCanvasElement; title: string } | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cache = useRef<
    { state: LegacyCadState; ids: string; settings: string; items: EntityGrip[] } | undefined
  >(undefined);
  const [snapshot, setSnapshot] = useState<GripSnapshot | null>(null);
  const [hoveredGrip, setHoveredGrip] = useState<EntityGrip | undefined>(undefined);
  const [menu, setMenu] = useState<GripMenuState | null>(null);
  const [, revision] = useState(0);
  const korean = (): boolean => latest.current.messages.cancel.includes('취소');
  function refresh(): void {
    setSnapshot(controller.current?.getSnapshot(korean()) ?? null);
    revision((value) => value + 1);
  }
  function getGrips(): DisplayGrip[] {
    const live = latest.current;
    const state = live.getState(),
      ids = live.getSelectedIds();
    const settings = {
      grips: live.sysvars.getNumber('GRIPS'),
      limit: live.sysvars.getNumber('GRIPOBJLIMIT'),
      multifunctional: live.sysvars.getNumber('GRIPMULTIFUNCTIONAL'),
      block: live.sysvars.getNumber('GRIPBLOCK'),
      groupMode: live.sysvars.getNumber('GROUPDISPLAYMODE'),
      pickstyle: live.sysvars.getNumber('PICKSTYLE'),
    };
    const subobjects = live.getSelectedSubobjects?.() ?? {};
    const idKey = ids.join('\0') + JSON.stringify(subobjects),
      settingsKey = JSON.stringify(settings);
    if (
      !cache.current ||
      cache.current.state !== state ||
      cache.current.ids !== idKey ||
      cache.current.settings !== settingsKey
    ) {
      const entities = new Map(
        state.entities
          .filter((entity) => subobjects[entity.id]?.length)
          .map((entity) => [entity.id, entity]),
      );
      const items = collectEntityGrips(state, ids, settings).filter((grip) => {
        const segments = subobjects[grip.entityId],
          entity = entities.get(grip.entityId);
        if (!segments?.length || !entity || (entity.type !== 'polyline' && entity.type !== 'rect'))
          return true;
        const index = Number(grip.key.slice(1));
        return grip.key.startsWith('s')
          ? segments.includes(index)
          : segments.some(
              (segment) => segment === index || (segment + 1) % entity.points.length === index,
            );
      });
      cache.current = {
        state,
        ids: idKey,
        settings: settingsKey,
        items,
      };
    }
    return cache.current.items.map((item) => ({
      ...item,
      hot: hot.current.has(identity(item)),
      hover: hoverRef.current !== undefined && identity(hoverRef.current) === identity(item),
    }));
  }
  function closeMenu(): void {
    clearTimeout(timer.current);
    timer.current = undefined;
    setMenu(null);
  }
  function finish(): void {
    const active = controller.current;
    if (active?.getSnapshot().changed) latest.current.commitState('GRIP', active.getResult());
    controller.current = null;
    hot.current.clear();
    hoverPointerRevision.current = pointerRevision.current;
    hoverRef.current = undefined;
    setHoveredGrip(undefined);
    closeMenu();
    refresh();
  }
  function begin(grip: EntityGrip): GripSession {
    clearTip();
    hoverPointerRevision.current = pointerRevision.current;
    hoverRef.current = undefined;
    setHoveredGrip(undefined);
    latest.current.cancelOthers();
    closeMenu();
    hot.current.add(identity(grip));
    const live = latest.current;
    const active = new GripSession(
      live.getState(),
      live.getSelectedIds(),
      getGrips().filter((item) => item.hot),
      grip,
      {
        coordinates: () => coordinateSettings((name) => latest.current.sysvars.get(name)),
        resolveTypedPoint: (point, override) => {
          const resolved = latest.current.resolveTypedPoint?.(point, override);
          return resolved?.point ?? (override && override !== 'none' ? null : point);
        },
        onSnapOverride: (mode) => tempOverrides.setObjectSnap(mode),
        onAcceptedPoint: (point) => recordStatusPoint(latest.current.sysvars, point),
        mirrorText: () => latest.current.sysvars.getNumber('MIRRTEXT') === 1,
        getSnapOverride: () => tempOverrides.getObjectSnap(),
        copyGroups: () => (latest.current.sysvars.getNumber('PICKSTYLE') & 1) !== 0,
      },
    );
    controller.current = active;
    refresh();
    return active;
  }
  function apply(result: GripResult): void {
    if (result.error) latest.current.print(latest.current.messages.invalidPoint);
    if (result.accepted) tempOverrides.consumeObjectSnap();
    if (result.finish) finish();
    else refresh();
  }
  function pickGrip(point: CadPoint, tolerance: number, shift = false): boolean {
    if (controller.current) return false;
    const grip = nearestEntityGrip(getGrips(), point, tolerance);
    if (!grip) return false;
    if (shift) {
      const id = identity(grip);
      if (hot.current.has(id)) hot.current.delete(id);
      else hot.current.add(id);
      closeMenu();
      refresh();
    } else begin(grip);
    return true;
  }
  function pick(point: CadPoint, _snapped = false, copy = false): boolean {
    const active = controller.current;
    if (!active) return false;
    if (copy) active.acceptText('C');
    apply(active.acceptPoint(point));
    return true;
  }
  function hover(
    point: CadPoint,
    tolerance: number,
    screen?: { x: number; y: number },
  ): EntityGrip | undefined {
    if (controller.current) return;
    const movedPointer =
      pointerOnCanvas.current && pointerRevision.current !== hoverPointerRevision.current;
    hoverPointerRevision.current = pointerRevision.current;
    const grip = nearestEntityGrip(getGrips(), point, tolerance);
    const rearmHover =
      movedPointer && screen !== undefined && timer.current === undefined && menu === null;
    if (
      (grip && hoverRef.current && identity(grip) === identity(hoverRef.current) && !rearmHover) ||
      (!grip && !hoverRef.current)
    )
      return grip;
    closeMenu();
    hoverRef.current = grip;
    setHoveredGrip(grip);
    clearTip();
    if (grip && screen && latest.current.sysvars.getNumber('GRIPTIPS') === 1) {
      const canvas = document.elementFromPoint(screen.x, screen.y);
      if (canvas instanceof HTMLCanvasElement) {
        tipTarget.current = { canvas, title: canvas.title };
        canvas.title = korean() ? '그립을 클릭하여 편집' : 'Click grip to edit';
      }
    }
    if (
      grip &&
      screen &&
      movedPointer &&
      (latest.current.sysvars.getNumber('GRIPMULTIFUNCTIONAL') & 2) !== 0 &&
      grip.actions.length > 1
    )
      timer.current = setTimeout(() => setMenu({ grip, ...screen }), 500);
    refresh();
    return grip;
  }
  function openMenu(point: CadPoint, tolerance: number, x: number, y: number): boolean {
    const grip = controller.current?.getAnchor() ?? nearestEntityGrip(getGrips(), point, tolerance);
    if (!grip) return false;
    closeMenu();
    setMenu({ grip, x, y });
    return true;
  }
  function action(grip: EntityGrip, value: GripAction): void {
    const active = begin(grip);
    apply(active.setAction(value));
  }
  function cycleAction(): boolean {
    if ((latest.current.sysvars.getNumber('GRIPMULTIFUNCTIONAL') & 1) === 0) return false;
    if (controller.current) {
      if (controller.current.getSnapshot().mode !== 'STRETCH') return false;
      if (controller.current.getAnchor().actions.length < 2) return false;
      apply(controller.current.cycleAction());
      return true;
    }
    const grip = hoverRef.current;
    if (!grip || grip.actions.length < 2) return false;
    const active = begin(grip);
    apply(active.cycleAction());
    return true;
  }
  function cancel(notify = true): boolean {
    const had = controller.current !== null || hot.current.size > 0;
    finish();
    if (notify && had) latest.current.print(latest.current.messages.cancel);
    return had;
  }
  function clearTip(): void {
    if (tipTarget.current) tipTarget.current.canvas.title = tipTarget.current.title;
    tipTarget.current = undefined;
  }
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTip();
    },
    [],
  );
  const tips = options.sysvars.getNumber('GRIPTIPS');
  useEffect(() => {
    if (tips === 0) clearTip();
  }, [tips]);
  useEffect(() => {
    function pointer(event: PointerEvent): void {
      pointerRevision.current++;
      pointerOnCanvas.current = event.target instanceof HTMLCanvasElement;
      if (
        !pointerOnCanvas.current &&
        !(event.target instanceof Element && event.target.closest('[data-context-menu-open]'))
      )
        closeMenu();
    }
    function focus(event: FocusEvent): void {
      if (
        !(event.target instanceof HTMLCanvasElement) &&
        !(event.target instanceof Element && event.target.closest('[data-context-menu-open]'))
      ) {
        closeMenu();
        clearTip();
      }
    }
    document.addEventListener('pointermove', pointer, true);
    document.addEventListener('focusin', focus, true);
    return () => {
      document.removeEventListener('pointermove', pointer, true);
      document.removeEventListener('focusin', focus, true);
    };
  }, []);
  useEffect(() => {
    let bareControl = false;
    function down(event: KeyboardEvent): void {
      const target = event.target;
      if (event.key !== 'Control') {
        bareControl = false;
        return;
      }
      if (
        event.repeat ||
        event.altKey ||
        event.metaKey ||
        event.shiftKey ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.matches('input,textarea') ||
            target.closest('[role="dialog"],[data-context-menu-open]')))
      )
        return;
      bareControl = controller.current !== null || hoverRef.current !== undefined;
    }
    function up(event: KeyboardEvent): void {
      if (event.key !== 'Control') return;
      if (bareControl) cycleAction();
      bareControl = false;
    }
    const reset = (): void => {
      bareControl = false;
    };
    document.addEventListener('keydown', down, true);
    document.addEventListener('keyup', up, true);
    document.addEventListener('pointerdown', reset, true);
    window.addEventListener('blur', reset);
    return () => {
      document.removeEventListener('keydown', down, true);
      document.removeEventListener('keyup', up, true);
      document.removeEventListener('pointerdown', reset, true);
      window.removeEventListener('blur', reset);
    };
  }, []);
  return {
    snapshot,
    dynamicContext: controller.current?.getDynamicContext(),
    active: snapshot !== null,
    prompt: snapshot?.prompt ?? null,
    inputMode: snapshot?.inputMode,
    grips: getGrips(),
    getGrips,
    hoveredGrip,
    menu,
    closeMenu,
    openMenu,
    action,
    cycleAction,
    tooltip:
      latest.current.sysvars.getNumber('GRIPTIPS') === 1 && hoveredGrip
        ? korean()
          ? '그립을 클릭하여 편집'
          : 'Click grip to edit'
        : null,
    setMode: (mode: GripMode): void => {
      controller.current?.setMode(mode);
      refresh();
    },
    isActive: () => controller.current !== null,
    hasHotGrips: () => hot.current.size > 0,
    getSnapEntities: () => controller.current?.getSnapEntities() ?? [],
    needsPoint: () => controller.current !== null,
    pickGrip,
    pick,
    hover,
    cursor: (point: CadPoint, _snapped = false): void => {
      if (controller.current) {
        controller.current.moveCursor(point);
        refresh();
      }
    },
    submit: (value: string): boolean => {
      if (!controller.current) return false;
      apply(controller.current.acceptText(value));
      return true;
    },
    cancel,
  };
}
