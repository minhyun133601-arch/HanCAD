import { useEffect, useRef, useState } from 'react';
import { TextSession, appendCadEntities, coordinateSettings } from '@hancad/draft';
import type { TextError, TextSnapshot } from '@hancad/draft';
import type { CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import { CAD_ENTITY_LIMIT } from '@hancad/legacy-bridge';
import type { CommandRegistry } from '@hancad/commands';
import type { SystemVariables } from '@hancad/sysvars';
import { getMessages } from '@hancad/ui';
import type { MessageKey, Messages } from '@hancad/ui';
import { creationSettings } from './creation-settings';
import { tempOverrides } from './temp-overrides';
import { recordStatusPoint } from './status-point-store';

interface Options {
  registry: CommandRegistry;
  sysvars: SystemVariables;
  messages: Messages;
  getState: () => LegacyCadState;
  commitState: (label: string, state: LegacyCadState, variables?: { TEXTSIZE: number }) => void;
  cancelOthers: () => void;
  print: (message: string) => void;
}

const errors: Record<TextError, MessageKey> = {
  point: 'invalidPoint',
  positiveHeight: 'textPositiveHeightError',
  invalidAngle: 'dimInvalidAngleError',
  unsupportedOption: 'textUnsupportedOption',
  textContent: 'textContentError',
  entityLimit: 'editEntityLimit',
  needPoints: 'needPoints',
  closedSession: 'closedSession',
};

function promptText(snapshot: TextSnapshot, messages: Messages): string {
  if (snapshot.prompt === 'textStart') return messages.textStartPrompt;
  if (snapshot.prompt === 'textHeight') return messages.textHeightPrompt(String(snapshot.textSize));
  if (snapshot.prompt === 'textRotation') return messages.textRotationPrompt;
  return messages.textContentPrompt;
}

export function useTextCreation(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const controller = useRef<TextSession | null>(null);
  const committed = useRef(false);
  const [snapshot, setSnapshot] = useState<TextSnapshot | null>(null);

  function changed(next: TextSnapshot): void {
    if (next.status === 'active') setSnapshot(next);
    else {
      const live = latest.current;
      if (
        !committed.current &&
        (next.prompt === 'textRotation' || next.prompt === 'textContent') &&
        next.textSize !== live.sysvars.getNumber('TEXTSIZE')
      ) {
        const state = live.getState();
        live.commitState(
          'TEXT',
          { ...state, settings: { ...state.settings, textSize: next.textSize } },
          { TEXTSIZE: next.textSize },
        );
      }
      controller.current = null;
      setSnapshot(null);
    }
  }

  function cancel(notify = true): boolean {
    const active = controller.current !== null;
    controller.current?.cancel();
    controller.current = null;
    setSnapshot(null);
    if (notify && active) latest.current.print(latest.current.messages.cancel);
    return active;
  }

  function begin(): void {
    cancel(false);
    const live = latest.current;
    live.cancelOthers();
    const model = live.getState();
    const layer = model.layers.find((item) => item.name === model.settings.layer);
    if (layer?.frozen) {
      live.print(live.messages.currentLayerHidden);
      return;
    }
    committed.current = false;
    const session = new TextSession(
      creationSettings(model.settings, (name) => live.sysvars.get(name)),
      {
        coordinates: () => coordinateSettings((name) => latest.current.sysvars.get(name)),
        onAcceptedPoint: (point) => recordStatusPoint(latest.current.sysvars, point),
        textSize: live.sysvars.getNumber('TEXTSIZE'),
        availableEntities: CAD_ENTITY_LIMIT - model.entities.length,
        onChange: changed,
        onCommit: (entities) => {
          const current = latest.current;
          const textSize = controller.current?.getSnapshot().textSize;
          if (textSize === undefined) throw new Error('Text command height is unavailable.');
          const state = appendCadEntities(current.getState(), entities);
          current.commitState(
            'TEXT',
            { ...state, settings: { ...state.settings, textSize } },
            { TEXTSIZE: textSize },
          );
          committed.current = true;
          current.print(current.messages.committedObjects(entities.length));
        },
      },
    );
    controller.current = session;
    setSnapshot(session.getSnapshot());
  }

  function report(error?: TextError): void {
    if (error) latest.current.print(latest.current.messages[errors[error]]);
  }

  function pick(point: CadPoint): boolean {
    const active = controller.current;
    if (!active) return false;
    const result = active.acceptPoint(point);
    report(result.error);
    return result.status !== 'error';
  }

  function submit(value: string): boolean {
    const active = controller.current;
    if (!active) return false;
    const live = latest.current;
    live.print(`${promptText(active.getSnapshot(), live.messages)} ${value}`);
    const mode = active.getSnapshot().inputMode;
    const result = active.acceptText(value);
    report(result.error);
    if (mode === 'point' || mode === 'number')
      tempOverrides.consumeObjectSnapInput(value, result.status !== 'error');
    return true;
  }

  useEffect(() => {
    const ko = getMessages('ko-KR');
    const en = getMessages('en-US');
    options.registry.register({
      name: 'TEXT',
      aliases: ['DTEXT'],
      displayName: { 'ko-KR': ko.singleLineText, 'en-US': en.singleLineText },
      description: { 'ko-KR': ko.textUsage, 'en-US': en.textUsage },
      execute: begin,
    });
  }, [options.registry]);

  return {
    snapshot,
    active: snapshot !== null,
    editable: snapshot?.inputMode === 'text',
    textEntry:
      snapshot?.inputMode === 'text' && snapshot.point
        ? {
            point: snapshot.point,
            textSize: snapshot.textSize,
            rotation: snapshot.rotation,
            value: snapshot.text,
          }
        : null,
    prompt: snapshot ? promptText(snapshot, options.messages) : null,
    begin,
    cancel,
    pick,
    submit,
    cursor: (point: CadPoint) => controller.current?.moveCursor(point),
    changeText: (value: string) => controller.current?.updateText(value),
    isActive: () => controller.current !== null,
    needsPoint: () => {
      const mode = controller.current?.getSnapshot().inputMode;
      return mode === 'point' || mode === 'number';
    },
  };
}
