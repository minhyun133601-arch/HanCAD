import type { RefObject } from 'react';
import type { MacroToggle } from '@hancad/commands';
import type { ToggleId } from '@hancad/input';
import type { DocumentManager, DrawingDocument } from '@hancad/sysvars';
import { getShortcutMessages } from '@hancad/ui';
import type { Locale, Messages } from '@hancad/ui';
import type { CanvasSurface } from './canvas-surface';
import type { CommandWindowState } from './command-line/useCommandWindow';
import type { LayoutId } from './DrawingSurface';
import { errorMessage } from './error-presenter';
import { useCommandRouting } from './useCommandRouting';
import type { useCommandSession } from './useCommandSession';
import { useDraftingToggle } from './useDraftingToggle';
import type { useDrawingCommands } from './useDrawingCommands';
import type { useDrawingFiles } from './useDrawingFiles';
import { useMacroRunner } from './useMacroRunner';
import { useTempOverrideKeys } from './useTempOverrideKeys';
import type { useViewNavigation } from './useViewNavigation';
import { useWorkspaceShortcuts } from './useWorkspaceShortcuts';

const macroToggles: Readonly<Record<MacroToggle, ToggleId>> = {
  B: 'snap',
  D: 'dynamicUcs',
  E: 'isoplane',
  G: 'grid',
  O: 'ortho',
  T: 'tablet',
};
const layoutOrder: readonly LayoutId[] = ['model', 'layoutOne', 'layoutTwo'];

/**
 * Everything that turns keys, buttons and macros into command-line input for one
 * drawing: routing, drafting toggles, the macro runner, global shortcuts and
 * temporary override keys.
 */
export function useCommandInput(options: {
  session: ReturnType<typeof useCommandSession>;
  navigation: ReturnType<typeof useViewNavigation>;
  tools: ReturnType<typeof useDrawingCommands>;
  files: ReturnType<typeof useDrawingFiles>;
  surface: RefObject<CanvasSurface | null>;
  commandWindow: CommandWindowState;
  manager: DocumentManager;
  drawing: DrawingDocument;
  layout: LayoutId;
  changeLayout: (layout: LayoutId) => void;
  focusCommand: () => void;
  locale: Locale;
  messages: Messages;
  inputIsDynamic?: () => boolean;
}) {
  const { session, navigation, tools, files, surface, commandWindow, messages } = options;
  const shortcutText = getShortcutMessages(options.locale);
  const toggle = useDraftingToggle({
    sysvars: session.sysvars,
    locale: options.locale,
    print: session.print,
    failure: (error) => messages.commandFailure(errorMessage(error, messages)),
    refresh: session.refresh,
    focus: options.focusCommand,
  });
  const routing = useCommandRouting({
    session,
    navigation,
    tools,
    surface,
    locale: options.locale,
  });
  const macros = useMacroRunner({
    registry: session.registry,
    target: routing,
    sysvars: session.sysvars,
    print: session.print,
    setEcho: session.setEcho,
    toggle: (key) => toggle(macroToggles[key]),
    unsupported: messages.macroUnsupported,
  });
  /** User input: it answers a macro pause, and a new command typed at idle ends a macro. */
  async function submit(value: string): Promise<void> {
    if (!routing.isActive() && value.trim()) macros.abort();
    await routing.submit(value);
    macros.inputReceived();
  }
  function cancel(): void {
    macros.abort();
    routing.cancel();
  }
  /** Menus, ribbon and buttons run AutoCAD macros; a bare command name gets ^C^C_. */
  function execute(command: string): void {
    surface.current?.cancelPointerInteraction();
    if (files.restoring) files.cancelRestore(false);
    commandWindow.show();
    void macros.run(/[\^;\\$*']/.test(command) ? command : `^C^C_${command}`);
    options.focusCommand();
  }
  const pending = (action: 'cycleViewports' | 'cycleOverlap'): void =>
    session.print(shortcutText.actionPending(shortcutText[action]));
  useWorkspaceShortcuts({
    files,
    draft: tools.draft,
    isActive: routing.isActive,
    cancelTools: () => {
      tools.cancelAll();
      navigation.cancel(false);
    },
    execute,
    toggle,
    enter: () => void submit(session.input),
    focusCommand: options.focusCommand,
    cancelPointer: () => surface.current?.cancelPointerInteraction(),
    toggleCommand: commandWindow.toggle,
    toggleExpanded: commandWindow.pressF2,
    openTextWindow: commandWindow.openTextWindow,
    switchDrawing: (offset) => {
      const ids = options.manager.all.map((item) => item.id);
      const index = ids.indexOf(options.drawing.id);
      const next = ids[(index + offset + ids.length) % ids.length];
      if (!next || next === options.drawing.id) return;
      tools.cancelAll();
      options.manager.activate(next);
    },
    switchLayout: (offset) => {
      const index = layoutOrder.indexOf(options.layout);
      options.changeLayout(
        layoutOrder[(index + offset + layoutOrder.length) % layoutOrder.length]!,
      );
    },
    pending,
  });
  useTempOverrideKeys({
    ...(options.inputIsDynamic ? { inputIsDynamic: options.inputIsDynamic } : {}),
    sysvars: session.sysvars,
    mode: routing.inputMode,
    input: session.input,
    cycleOverlap: () => pending('cycleOverlap'),
  });
  return {
    routing,
    toggle,
    submit,
    cancel,
    execute,
    inputReceived: macros.inputReceived,
    canSnapPoint: () =>
      !session.isPrompting('nested') &&
      (navigation.isActive()
        ? navigation.needsPoint()
        : tools.draft.isDrafting() ||
          tools.dimensions.needsPoint() ||
          tools.modification.needsPoint() ||
          tools.measurement.isActive() ||
          tools.editing.needsPoint() ||
          tools.text.needsPoint()),
    pendingTooltip: shortcutText.pendingTooltip,
  };
}
