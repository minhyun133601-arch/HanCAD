import { useEffect, useRef, useState } from 'react';
import { rightClickAction } from '@hancad/input';
import type { Locale } from '@hancad/ui';
import type { useCommandSession } from '../useCommandSession';
import type { useCommandInput } from '../useCommandInput';
import { tempOverrides, type ObjectSnapOverride } from '../temp-overrides';
import { inputBlocked } from '../ui-focus';
import { ContextMenu, type MenuEntry } from './ContextMenu';
import { drawingMenuItems } from './drawing-menu-items';
import { promptOptions } from '../command-line/PromptKeywords';

const snaps: readonly [string, string, string, ObjectSnapOverride?][] = [
  ['ENDP', '끝점', 'Endpoint', 'endpoint'],
  ['MID', '중간점', 'Midpoint', 'midpoint'],
  ['INT', '교차점', 'Intersection', 'intersection'],
  ['APPINT', '가상 교차점', 'Apparent Intersection', 'apparentIntersection'],
  ['EXT', '연장선', 'Extension', 'extension'],
  ['CEN', '중심점', 'Center', 'center'],
  ['GCE', '기하학적 중심', 'Geometric Center', 'geometricCenter'],
  ['QUA', '사분점', 'Quadrant', 'quadrant'],
  ['TAN', '접점', 'Tangent', 'tangent'],
  ['PER', '수직', 'Perpendicular', 'perpendicular'],
  ['PAR', '평행', 'Parallel', 'parallel'],
  ['INS', '삽입점', 'Insertion', 'insertion'],
  ['NODE', '노드', 'Node', 'node'],
  ['NEA', '근처점', 'Nearest', 'nearest'],
  ['NON', '없음', 'None', 'none'],
];

export function DrawingShortcutMenus(props: {
  session: ReturnType<typeof useCommandSession>;
  input: ReturnType<typeof useCommandInput>;
  selected: boolean;
  clearSelection: () => void;
  focus: () => void;
  locale: Locale;
  blocked: boolean;
}) {
  const latest = useRef(props);
  latest.current = props;
  const [menu, setMenu] = useState<{ x: number; y: number; snap: boolean } | null>(null);
  const close = (): void => {
    setMenu(null);
    props.focus();
  };
  useEffect(() => {
    let pressed: { id: number; button: number; time: number; snap: boolean } | null = null;
    const drawingTarget = (target: EventTarget | null): boolean =>
      target instanceof Element &&
      Boolean(target.closest('.drawing-region')) &&
      !target.closest('button, input, textarea, dialog');
    function down(event: PointerEvent): void {
      const live = latest.current;
      if (!drawingTarget(event.target) || live.blocked || inputBlocked()) return;
      const middle = event.button === 1 && live.session.sysvars.getNumber('MBUTTONPAN') === 0;
      if (event.button !== 2 && !middle) return;
      event.preventDefault();
      event.stopPropagation();
      pressed = {
        id: event.pointerId,
        button: event.button,
        time: event.timeStamp,
        snap: middle || event.shiftKey,
      };
    }
    function up(event: PointerEvent): void {
      if (!pressed || event.pointerId !== pressed.id || event.button !== pressed.button) return;
      event.preventDefault();
      event.stopPropagation();
      const click = pressed;
      pressed = null;
      const live = latest.current,
        { routing } = live.input;
      if (live.blocked || inputBlocked()) return;
      const action = rightClickAction(
        live.session.sysvars.getNumber('SHORTCUTMENU'),
        event.timeStamp - click.time,
        live.session.sysvars.getNumber('SHORTCUTMENUDURATION'),
        {
          commandActive: routing.isActive(),
          selected: live.selected,
          hasKeywords: promptOptions(routing.prompt).length > 0,
        },
      );
      if (click.snap || action === 'menu')
        setMenu({ x: event.clientX, y: event.clientY, snap: click.snap });
      else {
        void live.input.submit(live.session.input);
        live.focus();
      }
    }
    function context(event: MouseEvent): void {
      if (!drawingTarget(event.target)) return;
      event.preventDefault();
      // A keyboard Menu/Shift+F10 request has no preceding pointer press.
      if (event.detail === 0 && event.button === 0 && !latest.current.blocked && !inputBlocked())
        setMenu({ x: event.clientX, y: event.clientY, snap: false });
    }
    const reset = (): void => {
      pressed = null;
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('contextmenu', context, true);
    document.addEventListener('pointercancel', reset, true);
    window.addEventListener('blur', reset);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('contextmenu', context, true);
      document.removeEventListener('pointercancel', reset, true);
      window.removeEventListener('blur', reset);
    };
  }, []);
  if (!menu) return null;
  const korean = props.locale === 'ko-KR';
  const snapItems: MenuEntry[] = snaps.map(([keyword, ko, en, mode]) => ({
    id: `snap-${keyword}`,
    label: korean ? ko : en,
    onSelect: () => {
      if (!props.input.canSnapPoint()) {
        void props.input.submit(`_${keyword}`);
        return;
      }
      if (mode) tempOverrides.setObjectSnap(mode);
      else
        props.session.print(
          korean
            ? `명령 "_${keyword}"은(는) 아직 구현되지 않았습니다.`
            : `Command "_${keyword}" is not implemented yet.`,
        );
      props.focus();
    },
  }));
  snapItems.push(
    { kind: 'separator', id: 'snap-settings-separator' },
    {
      id: 'snap-settings',
      label: korean ? '객체 스냅 설정...' : 'Object Snap Settings...',
      onSelect: () => props.input.execute("'_OSNAP"),
    },
  );
  const items = menu.snap
    ? snapItems
    : drawingMenuItems({
        korean,
        commandActive: props.input.routing.isActive(),
        selected: props.selected,
        commandName: props.input.routing.commandName,
        prompt: props.input.routing.prompt,
        recent: props.session.recentCommands(),
        execute: props.input.execute,
        submit: (value) => void props.input.submit(value),
        cancel: props.input.cancel,
        clearSelection: props.clearSelection,
        snapItems,
      });
  return (
    <ContextMenu
      x={menu.x}
      y={menu.y}
      items={items}
      onClose={close}
      label={
        korean
          ? menu.snap
            ? '객체 스냅 메뉴'
            : '도면 바로 가기 메뉴'
          : menu.snap
            ? 'Object Snap Menu'
            : 'Drawing Shortcut Menu'
      }
    />
  );
}
