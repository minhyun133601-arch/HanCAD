import { useEffect, useRef, useState } from 'react';
import { getSystemVariableDefinition } from '@hancad/sysvars';
import type { SystemVariables } from '@hancad/sysvars';
import type { Locale } from '@hancad/ui';
import { draftingSettings, draftingTabs } from './drafting-settings-fields';
import type { DraftingTab, SettingField } from './drafting-settings-fields';
import {
  applySettings,
  fieldChecked,
  readSettings,
  selectedFieldValue,
  setSelectedFieldValue,
  setFieldChecked,
} from './drafting-settings-state';
import type { SettingsDraft } from './drafting-settings-state';
import './drafting-settings.css';

export function DraftingSettingsDialog({
  tab,
  sysvars,
  locale,
  close,
  onTabChange,
}: {
  tab: DraftingTab | null;
  sysvars: SystemVariables;
  locale: Locale;
  close: () => void;
  onTabChange: (tab: DraftingTab) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [active, setActive] = useState<DraftingTab>('snap');
  const [draft, setDraft] = useState<SettingsDraft>({});
  const [error, setError] = useState('');
  const ko = locale === 'ko-KR';
  useEffect(() => {
    if (tab) {
      setActive(tab);
      setDraft(readSettings(sysvars));
      setError('');
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [tab, sysvars]);
  const index = ko ? 0 : 1;
  function input(field: SettingField) {
    const label = field.label[index];
    const raw = draft[field.variable] ?? '';
    const definition = getSystemVariableDefinition(field.variable);
    if (field.kind === 'check')
      return (
        <label className="draft-setting-check">
          <input
            type="checkbox"
            checked={fieldChecked(field, draft)}
            onChange={(event) =>
              setDraft((old) => setFieldChecked(field, old, event.target.checked))
            }
          />
          {label}
        </label>
      );
    if (field.kind === 'select')
      return (
        <label className="draft-setting-field">
          <span>{label}</span>
          <select
            aria-label={label}
            value={selectedFieldValue(field, draft)}
            onChange={(event) =>
              setDraft((old) => setSelectedFieldValue(field, old, event.target.value))
            }
          >
            {field.options?.map(([value, korean, english]) => (
              <option key={value} value={value}>
                {ko ? korean : english}
              </option>
            ))}
          </select>
        </label>
      );
    const point = field.kind === 'point';
    const value = point ? (raw.split(',')[field.index ?? 0] ?? '') : raw;
    return (
      <label className="draft-setting-field">
        <span>{label}</span>
        <input
          aria-label={label}
          type={field.kind === 'text' || field.kind === 'angle' ? 'text' : 'number'}
          value={value}
          step={definition?.type === 'integer' ? 1 : 'any'}
          min={definition?.min}
          max={definition?.max}
          onChange={(event) => {
            const text = event.target.value;
            setDraft((old) => {
              if (!point) return { ...old, [field.variable]: text };
              const values = (old[field.variable] ?? '0,0').split(',');
              values[field.index ?? 0] = text;
              return { ...old, [field.variable]: values.join(',') };
            });
          }}
        />
      </label>
    );
  }
  function allSnaps(enabled: boolean): void {
    setDraft((old) => ({
      ...old,
      OSMODE: String((Number(old.OSMODE) & 16384) | (enabled ? 16383 : 0)),
    }));
  }
  return (
    <dialog
      ref={dialog}
      className="drafting-settings-dialog"
      aria-labelledby="drafting-settings-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            applySettings(sysvars, draft);
            close();
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : String(failure));
          }
        }}
      >
        <h2 id="drafting-settings-title">{ko ? '제도 설정' : 'Drafting Settings'}</h2>
        <div
          className="draft-settings-tabs"
          role="tablist"
          aria-label={ko ? '제도 설정 탭' : 'Drafting settings tabs'}
        >
          {draftingTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === active}
              onClick={() => {
                setActive(item.id);
                onTabChange(item.id);
              }}
            >
              {item.label[index]}
            </button>
          ))}
        </div>
        <section
          className="draft-settings-content"
          role="tabpanel"
          aria-label={draftingTabs.find((item) => item.id === active)?.label[index]}
        >
          {draftingSettings[active].map((group) => (
            <fieldset key={group.title[1]}>
              <legend>{group.title[index]}</legend>
              {group.fields.map((field) => (
                <div key={`${field.variable}-${field.bit ?? field.index ?? field.label[1]}`}>
                  {input(field)}
                </div>
              ))}
            </fieldset>
          ))}
          {active === 'osnap' && (
            <div className="draft-setting-actions">
              <button type="button" onClick={() => allSnaps(true)}>
                {ko ? '모두 선택' : 'Select All'}
              </button>
              <button type="button" onClick={() => allSnaps(false)}>
                {ko ? '모두 지우기' : 'Clear All'}
              </button>
            </div>
          )}
        </section>
        {error && (
          <p role="alert" className="draft-settings-error">
            {error}
          </p>
        )}
        <footer>
          <button type="submit">{ko ? '확인' : 'OK'}</button>
          <button type="button" onClick={close}>
            {ko ? '취소' : 'Cancel'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
