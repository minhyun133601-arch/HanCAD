import { useEffect, useRef, useState } from 'react';
import { MeasureSession, formatMeasurement, coordinateSettings } from '@hancad/draft';
import type { MeasureInputResult, MeasureSnapshot } from '@hancad/draft';
import type { CommandContext, CommandRegistry } from '@hancad/commands';
import type { CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import type { SystemVariables } from '@hancad/sysvars';
import { getMessages } from '@hancad/ui';
import type { Messages } from '@hancad/ui';
import { tempOverrides } from './temp-overrides';
import { recordStatusPoint } from './status-point-store';

interface MeasurementOptions {
  registry: CommandRegistry;
  sysvars: SystemVariables;
  messages: Messages;
  getState: () => LegacyCadState;
  print: (message: string) => void;
  cancelOthers: () => void;
}

export function useMeasurement(options: MeasurementOptions) {
  const latest = useRef(options);
  latest.current = options;
  const controller = useRef<MeasureSession | null>(null);
  const [snapshot, setSnapshot] = useState<MeasureSnapshot | null>(null);
  /** 'DIST inside another command keeps that command and prefixes its prompts with >>. */
  const transparent = useRef(false);

  function changed(next: MeasureSnapshot): void {
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
  function promptLine(current: MeasureSnapshot): string {
    const messages = latest.current.messages;
    const text =
      current.prompt === 'firstPoint'
        ? messages.measureFirstPointPrompt
        : messages.measureSecondPointPrompt;
    return transparent.current ? `>>${text}` : text;
  }
  function report(result: MeasureInputResult): void {
    if (!result.error) return;
    const live = latest.current;
    const key = result.error === 'point' ? 'invalidPoint' : result.error;
    live.print(live.messages[key]);
  }
  function begin(context: CommandContext): void {
    cancel(false);
    const live = latest.current;
    transparent.current = Boolean(context.prefixes?.transparent);
    if (!transparent.current) live.cancelOthers();
    const active = new MeasureSession(live.getState().settings, {
      coordinates: () => coordinateSettings((name) => latest.current.sysvars.get(name)),
      onAcceptedPoint: (point) => recordStatusPoint(latest.current.sysvars, point),
      precision: live.sysvars.getNumber('LUPREC'),
      onChange: changed,
      onComplete: (result) => {
        const current = latest.current;
        const display = formatMeasurement(result, {
          coordinates: coordinateSettings((name) => current.sysvars.get(name)),
          linearPrecision: current.sysvars.getNumber('LUPREC'),
          angularPrecision: current.sysvars.getNumber('AUPREC'),
          angleBase: current.sysvars.getNumber('ANGBASE'),
          clockwise: current.sysvars.getNumber('ANGDIR') === 1,
        });
        current.print(
          current.messages.measureResult(
            display.distance,
            display.deltaX,
            display.deltaY,
            display.angle,
          ),
        );
      },
    });
    controller.current = active;
    setSnapshot(active.getSnapshot());
  }
  useEffect(() => {
    const ko = getMessages('ko-KR'),
      en = getMessages('en-US');
    options.registry.register({
      name: 'DIST',
      aliases: ['DI'],
      displayName: { 'ko-KR': ko.measure, 'en-US': en.measure },
      description: { 'ko-KR': ko.measureUsage, 'en-US': en.measureUsage },
      execute: begin,
    });
  }, [options.registry]);
  useEffect(
    () =>
      options.sysvars.events.subscribe(() => {
        const live = latest.current;
        controller.current?.setSettings(live.getState().settings, live.sysvars.getNumber('LUPREC'));
      }),
    [options.sysvars],
  );

  return {
    snapshot,
    active: snapshot !== null,
    prompt: snapshot ? promptLine(snapshot) : null,
    isActive: () => controller.current !== null,
    needsPoint: () => controller.current !== null,
    pick: (point: CadPoint) => {
      const result = controller.current?.acceptPoint(point);
      if (result) report(result);
      return result !== undefined && result.status !== 'error';
    },
    cursor: (point: CadPoint) => controller.current?.moveCursor(point),
    submit: (value: string): boolean => {
      const active = controller.current;
      if (!active) return false;
      latest.current.print(`${promptLine(active.getSnapshot())} ${value}`);
      const result = active.acceptText(value);
      report(result);
      tempOverrides.consumeObjectSnapInput(value, result.status !== 'error');
      return true;
    },
    cancel,
  };
}
