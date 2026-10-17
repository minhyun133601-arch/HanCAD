import type { ReactNode, RefObject } from 'react';
import type { PromptInputMode } from '@hancad/input';
import { getInputSearchMessages } from '@hancad/ui';
import type { CommandLineMessages, Locale, Messages } from '@hancad/ui';
import type { MenuEntry } from '../menus/ContextMenu';
import type { useCommandSession } from '../useCommandSession';
import { CommandLine } from './CommandLine';
import { CloseCommandLineDialog, TextWindow, TransparencyDialog } from './CommandDialogs';
import { InputSearchDialog } from './InputSearchDialog';
import { PgpCommands } from './PgpCommands';
import { SuggestionList } from './SuggestionList';
import { useAutoComplete } from './useAutoComplete';
import './input-search.css';
import { useInputSearch } from './useInputSearch';
import { readClipboardText, selectedHistoryText, writeClipboardText } from './text-clipboard';
import type { CommandWindowState } from './useCommandWindow';

interface CommandWindowProps {
  window: CommandWindowState;
  messages: Messages;
  locale: Locale;
  text: CommandLineMessages;
  session: ReturnType<typeof useCommandSession>;
  drawingName: string;
  prompt: string;
  commandName: string | null;
  mode: PromptInputMode;
  selectionKeywords?: readonly string[];
  /** A command or command-owned prompt is running (suggestions need ' input). */
  commandActive: boolean;
  editable: boolean;
  blocked: boolean;
  inputRef: RefObject<HTMLDivElement | HTMLInputElement | null>;
  /** Submits input to the active prompt (or the command prompt). */
  submit: (value: string) => Promise<void>;
  /** Cancels whatever is running and starts a command, as a menu macro would. */
  runCommand: (command: string) => void;
  recall: (direction: -1 | 1) => void;
  cancel: () => void;
  children?: ReactNode;
}

/** The command line plus its text window, transparency and close dialogs. */
export function CommandWindow(props: CommandWindowProps) {
  const { window: state, text, session } = props;
  const searchText = getInputSearchMessages(props.locale);
  const search = useInputSearch({
    registry: session.registry,
    sysvars: session.sysvars,
    text,
    runCommand: props.runCommand,
  });
  const autoComplete = useAutoComplete({
    registry: session.registry,
    store: search.store,
    options: search.options,
    input: session.input,
    mode: props.mode,
    commandActive: props.commandActive,
    delay: session.sysvars.getNumber('INPUTSEARCHDELAY'),
  });
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
  const settings: readonly MenuEntry[] = [
    { id: 'input-settings', label: text.inputSettings, items: search.settings },
  ];
  const customize: readonly MenuEntry[] = [
    ...settings,
    {
      id: 'input-search-options',
      label: text.inputSearchOptions,
      onSelect: () => props.runCommand('INPUTSEARCHOPTIONS'),
    },
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
          {...(props.selectionKeywords ? { selectionKeywords: props.selectionKeywords } : {})}
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
          autoComplete={autoComplete}
          suggestionList={
            <SuggestionList
              view={autoComplete}
              text={searchText}
              onChoose={(index) => void props.submit(autoComplete.choose(index))}
            />
          }
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
      <InputSearchDialog
        open={search.dialogOpen}
        text={searchText}
        options={search.options}
        delay={session.sysvars.getNumber('INPUTSEARCHDELAY')}
        onApply={search.apply}
        onClose={() => {
          search.closeDialog();
          focus();
        }}
      />
      <PgpCommands
        session={session}
        locale={props.locale}
        searchStore={search.store}
        onClosed={focus}
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
