import { useEffect, useState } from 'react';
import type { InputSearchOptions } from '@hancad/commands';
import type { InputSearchMessages } from '@hancad/ui';
import { ModalDialog } from './CommandDialogs';

/** INPUTSEARCHOPTIONS: the Input Search Options dialog. */
export function InputSearchDialog({
  open,
  text,
  options,
  delay,
  onApply,
  onClose,
}: {
  open: boolean;
  text: InputSearchMessages;
  options: InputSearchOptions;
  delay: number;
  onApply: (options: InputSearchOptions, delay: number) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(options);
  const [delayText, setDelayText] = useState(String(delay));
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    if (!open) return;
    setDraft(options);
    setDelayText(String(delay));
  }, [open, options, delay]);
  const change = (patch: Partial<InputSearchOptions>) =>
    setDraft((value) => ({ ...value, ...patch }));
  const check = (label: string, key: keyof InputSearchOptions, disabled = false) => (
    <label className={disabled ? 'disabled' : undefined}>
      <input
        type="checkbox"
        checked={draft[key] === true}
        disabled={disabled}
        onChange={(event) => change({ [key]: event.target.checked })}
      />
      {label}
    </label>
  );
  function moveType(step: -1 | 1): void {
    const types = [...draft.contentTypes];
    const target = selected + step;
    if (target < 0 || target >= types.length) return;
    [types[selected], types[target]] = [types[target]!, types[selected]!];
    change({ contentTypes: types });
    setSelected(target);
  }
  const delayValue = Number(delayText);
  const delayValid = Number.isFinite(delayValue) && delayValue >= 100 && delayValue <= 10000;
  return (
    <ModalDialog
      open={open}
      title={text.title}
      className="input-search-dialog"
      onClose={onClose}
      footer={
        <>
          <button
            disabled={!delayValid}
            onClick={() => {
              onApply(draft, Math.round(delayValue));
              onClose();
            }}
          >
            {text.ok}
          </button>
          <button onClick={onClose}>{text.cancel}</button>
        </>
      }
    >
      <fieldset>
        <legend>{text.autoComplete}</legend>
        {check(text.enableAutoComplete, 'autoComplete')}
        <div className="indented">
          {check(text.midString, 'midString', !draft.autoComplete)}
          <div role="radiogroup" aria-label={text.sortOrder}>
            {([true, false] as const).map((usage) => (
              <label key={String(usage)}>
                <input
                  type="radio"
                  name="input-search-order"
                  checked={draft.sortByUsage === usage}
                  onChange={() => change({ sortByUsage: usage })}
                />
                {usage ? text.byUsage : text.alphabetical}
              </label>
            ))}
          </div>
        </div>
      </fieldset>
      <fieldset>
        <legend>{text.autoCorrect}</legend>
        {check(text.enableAutoCorrect, 'autoCorrect')}
        <label className={`indented${draft.autoCorrect ? '' : ' disabled'}`}>
          {text.rememberBefore}
          <input
            type="number"
            min={1}
            max={99}
            value={draft.correctionThreshold}
            disabled={!draft.autoCorrect}
            aria-label={`${text.rememberBefore} n ${text.rememberAfter}`.trim()}
            onChange={(event) => change({ correctionThreshold: Number(event.target.value) || 1 })}
          />
          {text.rememberAfter}
        </label>
      </fieldset>
      <fieldset>
        <legend>{text.systemVariableSearch}</legend>
        {check(text.searchSystemVariables, 'systemVariables')}
        <div className="indented">
          {check(text.separate, 'separateSystemVariables', !draft.systemVariables)}
        </div>
      </fieldset>
      <fieldset>
        <legend>{text.delay}</legend>
        <label>
          <input
            type="number"
            min={100}
            max={10000}
            step={50}
            value={delayText}
            aria-label={text.delay}
            aria-invalid={!delayValid}
            onChange={(event) => setDelayText(event.target.value)}
          />
          {text.milliseconds}
        </label>
      </fieldset>
      <fieldset>
        <legend>{text.content}</legend>
        {check(text.searchContent, 'content')}
        <div className="content-types" aria-label={text.contentTypes} role="group">
          <ul role="listbox" aria-label={text.contentTypes}>
            {draft.contentTypes.map((item, index) => (
              <li
                key={item.type}
                role="option"
                aria-selected={index === selected}
                onClick={() => setSelected(index)}
              >
                <input
                  type="checkbox"
                  checked={item.enabled}
                  disabled={!draft.content}
                  aria-label={text.contentNames[item.type]}
                  onChange={(event) =>
                    change({
                      contentTypes: draft.contentTypes.map((entry) =>
                        entry.type === item.type
                          ? { ...entry, enabled: event.target.checked }
                          : entry,
                      ),
                    })
                  }
                />
                {text.contentNames[item.type]}
              </li>
            ))}
          </ul>
          <div className="content-order">
            <button aria-label={text.moveUp} title={text.moveUp} onClick={() => moveType(-1)}>
              ▲
            </button>
            <button aria-label={text.moveDown} title={text.moveDown} onClick={() => moveType(1)}>
              ▼
            </button>
          </div>
        </div>
        <p className="dialog-note">{text.contentPending}</p>
      </fieldset>
    </ModalDialog>
  );
}
