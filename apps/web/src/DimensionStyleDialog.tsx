import { useEffect, useRef, useState } from 'react';
import { getSystemVariableDefinition, validateSystemVariable } from '@hancad/sysvars';
import type { SystemVariables } from '@hancad/sysvars';
import type { Messages } from '@hancad/ui';
import { dimensionStyleFields } from './dimension-style';
import type { DimensionStyleValues } from './dimension-style';
import { errorMessage } from './error-presenter';

export function DimensionStyleDialog({
  open,
  messages,
  sysvars,
  selectedCount,
  onClose,
  onApply,
}: {
  open: boolean;
  messages: Messages;
  sysvars: SystemVariables;
  selectedCount: number;
  onClose: () => void;
  onApply: (values: DimensionStyleValues, applySelected: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [applySelected, setApplySelected] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setValues(
        Object.fromEntries(dimensionStyleFields.map(([name]) => [name, String(sysvars.get(name))])),
      );
      setApplySelected(selectedCount > 0);
      setError('');
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="dimension-style-dialog"
      aria-labelledby="dimension-settings-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const numeric = Object.fromEntries(
              dimensionStyleFields.map(([name]) => {
                const definition = getSystemVariableDefinition(name);
                if (!definition) throw new Error(name);
                const value =
                  definition.type === 'string' ? (values[name] ?? '') : Number(values[name]);
                validateSystemVariable(definition, value);
                return [name, value];
              }),
            ) as DimensionStyleValues;
            onApply(numeric, applySelected);
            onClose();
          } catch (failure) {
            setError(messages.commandFailure(errorMessage(failure, messages)));
          }
        }}
      >
        <h2 id="dimension-settings-title">{messages.dimensionBasicSettings}</h2>
        <p className="dimension-current-style">
          {messages.currentDimensionStyle}: {String(sysvars.get('DIMSTYLE'))}
        </p>
        <p className="dimension-settings-note">{messages.dimensionSettingsNote}</p>
        <div className="dimension-fields">
          {dimensionStyleFields.map(([name, label]) => {
            const definition = getSystemVariableDefinition(name);
            return (
              <label key={name}>
                <span>
                  {messages[label]} <small>{name}</small>
                </span>
                <input
                  type={definition?.type === 'string' ? 'text' : 'number'}
                  required={definition?.type !== 'string'}
                  aria-label={messages[label]}
                  value={values[name] ?? ''}
                  min={definition?.min}
                  max={definition?.max}
                  step={definition?.type === 'integer' ? 1 : 'any'}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [name]: event.target.value }))
                  }
                />
              </label>
            );
          })}
        </div>
        <label className="dimension-apply-selected">
          <input
            type="checkbox"
            checked={applySelected}
            disabled={selectedCount === 0}
            onChange={(event) => setApplySelected(event.target.checked)}
          />
          {messages.applySelectedDimensions} ({selectedCount})
        </label>
        {error && (
          <p className="dimension-setting-error" role="alert">
            {error}
          </p>
        )}
        <div className="dimension-dialog-actions">
          <button type="button" onClick={onClose}>
            {messages.dimCancel}
          </button>
          <button type="submit">{messages.dimApply}</button>
        </div>
      </form>
    </dialog>
  );
}
