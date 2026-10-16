import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { mapKeyboardCode, reverseHangulInput } from '@hancad/input';
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
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const current = latest.current;
      if (event.code === 'Escape') {
        event.preventDefault();
        current.cancel();
      } else if (event.code === 'Enter' || event.code === 'NumpadEnter' || event.code === 'Space') {
        event.preventDefault();
        void current.execute(current.input);
      } else if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
        event.preventDefault();
        current.recall(event.code === 'ArrowUp' ? -1 : 1);
      } else if (event.code === 'Backspace') {
        event.preventDefault();
        current.changeInput(current.input.slice(0, -1));
      } else {
        const key = mapKeyboardCode(event.code, event.shiftKey);
        if (key === undefined) return;
        event.preventDefault();
        current.changeInput(current.input + key);
      }
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
              if (event.nativeEvent.isComposing) return;
              if (event.code === 'Enter' || event.code === 'NumpadEnter') {
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
              changeInput(input + reverseHangulInput(event.clipboardData.getData('text/plain')));
            }}
            onCompositionEnd={(event) => {
              if (event.data) changeInput(input + reverseHangulInput(event.data));
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
