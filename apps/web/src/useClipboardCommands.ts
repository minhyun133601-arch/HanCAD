import { useEffect, useRef, useState } from 'react';
import {
  coordinateSettings,
  deleteCadEntities,
  PointInputController,
  pointInputPrompt,
} from '@hancad/draft';
import type { DraftPointOptions, PointInputResult, PointSnapOverride } from '@hancad/draft';
import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import type { CommandRegistry } from '@hancad/commands';
import type { DrawingDatabase } from '@hancad/db';
import type { SystemVariables } from '@hancad/sysvars';
import type { Messages } from '@hancad/ui';
import {
  copyDrawingSelection,
  clipboardPreview,
  parseDrawingClipboard,
  pasteDrawingClipboard,
} from './drawing-clipboard';
import type { DrawingClipboard } from './drawing-clipboard';
import {
  DrawingClipboardUnavailableError,
  readDrawingClipboard,
  writeDrawingClipboard,
} from './drawing-clipboard-platform';
import { tempOverrides } from './temp-overrides';
import { recordStatusPoint } from './status-point-store';

type ClipboardCommand =
  'COPYCLIP' | 'CUTCLIP' | 'COPYBASE' | 'PASTECLIP' | 'PASTEBLOCK' | 'PASTEORIG';
interface Options {
  registry: CommandRegistry;
  database: DrawingDatabase;
  sysvars: SystemVariables;
  messages: Messages;
  getState: () => LegacyCadState;
  getSelectedIds: () => readonly string[];
  selectIds: (ids: readonly string[]) => void;
  clearSelection: () => void;
  commitState: (label: string, state: LegacyCadState) => void;
  cancelOthers: () => void;
  print: (message: string) => void;
  resolveTypedPoint?: (
    point: CadPoint,
    override?: PointSnapOverride,
  ) => ({ point: CadPoint } & DraftPointOptions) | undefined;
}
interface Snapshot {
  command: ClipboardCommand;
  inputMode: 'selection' | 'point' | 'keyword';
  basePoint?: CadPoint;
  preview: CadEntity[];
  busy: boolean;
}

export function useClipboardCommands(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const active = useRef<Snapshot | null>(null);
  const payload = useRef<DrawingClipboard | undefined>(undefined);
  const ids = useRef<readonly string[]>([]);
  const cursorPoint = useRef<CadPoint | undefined>(undefined);
  const token = useRef(0);
  const pointInput = useRef(
    new PointInputController({
      onSnapOverride: (mode) => tempOverrides.setObjectSnap(mode),
    }),
  );
  const ko = options.messages.commandPrompt.startsWith('명령');
  function publish(value: Snapshot | null): void {
    active.current = value;
    setSnapshot(value);
  }
  function cancel(notify = true): boolean {
    const running = active.current !== null;
    token.current++;
    payload.current = undefined;
    pointInput.current.reset();
    tempOverrides.clearObjectSnap();
    publish(null);
    if (running && notify) latest.current.print(latest.current.messages.cancel);
    return running;
  }
  function report(error: unknown): void {
    const korean = latest.current.messages.commandPrompt.startsWith('명령');
    const detail =
      error instanceof DrawingClipboardUnavailableError && korean
        ? '시스템 클립보드와 브라우저 저장소를 사용할 수 없습니다.'
        : error instanceof Error
          ? error.message
          : String(error);
    latest.current.print(
      korean ? `클립보드 작업에 실패했습니다: ${detail}` : `Clipboard operation failed: ${detail}`,
    );
  }
  async function copy(): Promise<void> {
    const current = active.current;
    if (!current) return;
    const ko = latest.current.messages.commandPrompt.startsWith('명령');
    const live = latest.current,
      source = live.getState();
    const selected = ids.current.length ? ids.current : live.getSelectedIds();
    const data = copyDrawingSelection(source, selected, current.basePoint);
    if (!data) {
      live.print(live.messages.noSelection);
      cancel(false);
      return;
    }
    publish({ ...current, busy: true, inputMode: 'keyword', preview: [] });
    const request = ++token.current;
    try {
      const written = await writeDrawingClipboard(data, live.database);
      if (token.current !== request) return;
      if (current.command === 'CUTCLIP') {
        if (live.getState() !== source)
          throw new Error('The drawing changed before the cut completed.');
        const next = deleteCadEntities(
          source,
          data.state.entities.map((entity) => entity.id),
        );
        if (next.deleted) live.commitState('CUTCLIP', next.state);
      }
      live.clearSelection();
      live.print(
        ko ? `${data.state.entities.length}개를 찾음` : `${data.state.entities.length} found`,
      );
      if (written === 'browser')
        live.print(
          ko
            ? '브라우저의 클립보드 권한을 사용할 수 없어 HanCAD 창 사이의 내부 클립보드를 사용합니다.'
            : 'Browser clipboard permission unavailable; using the shared HanCAD browser clipboard.',
        );
      cancel(false);
    } catch (error) {
      if (token.current === request) {
        report(error);
        cancel(false);
      }
    }
  }
  function insert(point: CadPoint): void {
    const live = latest.current,
      current = active.current,
      data = payload.current;
    if (!current || !data) return;
    const next = pasteDrawingClipboard(
      live.getState(),
      data,
      point,
      current.command === 'PASTEBLOCK',
    );
    live.commitState(current.command, next.state);
    live.clearSelection();
    recordStatusPoint(live.sysvars, point);
    cancel(false);
  }
  async function begin(command: ClipboardCommand): Promise<void> {
    cancel(false);
    latest.current.cancelOthers();
    const live = latest.current,
      ko = live.messages.commandPrompt.startsWith('명령');
    ids.current = live.sysvars.getNumber('PICKFIRST') ? [...live.getSelectedIds()] : [];
    if (!live.sysvars.getNumber('PICKFIRST')) live.clearSelection();
    publish({
      command,
      inputMode: command === 'COPYBASE' ? 'point' : 'selection',
      preview: [],
      busy: false,
    });
    if (command.startsWith('PASTE')) {
      const request = ++token.current;
      publish({ command, inputMode: 'keyword', preview: [], busy: true });
      try {
        const text = await readDrawingClipboard();
        if (token.current !== request) return;
        if (!text) {
          live.print(
            ko ? '클립보드에 붙여넣을 객체가 없습니다.' : 'No drawing objects in the Clipboard.',
          );
          cancel(false);
          return;
        }
        payload.current = parseDrawingClipboard(text);
        if (command === 'PASTEORIG') insert(payload.current.basePoint);
        else
          publish({
            command,
            inputMode: 'point',
            busy: false,
            basePoint: payload.current.basePoint,
            preview: [],
          });
      } catch (error) {
        if (token.current === request) {
          report(error);
          cancel(false);
        }
      }
    } else if (command !== 'COPYBASE' && ids.current.length) await copy();
  }
  function accept(result: PointInputResult): boolean {
    if (result.kind === 'invalid') {
      latest.current.print(latest.current.messages.invalidPoint);
      return false;
    }
    if (result.kind === 'continue') {
      if (active.current) publish({ ...active.current });
      return true;
    }
    const current = active.current;
    if (!current) return false;
    recordStatusPoint(latest.current.sysvars, result.point);
    tempOverrides.consumeObjectSnap();
    if (current.command === 'COPYBASE') {
      publish({ ...current, basePoint: result.point, inputMode: 'selection' });
      if (ids.current.length) void copy();
    } else insert(result.point);
    return true;
  }
  function pointContext() {
    const base = active.current?.basePoint;
    return {
      ...(base ? { base } : {}),
      ...(cursorPoint.current ? { cursor: cursorPoint.current } : {}),
      settings: coordinateSettings((name) => latest.current.sysvars.get(name)),
      resolveTypedPoint: (point: CadPoint, override?: PointSnapOverride) =>
        latest.current.resolveTypedPoint?.(point, override)?.point ?? point,
    };
  }
  function submit(value: string): boolean {
    const current = active.current;
    if (!current) return false;
    if (current.busy) return true;
    if (current.inputMode === 'selection') {
      if (!value.trim()) {
        ids.current = [...latest.current.getSelectedIds()];
        void copy();
      } else latest.current.print(latest.current.messages.selectObjects);
    } else accept(pointInput.current.acceptText(value, pointContext()));
    return true;
  }
  useEffect(() => {
    for (const command of [
      'COPYCLIP',
      'CUTCLIP',
      'COPYBASE',
      'PASTECLIP',
      'PASTEBLOCK',
      'PASTEORIG',
    ] as const)
      options.registry.register({
        name: command,
        displayName: { 'ko-KR': command, 'en-US': command },
        description: {
          'ko-KR': '클립보드에서 도면 객체를 복사하거나 붙여넣습니다.',
          'en-US': 'Copy or paste drawing objects using the Clipboard.',
        },
        execute: () => begin(command),
      });
    return () => {
      token.current++;
    };
  }, [options.registry]);
  let prompt: string | null = null;
  if (snapshot)
    prompt = snapshot.busy
      ? ko
        ? '클립보드 처리 중...'
        : 'Processing Clipboard...'
      : snapshot.inputMode === 'selection'
        ? options.messages.selectObjects
        : (pointInputPrompt(pointInput.current.getState(), ko ? 'ko-KR' : 'en-US') ??
          (snapshot.command === 'COPYBASE'
            ? ko
              ? '기준점 지정:'
              : 'Specify base point:'
            : ko
              ? '삽입점 지정:'
              : 'Specify insertion point:'));
  return {
    snapshot,
    active: snapshot !== null,
    prompt,
    inputMode: snapshot?.inputMode,
    isActive: () => active.current !== null,
    needsPoint: () => active.current?.inputMode === 'point',
    getPointInput: () => pointInput.current,
    getAidContext: () => ({
      pointInput: pointInput.current.getState(),
      ...(active.current?.basePoint ? { basePoint: active.current.basePoint } : {}),
      trackingPoints: pointInput.current.getState().trackingPoints,
    }),
    pick: (point: CadPoint) =>
      active.current?.inputMode === 'point' &&
      accept(pointInput.current.acceptPoint(point, pointContext())),
    cursor: (point: CadPoint) => {
      cursorPoint.current = point;
      if (active.current?.inputMode === 'point' && payload.current)
        publish({ ...active.current, preview: clipboardPreview(payload.current, point) });
    },
    submit,
    cancel,
  };
}
