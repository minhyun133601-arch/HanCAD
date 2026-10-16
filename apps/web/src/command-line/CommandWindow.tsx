import type { ReactNode, RefObject } from 'react';
import type { PromptInputMode } from '@hancad/input';
import type { CommandLineMessages, Messages } from '@hancad/ui';
import type { MenuEntry } from '../menus/ContextMenu';
import type { useCommandSession } from '../useCommandSession';
import { CommandLine } from './CommandLine';
import { CloseCommandLineDialog, TextWindow, TransparencyDialog } from './CommandDialogs';
import { readClipboardText, selectedHistoryText, writeClipboardText } from './text-clipboard';
import type { CommandWindowState } from './useCommandWindow';

interface CommandWindowProps {
  window: CommandWindowState;
  messages: Messages;
  text: CommandLineMessages;
  session: ReturnType<typeof useCommandSession>;
  drawingName: string;
  prompt: string;
  commandName: string | null;
  mode: PromptInputMode;
  editable: boolean;
  blocked: boolean;
  inputRef: RefObject<HTMLDivElement | HTMLInputElement | null>;
  /** Submits input to the active prompt (or the command prompt). */
  submit: (value: string) => Promise<void>;
  /** Cancels whatever is running and starts a command, as a menu macro would. */
  runCommand: (command: string) => void;
  recall: (direction: -1 | 1) => void;
  cancel: () => void;
  /** Extra items (Input Settings) contributed by later milestones. */
  inputSettings?: readonly MenuEntry[];
  children?: ReactNode;
}

/** The command line plus its text window, transparency and close dialogs. */
export function CommandWindow(props: CommandWindowProps) {
  const { window: state, text, session } = props;
  const focus = (): void => props.inputRef.current?.focus({ preventScroll: true });
  async function copy(value: string): Promise<void> {
    if (!value) return;
    if (!(await writeClipboardText(value))) session.print(text.clipboardUnavailable);
  }
  async function paste(): Promise<void> {
    const value = await readClipboardText();
    if (value === undefined) session.print(text.clipboardUnavailable);
    else session.changeInput(session.input + value.replace(/\r?\n/g, ' '));
    focus();
  }
  const recent = (): readonly MenuEntry[] => {
    const names = session.recentCommands();
    if (!names.length)
      return [{ id: 'none', label: text.noRecentCommands, disabled: true, onSelect: () => {} }];
    return names.map((name) => ({ id: name, label: name, onSelect: () => props.runCommand(name) }));
  };
  const settings: readonly MenuEntry[] = props.inputSettings?.length
    ? [{ id: 'input-settings', label: text.inputSettings, items: props.inputSettings }]
    : [];
  const customize: readonly MenuEntry[] = [
    ...settings,
    {
      id: 'prompt-lines',
      label: text.promptHistoryLines,
      onSelect: () => props.runCommand('CLIPROMPTLINES'),
    },
    { id: 'transparency', label: text.transparency, onSelect: state.openTransparency },
    { kind: 'separator', id: 'options-separator' },
    { id: 'options', label: text.options, onSelect: () => props.runCommand('OPTIONS') },
  ];
  const context = (): readonly MenuEntry[] => {
    const selected = selectedHistoryText();
    return [
      { id: 'recent', label: text.recentCommands, items: recent() },
      ...settings,
      { kind: 'separator', id: 'clipboard-separator' },
      { id: 'copy', label: text.copy, disabled: !selected, onSelect: () => void copy(selected) },
      {
        id: 'copy-history',
        label: text.copyHistory,
        onSelect: () => void copy(session.history.map((line) => line.text).join('\r\n')),
      },
      { id: 'paste', label: text.paste, onSelect: () => void paste() },
      {
        id: 'paste-command-line',
        label: text.pasteToCommandLine,
        disabled: !selected,
        onSelect: () => session.changeInput(session.input + selected.replace(/\r?\n/g, ' ')),
      },
      { kind: 'separator', id: 'options-separator' },
      { id: 'options', label: text.options, onSelect: () => props.runCommand('OPTIONS') },
    ];
  };
  return (
    <>
      {state.visible && (
        <CommandLine
          messages={props.messages}
          text={text}
          history={session.history}
          input={session.input}
          prompt={props.prompt}
          commandName={props.commandName}
          editable={props.editable}
          mode={props.mode}
          busy={session.busy}
          blocked={props.blocked}
          expanded={state.expanded}
          promptLines={session.sysvars.getNumber('CLIPROMPTLINES')}
          layout={state.layout}
          inputRef={props.inputRef}
          changeInput={session.changeInput}
          execute={props.submit}
          recall={props.recall}
          cancel={props.cancel}
          onExpanded={state.toggleExpanded}
          onLayout={state.changeLayout}
          onClose={state.requestClose}
          customizeItems={customize}
          contextItems={context}
          recentItems={recent}
        >
          {props.children}
        </CommandLine>
      )}
      <TextWindow
        open={state.textWindow}
        text={text}
        drawing={props.drawingName}
        history={session.history}
        prompt={props.prompt}
        onCopy={(value) => void copy(value)}
        onClose={() => {
          state.closeTextWindow();
          focus();
        }}
      />
      <TransparencyDialog
        open={state.transparencyOpen}
        text={text}
        value={state.layout.transparency}
        onApply={(transparency) => state.changeLayout({ ...state.layout, transparency })}
        onClose={() => {
          state.closeTransparency();
          focus();
        }}
      />
      <CloseCommandLineDialog
        open={state.closeConfirm}
        text={text}
        onConfirm={() => {
          state.hide();
          session.print(text.commandLineHidden);
        }}
        onCancel={() => {
          state.cancelClose();
          focus();
        }}
      />
    </>
  );
}
