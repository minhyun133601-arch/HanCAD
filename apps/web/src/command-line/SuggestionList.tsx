import { useEffect, useRef } from 'react';
import type { InputSearchMessages } from '@hancad/ui';
import type { AutoCompleteView } from './useAutoComplete';

/** AutoCAD's command-line suggestion list, opened above the input after INPUTSEARCHDELAY. */
export function SuggestionList({
  view,
  text,
  onChoose,
}: {
  view: AutoCompleteView;
  text: InputSearchMessages;
  onChoose: (index: number) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [view.highlighted, view.group]);
  if (!view.items.length) return null;
  return (
    <div
      ref={list}
      className="suggestion-list"
      role="listbox"
      aria-label={view.group === 'variables' ? text.systemVariables : text.suggestions}
      // Keep keyboard focus on the command input while the mouse picks an entry.
      onPointerDown={(event) => event.preventDefault()}
    >
      {view.items.map((item, index) => (
        <div
          key={`${item.kind}-${item.name}`}
          role="option"
          aria-selected={index === view.highlighted}
          className="suggestion"
          title={item.kind === 'sysvar' ? text.variable : text.command}
          onPointerEnter={() => view.hover(index)}
          onClick={() => onChoose(index)}
        >
          <span className={`suggestion-icon ${item.kind}`} aria-hidden="true" />
          {item.name}
        </div>
      ))}
      {view.variableCount > 0 && (
        <div
          className="suggestion-group"
          role="option"
          aria-selected={false}
          onClick={() => view.handleKey({ type: 'tab', reverse: false })}
        >
          <span className="suggestion-icon sysvar" aria-hidden="true" />
          {text.systemVariables} ({view.variableCount}) <small>{text.tabHint}</small>
        </div>
      )}
    </div>
  );
}
