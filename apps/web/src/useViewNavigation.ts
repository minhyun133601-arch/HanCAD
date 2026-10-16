import { useEffect, useRef, useState } from 'react';
import type { CommandContext } from '@hancad/commands';
import type { CadPoint } from '@hancad/legacy-bridge';
import { selectCadArea } from '@hancad/draft';
import type { CadPointerPick, CadSelectionDrag } from '@hancad/render';
import type { CanvasSurface } from './canvas-surface';
import type { useCommandSession } from './useCommandSession';
import type { useDrawingFiles } from './useDrawingFiles';
import { NavigationSession } from './navigation-session';
import type { NavigationSnapshot } from './navigation-session';
import { navigationPrompt } from './navigation-prompts';
import { ucsIconOption, ucsIconPrompt } from './ucs-icon-options';

interface Options {
  session: ReturnType<typeof useCommandSession>;
  files: ReturnType<typeof useDrawingFiles>;
  surface: { current: CanvasSurface | null };
  selected: () => readonly string[];
  cancelOthers: () => void;
  korean: boolean;
}
export function useViewNavigation(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const controller = useRef<NavigationSession | null>(null);
  const [snapshot, setSnapshot] = useState<NavigationSnapshot | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const ucsPending = useRef(false);
  const [ucsAwaiting, setUcsAwaiting] = useState(false);
  const stressPending = useRef(false);
  const [stressAwaiting, setStressAwaiting] = useState(false);
  const [background, setBackground] = useState(() => {
    try {
      const value = localStorage.getItem('hancad.canvas.background');
      return value && /^#[\da-f]{6}$/i.test(value) ? value : '#212830';
    } catch {
      return '#212830';
    }
  });
  const backgroundRef = useRef(background);
  backgroundRef.current = background;
  function changed(): void {
    const next = controller.current?.getSnapshot();
    setSnapshot(next ?? null);
    if (!next) controller.current = null;
  }
  function cancel(notify = true): boolean {
    const active = controller.current !== null || ucsPending.current || stressPending.current;
    controller.current?.cancel();
    controller.current = null;
    setSnapshot(null);
    ucsPending.current = false;
    setUcsAwaiting(false);
    stressPending.current = false;
    setStressAwaiting(false);
    latest.current.surface.current?.redraw();
    if (active && notify)
      latest.current.session.print(latest.current.korean ? '*취소*' : '*Cancel*');
    return active;
  }
  function stressCount(raw: unknown): boolean {
    const live = latest.current,
      count = raw === undefined || raw === '' ? 100000 : Number(raw);
    if (!Number.isInteger(count) || count < 0 || count > 1000000) {
      live.session.print(
        live.korean
          ? '0에서 1000000 사이의 정수를 입력해야 합니다.'
          : 'Enter an integer from 0 to 1000000.',
      );
      return false;
    }
    live.surface.current?.setStressDataset(count);
    live.session.print(
      live.korean
        ? `렌더러 시험 객체 ${count}개: 도면과 저장 파일에 포함되지 않습니다.`
        : `${count} renderer test objects; excluded from the drawing and saved files.`,
    );
    return true;
  }
  function begin(command: 'ZOOM' | 'PAN', context: CommandContext): void {
    cancel(false);
    const live = latest.current,
      surface = live.surface.current;
    if (!surface) return;
    if (!context.prefixes?.transparent) live.cancelOthers();
    const pair = (name: string): [number, number] => {
      const value = live.session.sysvars.get(name);
      return Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number'
        ? [value[0], value[1]]
        : [0, 0];
    };
    controller.current = new NavigationSession(
      command,
      {
        view: () => surface.getWorldView(),
        viewport: () => surface.getViewportSize(),
        limits: () => {
          const min = pair('LIMMIN'),
            max = pair('LIMMAX');
          return { minX: min[0], minY: -max[1], maxX: max[0], maxY: -min[1] };
        },
        bounds: (ids) => surface.getDrawingBounds(ids),
        selected: () => (live.session.sysvars.getNumber('PICKFIRST') ? live.selected() : []),
        allIds: () => {
          const state = live.files.getState(),
            visible = new Set(
              state.layers.filter((layer) => layer.visible).map((layer) => layer.name),
            );
          return state.entities
            .filter((entity) => visible.has(entity.layer))
            .map((entity) => entity.id);
        },
        apply: (view, kind, smooth) => surface.navigate(view, kind, smooth),
        preview: (view) => surface.setWorldView(view),
        previous: () => surface.zoomPrevious(),
        redraw: () => surface.redraw(),
        regenerate: (height) => surface.regenerate(height),
      },
      changed,
      (ko, en) => latest.current.session.print(latest.current.korean ? ko : en),
      context.prefixes?.commandLine,
      context.prefixes?.transparent,
    );
    changed();
    while (context.input.remaining && controller.current) {
      const value = context.input.take();
      if (Array.isArray(value))
        controller.current.acceptPoint({ x: value[0] ?? 0, y: -(value[1] ?? 0) });
      else controller.current.acceptText(String(value ?? ''));
    }
    surface.redraw();
  }
  useEffect(() => {
    const registry = options.session.registry;
    for (const command of ['ZOOM', 'PAN'] as const)
      registry.register({
        name: command,
        displayName: {
          'ko-KR': command === 'ZOOM' ? '줌' : '초점이동',
          'en-US': command === 'ZOOM' ? 'Zoom' : 'Pan',
        },
        description: {
          'ko-KR': '현재 뷰포트의 표시를 변경합니다.',
          'en-US': 'Changes the displayed view in the current viewport.',
        },
        flags: { transparent: true },
        execute: (context) => begin(command, context),
      });
    for (const command of ['REGEN', 'REGENALL', 'REDRAW', 'REDRAWALL'] as const)
      registry.register({
        name: command,
        displayName: { 'ko-KR': command, 'en-US': command },
        description: {
          'ko-KR': command.startsWith('REGEN')
            ? '도면 표시를 재생성합니다.'
            : '현재 뷰포트 표시를 다시 그립니다.',
          'en-US': command.startsWith('REGEN')
            ? 'Regenerates the drawing display.'
            : 'Redraws the viewport.',
        },
        execute: () => {
          const surface = latest.current.surface.current;
          if (command.startsWith('REGEN')) surface?.regenerate();
          else surface?.redraw();
        },
      });
    registry.register({
      name: 'UCSICON',
      displayName: { 'ko-KR': 'UCS 아이콘', 'en-US': 'UCS icon' },
      description: {
        'ko-KR': '2D UCS 아이콘의 표시 및 위치를 조정합니다.',
        'en-US': 'Controls visibility and placement of the 2D UCS icon.',
      },
      execute: (context) => {
        cancel(false);
        const raw = context.input.take();
        const next =
          raw === undefined
            ? undefined
            : ucsIconOption(String(raw), context.sysvars.getNumber('UCSICON'));
        if (next === undefined) {
          ucsPending.current = true;
          setUcsAwaiting(true);
          context.print(ucsIconPrompt(context.locale === 'ko-KR'));
        } else context.sysvars.set('UCSICON', next);
      },
    });
    registry.register({
      name: 'OPTIONS',
      aliases: ['OP'],
      displayName: { 'ko-KR': '옵션', 'en-US': 'Options' },
      description: { 'ko-KR': '화면 표시 옵션을 엽니다.', 'en-US': 'Opens display options.' },
      execute: () => setOptionsOpen(true),
    });
    if (
      import.meta.env.DEV ||
      new URLSearchParams(globalThis.location?.search ?? '').get('devtools') === '1'
    )
      registry.register({
        name: 'DEVSTRESS',
        displayName: { 'ko-KR': '렌더러 부하 시험', 'en-US': 'Renderer stress test' },
        description: {
          'ko-KR': '저장하지 않는 렌더러 시험 데이터를 만듭니다.',
          'en-US': 'Creates a nonpersistent renderer test dataset.',
        },
        execute: (context) => {
          cancel(false);
          const raw = context.input.take();
          if (raw === undefined) {
            stressPending.current = true;
            setStressAwaiting(true);
          } else stressCount(raw);
        },
      });
  }, [options.session.registry]);
  useEffect(
    () => options.session.sysvars.events.subscribe(() => latest.current.surface.current?.redraw()),
    [options.session.sysvars],
  );
  return {
    active: snapshot !== null || ucsAwaiting || stressAwaiting,
    snapshot,
    optionsOpen,
    setOptionsOpen,
    background,
    backgroundColor: () => backgroundRef.current,
    setBackground: (value: string) => {
      if (!/^#[\da-f]{6}$/i.test(value)) return;
      setBackground(value);
      backgroundRef.current = value;
      try {
        localStorage.setItem('hancad.canvas.background', value);
      } catch {
        /* Preferences remain usable without storage. */
      }
      latest.current.surface.current?.redraw();
    },
    prompt: stressAwaiting
      ? options.korean
        ? '시험 객체 수 입력 <100000>:'
        : 'Enter test entity count <100000>:'
      : ucsAwaiting
        ? ucsIconPrompt(options.korean)
        : snapshot
          ? navigationPrompt(
              snapshot,
              options.korean,
              options.surface.current?.getWorldView().height ?? 0,
            )
          : null,
    /** Prompt input type: counts and scale factors are numbers, option lists keywords. */
    inputMode: stressAwaiting
      ? ('number' as const)
      : ucsAwaiting
        ? ('keyword' as const)
        : snapshot
          ? snapshot.stage === 'objects'
            ? ('selection' as const)
            : snapshot.stage === 'height' || snapshot.stage === 'scale'
              ? ('number' as const)
              : ('point' as const)
          : undefined,
    isActive: () => controller.current !== null || ucsPending.current || stressPending.current,
    mode: () => controller.current?.mode,
    window: () => controller.current?.getSnapshot()?.window,
    canSelectArea: () => controller.current?.selectingObjects ?? false,
    submit: (value: string): boolean => {
      if (stressPending.current) {
        if (stressCount(value)) {
          stressPending.current = false;
          setStressAwaiting(false);
        }
        return true;
      }
      if (ucsPending.current) {
        const live = latest.current,
          next = ucsIconOption(value, live.session.sysvars.getNumber('UCSICON'));
        live.session.print(`${ucsIconPrompt(live.korean)} ${value}`);
        if (next !== undefined) {
          live.session.sysvars.set('UCSICON', next);
          ucsPending.current = false;
          setUcsAwaiting(false);
        } else if (!value.trim()) {
          ucsPending.current = false;
          setUcsAwaiting(false);
        } else
          live.session.print(
            live.korean
              ? '유효한 옵션 키워드를 지정해야 합니다.'
              : 'A valid option keyword is required.',
          );
        return true;
      }
      if (!controller.current) return false;
      const live = latest.current;
      const current = controller.current.getSnapshot();
      if (current)
        live.session.print(
          `${navigationPrompt(current, live.korean, live.surface.current?.getWorldView().height ?? 0)} ${value}`,
        );
      controller.current.acceptText(value);
      return true;
    },
    pick: (event: CadPointerPick) =>
      controller.current?.acceptPoint(event.point, event.entityId, event.shiftKey),
    cursor: (point: CadPoint) => controller.current?.moveCursor(point),
    selectionDrag: (event: CadSelectionDrag) => {
      if (event.phase === 'end')
        controller.current?.select(
          selectCadArea(latest.current.files.getState(), event.start, event.end),
          event.shiftKey,
        );
    },
    cancel,
  };
}
