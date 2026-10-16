import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { ImeController } from '@hancad/input';
import type { PromptInputMode } from '@hancad/input';
import type { Messages } from '@hancad/ui';
import type { HistoryLine } from './useCommandSession';
import { PromptKeywords } from './PromptKeywords';

interface CommandLineProps {
  messages: Messages;
  history: readonly HistoryLine[];
  input: string;
  busy: boolean;
  prompt: string;
  editable: boolean;
  /** Active prompt type; decides physical-key versus IME text handling. */
  mode: PromptInputMode;
  blocked?: boolean;
  expanded: boolean;
  inputRef: RefObject<HTMLDivElement | HTMLInputElement | null>;
  changeInput: (value: string) => void;
  execute: (value: string) => Promise<void>;
  recall: (direction: -1 | 1) => void;
  cancel: () => void;
  onExpanded: () => void;
}

export function CommandLine(props: CommandLineProps) {
  const {
    messages,
    history,
    input,
    busy,
    prompt,
    editable,
    expanded,
    inputRef,
    changeInput,
    onExpanded,
  } = props;
  const historyRef = useRef<HTMLDivElement>(null);
  const [ime] = useState(() => new ImeController());
  ime.setMode(props.mode);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight;
  }, [history, expanded]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent): void {
      const target = event.target;
      if (latest.current.blocked || document.querySelector('dialog[open], [data-file-menu-open]'))
        return;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      )
        return;
      if (
        target instanceof HTMLElement &&
        target.closest('button, summary, a[href], [role="tab"]') &&
        ['Enter', 'NumpadEnter', 'Space', 'ArrowUp', 'ArrowDown'].includes(event.code)
      )
        return;
      if (event.defaultPrevented) return;
      const current = latest.current;
      const action = ime.keyAction(event, current.mode);
      if (!action || action.type === 'tab' || action.type === 'caret' || action.type === 'delete')
        return;
      event.preventDefault();
      if (action.type === 'cancel') current.cancel();
      else if (action.type === 'accept') void current.execute(current.input);
      else if (action.type === 'history') current.recall(action.direction);
      else if (action.type === 'backspace') current.changeInput(current.input.slice(0, -1));
      else current.changeInput(current.input + action.text);
      current.inputRef.current?.focus({ preventScroll: true });
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <section
      className={expanded ? 'command-line expanded' : 'command-line'}
      aria-label={messages.commandLine}
    >
      <div className="command-header">
        <span>{messages.commandLine}</span>
        <span className="command-help">{messages.commandHelp}</span>
        <button
          className="history-toggle"
          onClick={onExpanded}
          aria-label={expanded ? messages.collapseHistory : messages.expandHistory}
          aria-expanded={expanded}
          title={expanded ? messages.collapseHistory : messages.expandHistory}
        >
          <span aria-hidden="true">{expanded ? '⌄' : '⌃'}</span>
        </button>
      </div>
      <div
        className="command-history"
        ref={historyRef}
        role="log"
        aria-live="polite"
        aria-label={messages.commandHistory}
      >
        {history.map((line) => (
          <div key={line.id} className={`history-line ${line.kind}`}>
            {line.text}
          </div>
        ))}
      </div>
      <div className="command-input-row">
        <span className="command-prompt">
          <PromptKeywords
            prompt={prompt}
            execute={(keyword) => {
              void props.execute(keyword);
              inputRef.current?.focus({ preventScroll: true });
            }}
          />
        </span>
        {editable ? (
          <input
            ref={(element) => {
              inputRef.current = element;
            }}
            className="free-text-input"
            aria-label={messages.commandInput}
            placeholder={messages.commandInput}
            value={input}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => changeInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              const accepts =
                event.code === 'Enter' ||
                event.code === 'NumpadEnter' ||
                (event.code === 'Space' && ime.policy.spaceAccepts);
              if (accepts) {
                event.preventDefault();
                void props.execute(input);
              } else if (event.code === 'Escape') {
                event.preventDefault();
                props.cancel();
              }
            }}
          />
        ) : (
          <div
            ref={(element) => {
              inputRef.current = element;
            }}
            role="textbox"
            tabIndex={0}
            className="command-input"
            aria-label={messages.commandInput}
            aria-placeholder={messages.commandInput}
            aria-busy={busy}
            contentEditable={false}
            onPaste={(event) => {
              event.preventDefault();
              changeInput(input + ime.normalize(event.clipboardData.getData('text/plain')));
            }}
            onCompositionEnd={(event) => {
              if (event.data) changeInput(input + ime.normalize(event.data));
            }}
          >
            {input || <span className="command-placeholder">{messages.commandInput}</span>}
            <span className="command-caret" aria-hidden="true" />
          </div>
        )}
      </div>
    </section>
  );
}
