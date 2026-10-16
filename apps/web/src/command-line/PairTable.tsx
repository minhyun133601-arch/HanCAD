import { useEffect, useState } from 'react';
import type { AliasEditMessages } from '@hancad/ui';

export interface PairRow {
  key: string;
  value: string;
  source?: string;
}

/**
 * Two-column list (alias/command, mistype/command, synonym/command) with the fields
 * and Add/Change/Remove buttons of the alias editor.
 */
export function PairTable({
  rows,
  text,
  keyLabel,
  valueLabel,
  sourceLabel,
  onSet,
  onRemove,
}: {
  rows: readonly PairRow[];
  text: AliasEditMessages;
  keyLabel: string;
  valueLabel: string;
  sourceLabel?: string;
  /** Returns an error message, or undefined when the entry was stored. */
  onSet: (key: string, value: string) => string | undefined;
  onRemove: (key: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    if (selected && !rows.some((row) => row.key === selected)) setSelected(null);
  }, [rows, selected]);
  const exists = rows.some((row) => row.key === key.trim().toUpperCase());
  return (
    <div className="pair-table">
      <div className="pair-rows" role="listbox" aria-label={keyLabel}>
        <div className="pair-row pair-head" aria-hidden="true">
          <span>{keyLabel}</span>
          <span>{valueLabel}</span>
          {sourceLabel && <span>{sourceLabel}</span>}
        </div>
        {rows.map((row) => (
          <div
            key={row.key}
            role="option"
            aria-selected={row.key === selected}
            className="pair-row"
            onClick={() => {
              setSelected(row.key);
              setKey(row.key);
              setValue(row.value);
              setError(undefined);
            }}
          >
            <span>{row.key}</span>
            <span>{row.value}</span>
            {sourceLabel && <span>{row.source}</span>}
          </div>
        ))}
      </div>
      <div className="pair-form">
        <label>
          {keyLabel}
          <input
            value={key}
            aria-label={keyLabel}
            spellCheck={false}
            onChange={(event) => setKey(event.target.value)}
          />
        </label>
        <label>
          {valueLabel}
          <input
            value={value}
            aria-label={valueLabel}
            spellCheck={false}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <button
          disabled={!key.trim() || !value.trim()}
          onClick={() => {
            // Trailing spaces may belong to a PGP prompt; handlers trim names themselves.
            const failure = onSet(key.trim(), value.trimStart());
            setError(failure);
            if (!failure) setSelected(key.trim().toUpperCase());
          }}
        >
          {exists ? text.change : text.add}
        </button>
        <button
          disabled={!exists}
          onClick={() => {
            onRemove(key.trim().toUpperCase());
            setSelected(null);
            setKey('');
            setValue('');
          }}
        >
          {text.remove}
        </button>
      </div>
      {error && (
        <p className="dialog-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
