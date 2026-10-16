import { useEffect, useRef, useState } from 'react';
import { ModifySession, transformCadSelection, validDraftPoint } from '@hancad/draft';
import type { ModifySnapshot, ModifyTool } from '@hancad/draft';
import type { CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import type { CommandRegistry } from '@hancad/commands';
import type { SystemVariables } from '@hancad/sysvars';
import { getMessages } from '@hancad/ui';
import type { Messages } from '@hancad/ui';
import { tempOverrides } from './temp-overrides';
import { recordStatusPoint } from './status-point-store';

interface Options {
  registry: CommandRegistry;
  sysvars: SystemVariables;
  messages: Messages;
  getState: () => LegacyCadState;
  getSelectedIds: () => readonly string[];
  clearSelection: () => void;
  commitState: (label: string, state: LegacyCadState) => void;
  cancelOthers: () => void;
  print: (message: string) => void;
}

export function useModification(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const controller = useRef<ModifySession | null>(null);
  const pending = useRef<CadPoint[]>([]);
  const [snapshot, setSnapshot] = useState<ModifySnapshot | null>(null);
  function refresh(): void {
    setSnapshot(controller.current?.getSnapshot() ?? null);
  }
  function finish(): void {
    const active = controller.current;
    if (active && pending.current.length) {
      const live = latest.current;
      let state = live.getState();
      for (const delta of pending.current)
        state = transformCadSelection(state, active.getIds(), delta, active.tool === 'COPY').state;
      live.commitState(active.tool, state);
      live.clearSelection();
    }
    pending.current = [];
    controller.current = null;
    refresh();
  }
  function cancel(notify = true): boolean {
    const hadActive = controller.current !== null;
    // COPY keeps accepted placements when Esc ends the command, just like LINE.
    finish();
    if (notify && hadActive) latest.current.print(latest.current.messages.cancel);
    return hadActive;
  }
  function begin(tool: ModifyTool): void {
    finish();
    latest.current.cancelOthers();
    const active = new ModifySession(tool, (point) =>
      recordStatusPoint(latest.current.sysvars, point),
    );
    if (latest.current.sysvars.getNumber('PICKFIRST') === 1)
      active.select(latest.current.getState(), latest.current.getSelectedIds());
    else latest.current.clearSelection();
    controller.current = active;
    refresh();
  }
  function accepted(delta?: CadPoint): void {
    if (!delta || !controller.current) {
      refresh();
      return;
    }
    if (delta.x !== 0 || delta.y !== 0 || controller.current.tool === 'COPY')
      pending.current.push(delta);
    if (controller.current.tool === 'MOVE') finish();
    else refresh();
  }
  function pick(point: CadPoint, snapped = false): boolean {
    const active = controller.current;
    if (!active?.getSnapshot().needsPoint || !validDraftPoint(point)) return false;
    accepted(
      active.acceptPoint(
        point,
        tempOverrides.number(latest.current.sysvars, 'ORTHOMODE') === 1,
        snapped,
      ),
    );
    return true;
  }
  function cursor(point: CadPoint, snapped = false): void {
    controller.current?.moveCursor(
      point,
      tempOverrides.number(latest.current.sysvars, 'ORTHOMODE') === 1,
      snapped,
    );
    refresh();
  }
  function submit(value: string): boolean {
    const active = controller.current;
    if (!active) return false;
    const live = latest.current;
    if (!active.getSnapshot().needsPoint) {
      if (!value.trim()) {
        if (!active.select(live.getState(), live.getSelectedIds())) {
          live.print(live.messages.noSelection);
          finish();
        } else refresh();
      } else live.print(live.messages.selectObjects);
      return true;
    }
    const result = active.acceptText(value);
    if (result.error) live.print(live.messages.invalidPoint);
    else if (result.finish) finish();
    else accepted(result.delta);
    tempOverrides.consumeObjectSnapInput(value, !result.error);
    refresh();
    return true;
  }
  useEffect(() => {
    const ko = getMessages('ko-KR'),
      en = getMessages('en-US');
    for (const name of ['MOVE', 'COPY'] as const) {
      const label = name === 'MOVE' ? 'move' : 'copy';
      options.registry.register({
        name,
        displayName: { 'ko-KR': ko[label], 'en-US': en[label] },
        description: { 'ko-KR': ko.modifyBasePoint, 'en-US': en.modifyBasePoint },
        execute: () => begin(name),
      });
    }
  }, [options.registry]);
  return {
    snapshot,
    active: snapshot !== null,
    prompt: snapshot ? options.messages[snapshot.prompt] : null,
    isActive: () => controller.current !== null,
    needsPoint: () => controller.current?.getSnapshot().needsPoint ?? false,
    pick,
    cursor,
    submit,
    cancel,
  };
}
