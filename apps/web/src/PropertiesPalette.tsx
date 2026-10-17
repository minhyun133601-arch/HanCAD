import { useEffect, useRef, useState } from 'react';
import type { CadEntity, LegacyCadState } from '@hancad/legacy-bridge';
import { entityProperties, propertyLineweights } from './entity-properties';
import './properties.css';

export function PropertiesPalette({
  entities,
  state,
  korean,
  quick,
  close,
  apply,
}: {
  entities: readonly CadEntity[];
  state: LegacyCadState;
  korean: boolean;
  quick?: boolean;
  close: () => void;
  apply: (key: string, value: string) => void;
}) {
  const properties = entityProperties(entities);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const currentIds = useRef('');
  const ids = entities.map((entity) => entity.id).join('|');
  const locked = entities.some((entity) =>
    state.layers.some((layer) => layer.name === entity.layer && layer.locked),
  );
  useEffect(() => {
    setValues({});
    setError('');
    currentIds.current = ids;
  }, [entities, ids]);
  function commit(key: string): void {
    if (currentIds.current !== ids || values[key] === undefined) return;
    try {
      apply(key, values[key]!);
      setValues((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
      setError('');
    } catch (failure) {
      setError(
        korean
          ? '특성 값이 올바르지 않습니다. 도면층 잠금 및 입력 범위를 확인하십시오.'
          : failure instanceof Error
            ? failure.message
            : 'Invalid property value.',
      );
    }
  }
  return (
    <aside
      className={`properties-palette${quick ? ' quick-properties' : ''}`}
      aria-label={
        quick ? (korean ? '빠른 특성' : 'Quick Properties') : korean ? '특성' : 'Properties'
      }
      data-testid={quick ? 'quick-properties' : 'properties-palette'}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      }}
    >
      <header>
        <strong>
          {quick ? (korean ? '빠른 특성' : 'Quick Properties') : korean ? '특성' : 'Properties'}
        </strong>
        <button aria-label={korean ? '닫기' : 'Close'} onClick={close}>
          ×
        </button>
      </header>
      <p>
        {entities.length
          ? korean
            ? `${entities.length}개 객체 선택됨`
            : `${entities.length} objects selected`
          : korean
            ? '선택한 객체가 없습니다.'
            : 'No selection'}
      </p>
      {locked && (
        <p className="properties-error">
          {korean ? '잠긴 도면층의 객체입니다.' : 'Objects are on locked layers.'}
        </p>
      )}
      <div className="properties-fields">
        {properties
          .filter(
            (property) =>
              !quick ||
              [
                'type',
                'layer',
                'color',
                'linetype',
                'radius',
                'length',
                'text',
                'textSize',
                'closed',
              ].includes(property.key),
          )
          .map((property) => {
            const text = values[property.key] ?? property.value;
            const displayText =
              korean && property.key === 'type'
                ? ((
                    {
                      line: '선',
                      circle: '원',
                      arc: '호',
                      polyline: '폴리선',
                      rect: '폴리선',
                      text: '문자',
                      dimension: '치수',
                    } as Record<string, string>
                  )[text] ?? text)
                : text;
            const disabled = locked || property.readOnly;
            const label = korean ? property.ko : property.en;
            return (
              <label key={property.key}>
                <span>{label}</span>
                {property.key === 'layer' ? (
                  <select
                    aria-label={label}
                    disabled={disabled}
                    value={text}
                    onChange={(event) => {
                      try {
                        apply(property.key, event.target.value);
                        setError('');
                      } catch {
                        setError(korean ? '도면층을 변경할 수 없습니다.' : 'Cannot change layer.');
                      }
                    }}
                  >
                    {text === '*VARIES*' && (
                      <option value="*VARIES*">{korean ? '*다양함*' : '*VARIES*'}</option>
                    )}
                    {state.layers.map((layer) => (
                      <option key={layer.name} value={layer.name} disabled={layer.locked}>
                        {layer.name}
                      </option>
                    ))}
                  </select>
                ) : property.key === 'lineweight' || property.key === 'transparency' ? (
                  <select
                    aria-label={label}
                    disabled={disabled}
                    value={text}
                    onChange={(event) => {
                      try {
                        apply(property.key, event.target.value);
                        setError('');
                      } catch {
                        setError(korean ? '특성을 변경할 수 없습니다.' : 'Cannot change property.');
                      }
                    }}
                  >
                    {text === '*VARIES*' && (
                      <option value="*VARIES*">{korean ? '*다양함*' : '*VARIES*'}</option>
                    )}
                    {property.key === 'lineweight' ? (
                      [
                        -1,
                        -2,
                        ...propertyLineweights.filter((weight) => weight !== -1 && weight !== -2),
                      ].map((weight) => (
                        <option key={weight} value={String(weight)}>
                          {weight === -1
                            ? 'ByLayer'
                            : weight === -2
                              ? 'ByBlock'
                              : weight === -3
                                ? korean
                                  ? '기본값'
                                  : 'Default'
                                : `${(weight / 100).toFixed(2)} mm`}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="bylayer">ByLayer</option>
                        <option value="byblock">ByBlock</option>
                        {Array.from({ length: 91 }, (_, value) => (
                          <option key={value} value={String(value)}>
                            {value}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                ) : property.kind === 'boolean' ? (
                  <select
                    aria-label={label}
                    disabled={disabled}
                    value={text}
                    onChange={(event) => {
                      try {
                        apply(property.key, event.target.value);
                        setError('');
                      } catch {
                        setError(korean ? '특성을 변경할 수 없습니다.' : 'Cannot change property.');
                      }
                    }}
                  >
                    {text === '*VARIES*' && (
                      <option value="*VARIES*">{korean ? '*다양함*' : '*VARIES*'}</option>
                    )}
                    <option value="true">{korean ? '예' : 'Yes'}</option>
                    <option value="false">{korean ? '아니오' : 'No'}</option>
                  </select>
                ) : (
                  <input
                    aria-label={label}
                    disabled={disabled}
                    value={text === '*VARIES*' ? '' : displayText}
                    placeholder={
                      text === '*VARIES*' ? (korean ? '*다양함*' : '*VARIES*') : undefined
                    }
                    inputMode={property.kind === 'number' ? 'decimal' : 'text'}
                    list={property.key === 'color' ? 'property-colors' : undefined}
                    onChange={(event) =>
                      setValues((previous) => ({ ...previous, [property.key]: event.target.value }))
                    }
                    onBlur={() => commit(property.key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commit(property.key);
                      }
                    }}
                  />
                )}
              </label>
            );
          })}
      </div>
      <datalist id="property-colors">
        <option value="ByLayer" />
        <option value="ByBlock" />
        <option value="#ff0000" />
        <option value="#ffff00" />
        <option value="#00ff00" />
        <option value="#00ffff" />
        <option value="#0000ff" />
        <option value="#ff00ff" />
      </datalist>
      {error && (
        <p className="properties-error" role="alert">
          {error}
        </p>
      )}
    </aside>
  );
}
