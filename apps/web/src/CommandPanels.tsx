import type { Locale } from '@hancad/ui';
import type { useCommandSession } from './useCommandSession';
import type { useCommandInput } from './useCommandInput';
import { useCommandHelp } from './useCommandHelp';
import { CommandHelpPanel } from './CommandHelpPanel';
import { DrawingShortcutMenus } from './menus/DrawingShortcutMenus';
import { useDraftingSettingsCommands } from './useDraftingSettingsCommands';
import { DraftingSettingsDialog } from './DraftingSettingsDialog';

/** Auxiliary command surfaces share the same routing as the command window. */
export function CommandPanels(props: {
  session: ReturnType<typeof useCommandSession>;
  input: ReturnType<typeof useCommandInput>;
  selected: boolean;
  clearSelection: () => void;
  focus: () => void;
  locale: Locale;
  blocked: boolean;
}) {
  const help = useCommandHelp(props.session.registry, props.input.routing.commandName);
  const settings = useDraftingSettingsCommands(props.session.registry, props.locale);
  return (
    <>
      <DrawingShortcutMenus {...props} />
      <DraftingSettingsDialog
        tab={settings.tab}
        sysvars={props.session.sysvars}
        locale={props.locale}
        close={() => {
          settings.close();
          props.focus();
        }}
      />
      <CommandHelpPanel
        registry={props.session.registry}
        topic={help.topic}
        locale={props.locale}
        select={help.select}
        close={() => {
          help.close();
          props.focus();
        }}
      />
    </>
  );
}
