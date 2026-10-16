import type { RefObject } from 'react';
import type { PromptInputMode } from '@hancad/input';
import type { Locale } from '@hancad/ui';
import type { CanvasSurface } from './canvas-surface';
import type { useCommandSession } from './useCommandSession';
import type { useDrawingCommands } from './useDrawingCommands';
import type { useViewNavigation } from './useViewNavigation';
import { useTransparentCommands } from './useTransparentCommands';
import { tempOverrides } from './temp-overrides';

/**
 * Where command-line input goes: the active prompt's owner (a transparent command
 * first, then navigation, drawing tools and the session), plus the prompt text,
 * input type and command name the command window shows for it.
 */
export function useCommandRouting({
  session,
  navigation,
  tools,
  surface,
  locale,
}: {
  session: ReturnType<typeof useCommandSession>;
  navigation: ReturnType<typeof useViewNavigation>;
  tools: ReturnType<typeof useDrawingCommands>;
  surface: RefObject<CanvasSurface | null>;
  locale: Locale;
}) {
  const transparent = useTransparentCommands({
    session,
    navigation,
    measurement: tools.measurement,
    outerActive: () => navigation.isActive() || tools.isActive() || session.isPrompting('main'),
    locale,
  });
  const nested = session.nestedActive;
  const inputMode: PromptInputMode =
    (nested ? session.inputMode : undefined) ??
    navigation.inputMode ??
    tools.inputMode ??
    session.inputMode;
  const commandActive =
    navigation.active || tools.active || session.promptCommand !== null || nested;
  const outerName = commandActive ? (session.promptCommand ?? session.startedCommand) : null;
  const commandName = transparent.name ? `'${transparent.name}` : outerName;
  const prompt = nested ? session.prompt : (navigation.prompt ?? tools.prompt);
  /** Up/Down recall values given at the same kind of prompt of the same command. */
  const historyContext = inputMode === 'command' ? 'command' : `${commandName ?? ''}:${inputMode}`;

  /** Synchronous state, so macro steps never act on a stale render. */
  const isActive = (): boolean =>
    navigation.isActive() ||
    tools.isActive() ||
    session.isPrompting('main') ||
    session.isPrompting('nested') ||
    transparent.isActive();
  async function submit(value: string): Promise<void> {
    if (historyContext !== 'command') session.remember(historyContext, value);
    if (isActive() && value.trim().startsWith("'")) {
      await transparent.start(value, outerName ?? '', prompt);
      return;
    }
    if (session.isPrompting('nested')) {
      await session.execute(value);
      return;
    }
    if (navigation.submit(value)) {
      session.changeInput('');
      return;
    }
    if (/^\s*[_.-]*(?:ZOOM|Z|PAN|P)\b/i.test(value) && !tools.isActive()) {
      await session.execute(value);
      return;
    }
    if (tools.submit(value)) {
      session.changeInput('');
      if (!tools.isActive()) surface.current?.setSnapMarker();
      return;
    }
    surface.current?.cancelPointerInteraction();
    await session.execute(value);
  }
  /** Esc cancels a transparent command together with the command it interrupted. */
  function cancel(): void {
    tempOverrides.clearObjectSnap();
    surface.current?.cancelPointerInteraction();
    transparent.cancel();
    if (!navigation.cancel() && !tools.cancel()) session.cancel();
    session.changeInput('');
    surface.current?.setSnapMarker();
  }
  return {
    inputMode,
    commandActive,
    commandName,
    prompt,
    editable: nested ? session.editable : !navigation.active && tools.editable,
    historyContext,
    isActive,
    submit,
    cancel,
    /** A new command from a menu or button ends any transparent command silently. */
    reset: () => transparent.cancel(),
  };
}
