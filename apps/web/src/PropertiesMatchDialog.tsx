import { useState } from 'react';
import { matchPropertyLabels } from './properties-match';
import type { MatchProperty, MatchSettings } from './properties-match';

export function PropertiesMatchDialog({
  settings,
  korean,
  close,
  apply,
  plotStyleAvailable = true,
}: {
  settings: MatchSettings;
  korean: boolean;
  close: () => void;
  apply: (settings: MatchSettings) => void;
  plotStyleAvailable?: boolean;
}) {
  const [values, setValues] = useState(settings);
  return (
    <div className="properties-dialog-backdrop">
      <section
        className="properties-match-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={korean ? '특성 설정' : 'Property Settings'}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') close();
        }}
      >
        <h2>{korean ? '특성 설정' : 'Property Settings'}</h2>
        {(['basic', 'special'] as const).map((group) => (
          <fieldset key={group}>
            <legend>
              {group === 'basic'
                ? korean
                  ? '기본 특성'
                  : 'Basic Properties'
                : korean
                  ? '특수 특성'
                  : 'Special Properties'}
            </legend>
            {(Object.keys(matchPropertyLabels) as MatchProperty[])
              .filter(
                (key) =>
                  ['text', 'dimension', 'polyline', 'material'].includes(key) ===
                  (group === 'special'),
              )
              .map((key) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    autoFocus={key === 'color'}
                    checked={values[key]}
                    disabled={key === 'plotStyle' && !plotStyleAvailable}
                    onChange={(event) => setValues({ ...values, [key]: event.target.checked })}
                  />
                  {matchPropertyLabels[key][korean ? 0 : 1]}
                </label>
              ))}
          </fieldset>
        ))}
        <footer>
          <button onClick={() => apply(values)}>{korean ? '확인' : 'OK'}</button>
          <button onClick={close}>{korean ? '취소' : 'Cancel'}</button>
        </footer>
      </section>
    </div>
  );
}
