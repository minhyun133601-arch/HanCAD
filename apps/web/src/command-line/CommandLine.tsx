import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { ImeController } from '@hancad/input';
import type { PromptInputMode } from '@hancad/input';
import type { CommandLineMessages, Messages } from '@hancad/ui';
import type { HistoryLine } from '../useCommandSession';
import { ContextMenu } from '../menus/ContextMenu';
import type { MenuEntry } from '../menus/ContextMenu';
import { inputBlocked } from '../ui-focus';
import { HistoryView } from './HistoryView';
import { PromptKeywords } from './PromptKeywords';
import type { AutoCompleteView } from './useAutoComplete';
import type { CommandLineLayout } from './layout';
import './command-line.css';

export interface CommandLineProps {
  messages: Messages;
  text: CommandLineMessages;
  history: readonly HistoryLine[];
  input: string;
  busy: boolean;
  prompt: string;
  /** Name of the running command shown before its prompt, as in AutoCAD 2013+. */
  commandName: string | null;
  editable: boolean;
  /** Active prompt type; decides physical-key versus IME text handling. */
  mode: PromptInputMode;
  blocked?: boolean;
  expanded: boolean;
  promptLines: number;
  layout: CommandLineLayout;
  inputRef: RefObject<HTMLDivElement | HTMLInputElement | null>;
  changeInput: (value: string) => void;
  execute: (value: string) => Promise<void>;
  recall: (direction: -1 | 1) => void;
  cancel: () => void;
  onExpanded: () => void;
  onLayout: (layout: CommandLineLayout) => void;
  onClose: () => void;
  customizeItems: readonly MenuEntry[];
  contextItems: () => readonly MenuEntry[];
  recentItems: () => readonly MenuEntry[];
  /** AutoComplete state; it may consume navigation keys and replace accepted text. */
  autoComplete?: AutoCompleteView;
  /** Suggestion list shown above the input. */
  suggestionList?: ReactNode;
  /** Extra content below the prompt row. */
  children?: ReactNode;
}

export function CommandLine(props: CommandLineProps) {
  const { messages, text, input, busy, prompt, editable, expanded, inputRef, changeInput } = props;
  const section = useRef<HTMLElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [ime] = useState(() => new ImeController());
  ime.setMode(props.mode);
  const [menu, setMenu] = useState<{ x: number; y: number; items: readonly MenuEntry[] } | null>(
    null,
  );
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [listLeft, setListLeft] = useState(0);
  useLayoutEffect(() => {
    // The suggestion list opens above the typing position, as in AutoCAD.
    const left = inputRef.current?.offsetLeft ?? 0;
    if (left !== listLeft) setListLeft(left);
  });
  const { layout } = props;
  const idle = !props.commandName && !busy && props.mode === 'command';

  useEffect(() => {
    // A docked window takes its height from the drawing area instead of covering it.
    const element = section.current,
      parent = element?.parentElement;
    if (!element || !parent) return;
    if (!layout.docked) {
      parent.style.removeProperty('--command-dock-height');
      return;
    }
    const observer = new ResizeObserver(() =>
      parent.style.setProperty('--command-dock-height', `${element.offsetHeight}px`),
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      parent.style.removeProperty('--command-dock-height');
    };
  }, [layout.docked]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent): void {
      const target = event.target;
      if (latest.current.blocked || inputBlocked()) return;
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
      if (!action) return;
      if (current.autoComplete?.handleKey(action)) {
        event.preventDefault();
        current.inputRef.current?.focus({ preventScroll: true });
        return;
      }
      if (action.type === 'tab' || action.type === 'caret' || action.type === 'delete') return;
      event.preventDefault();
      if (action.type === 'cancel') current.cancel();
      else if (action.type === 'accept')
        void current.execute(current.autoComplete?.acceptText(current.input) ?? current.input);
      else if (action.type === 'history') current.recall(action.direction);
      else if (action.type === 'backspace') current.changeInput(current.input.slice(0, -1));
      else current.changeInput(current.input + action.text);
      if (!(target instanceof HTMLElement && target.dataset.testid === 'drawing-canvas'))
        current.inputRef.current?.focus({ preventScroll: true });
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [ime]);

  function openMenu(x: number, y: number, items: readonly MenuEntry[]): void {
    setMenu({ x, y, items });
  }
  function workspaceRect(): DOMRect | undefined {
    return section.current?.parentElement?.getBoundingClientRect();
  }
  function startDrag(event: React.PointerEvent<HTMLElement>): void {
    const bar = section.current?.getBoundingClientRect();
    if (!bar || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ dx: event.clientX - bar.left, dy: event.clientY - bar.bottom });
  }
  function dragTo(event: React.PointerEvent<HTMLElement>, finish: boolean): void {
    const area = workspaceRect();
    if (!drag || !area) return;
    const width = Math.min(layout.width, area.width - 16);
    const left = Math.max(0, Math.min(area.width - width, event.clientX - area.left - drag.dx));
    const raw = area.bottom - (event.clientY - drag.dy);
    // Dragging past the bottom edge docks; a docked window undocks once lifted clearly.
    const dock = layout.docked ? raw < 30 : raw < -6;
    if (finish) setDrag(null);
    if (finish || !dock)
      props.onLayout({ ...layout, docked: dock, x: left, bottom: Math.max(0, raw) });
  }

  const opacity = layout.docked ? 1 : 1 - layout.transparency / 100;
  const className = [
    'command-line',
    layout.docked ? 'docked' : 'floating',
    expanded ? 'expanded' : '',
    drag ? 'dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const position = layout.docked
    ? undefined
    : {
        left: layout.x < 0 ? undefined : layout.x,
        bottom: layout.bottom,
        width: `min(${layout.width}px, calc(100% - 16px))`,
        '--command-line-alpha': opacity,
      };
  return (
    <section
      ref={section}
      className={className}
      aria-label={messages.commandLine}
      style={position as React.CSSProperties | undefined}
      onContextMenu={(event) => {
        if ((event.target as Element).closest('input')) return;
        event.preventDefault();
        openMenu(event.clientX, event.clientY, props.contextItems());
      }}
    >
      <HistoryView
        lines={props.history}
        presentation={layout.docked ? 'docked' : expanded ? 'expanded' : 'temporary'}
        visibleLines={layout.docked ? layout.dockedLines : props.promptLines}
        label={messages.commandHistory}
      />
      <div
        className="command-input-row"
        style={{ '--suggestion-left': `${listLeft}px` } as React.CSSProperties}
      >
        {props.suggestionList}
        <span
          className="command-grip"
          role="button"
          aria-label={text.moveHandle}
          title={text.moveHandle}
          onPointerDown={startDrag}
          onPointerMove={(event) => dragTo(event, false)}
          onPointerUp={(event) => dragTo(event, true)}
          onPointerCancel={() => setDrag(null)}
        />
        <button
          className="command-tool"
          aria-label={text.close}
          title={text.close}
          onClick={props.onClose}
        >
          ×
        </button>
        <button
          className="command-tool"
          aria-label={text.customize}
          title={text.customize}
          aria-haspopup="menu"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            openMenu(rect.left, rect.top - 4, props.customizeItems);
          }}
        >
          <span aria-hidden="true">🔧</span>
        </button>
        <button
          className="command-tool recent"
          aria-label={text.recentCommands}
          title={text.recentCommands}
          aria-haspopup="menu"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            openMenu(rect.left, rect.top - 4, props.recentItems());
          }}
        >
          <span aria-hidden="true">▸_</span>
        </button>
        {props.commandName && <span className="command-name">{props.commandName}</span>}
        <span className={idle ? 'command-prompt idle' : 'command-prompt'}>
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
            {input ||
              (idle && <span className="command-placeholder">{messages.commandInput}</span>)}
            <span className="command-caret" aria-hidden="true" />
            {props.autoComplete?.completion && (
              <span className="command-completion" aria-hidden="true">
                {props.autoComplete.completion}
              </span>
            )}
          </div>
        )}
        <button
          className="history-toggle"
          onClick={props.onExpanded}
          aria-label={expanded ? messages.collapseHistory : messages.expandHistory}
          aria-expanded={expanded}
          title={`${expanded ? messages.collapseHistory : messages.expandHistory} (F2)`}
        >
          <span aria-hidden="true">{expanded ? '⌄' : '⌃'}</span>
        </button>
      </div>
      {props.children}
      {menu && (
        <ContextMenu
          items={menu.items}
          x={menu.x}
          y={menu.y}
          label={messages.commandLine}
          onClose={() => {
            setMenu(null);
            inputRef.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </section>
  );
}
