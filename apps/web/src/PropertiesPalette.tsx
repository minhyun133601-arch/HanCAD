import { useEffect, useMemo, useRef, useState } from 'react';
import type { CadEntity, LegacyCadState } from '@hancad/legacy-bridge';
import { entityProperties, propertyLineweights, propertyTypeLabel } from './entity-properties';
import type { EntityProperty } from './entity-properties';
import type { CSSProperties } from 'react';
import { propertyCurveIndexCount } from './entity-curve-properties';
import './properties.css';

export function PropertiesPalette({
  entities: allEntities,
  state,
  korean,
  quick,
  close,
  apply,
  execute,
  pickAdd,
  togglePickAdd,
  position,
  currentProperties,
  plotStyleAvailable = true,
}: {
  entities: readonly CadEntity[];
  state: LegacyCadState;
  korean: boolean;
  quick?: boolean;
  close: () => void;
  apply: (key: string, value: string, ids?: readonly string[]) => void;
  execute?: (command: string) => void;
  pickAdd?: number;
  togglePickAdd?: () => void;
  position?: CSSProperties;
  currentProperties?: EntityProperty[];
  plotStyleAvailable?: boolean;
}) {
  const [typeFilter, setTypeFilter] = useState('');
  const [geometryIndex, setGeometryIndex] = useState(0);
  const types = [...new Set(allEntities.map((entity) => entity.sourceType ?? entity.type))];
  const effectiveType = types.includes(typeFilter) ? typeFilter : '';
  const entities = useMemo(
    () =>
      effectiveType
        ? allEntities.filter((entity) => (entity.sourceType ?? entity.type) === effectiveType)
        : allEntities,
    [allEntities, effectiveType],
  );
  const indexCount = entities.length
    ? entities.reduce((count, entity) => Math.min(count, propertyCurveIndexCount(entity)), Infinity)
    : 0;
  const currentIndex = Math.max(0, Math.min(geometryIndex, indexCount - 1));
  const properties = entities.length
    ? entityProperties(entities, currentIndex)
    : (currentProperties ?? []);
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
      apply(
        key,
        values[key]!,
        entities.map((entity) => entity.id),
      );
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
      style={position}
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
      {!quick && (
        <div className="properties-selection-tools">
          <select
            aria-label={korean ? '객체 유형 필터' : 'Object type filter'}
            value={effectiveType}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option value="">
              {korean ? '전체' : 'All'} ({allEntities.length})
            </option>
            {types.map((type) => (
              <option key={type} value={type}>
                {propertyTypeLabel(type, korean)} (
                {allEntities.filter((entity) => (entity.sourceType ?? entity.type) === type).length}
                )
              </option>
            ))}
          </select>
          <button
            title={korean ? '빠른 선택' : 'Quick Select'}
            aria-label={korean ? '빠른 선택' : 'Quick Select'}
            onClick={() => execute?.('QSELECT')}
          >
            ⌕
          </button>
          <button
            title="PICKADD"
            aria-label="PICKADD"
            aria-pressed={pickAdd !== 0}
            onClick={togglePickAdd}
          >
            +
          </button>
          <button
            title={korean ? '객체 선택' : 'Select Objects'}
            aria-label={korean ? '객체 선택' : 'Select Objects'}
            onClick={() => execute?.('SELECT')}
          >
            □
          </button>
        </div>
      )}
      <p>
        {entities.length
          ? korean
            ? `${entities.length}개 객체 선택됨`
            : `${entities.length} objects selected`
          : korean
            ? '선택한 객체가 없습니다.'
            : 'No selection'}
      </p>
      {indexCount > 0 && (
        <label className="properties-selection-tools">
          <span>{korean ? '현재 정점' : 'Current Vertex'}</span>
          <input
            type="number"
            aria-label={korean ? '현재 정점' : 'Current Vertex'}
            min={1}
            max={indexCount}
            value={currentIndex + 1}
            onChange={(event) =>
              setGeometryIndex(
                Math.max(0, Math.min(indexCount - 1, Math.round(Number(event.target.value)) - 1)),
              )
            }
          />
          <span>/ {indexCount}</span>
        </label>
      )}
      {locked && (
        <p className="properties-error">
          {korean ? '잠긴 도면층의 객체입니다.' : 'Objects are on locked layers.'}
        </p>
      )}
      <div className="properties-fields">
        {(['general', 'visualization', 'geometry', 'other'] as const).map((category) => {
          const fields = properties.filter((property) => property.category === category);
          if (!fields.length) return null;
          return (
            <details key={category} open>
              <summary>
                {
                  {
                    general: korean ? '일반' : 'General',
                    visualization: korean ? '3D 시각화' : '3D Visualization',
                    geometry: korean ? '형상' : 'Geometry',
                    other: korean ? '기타' : 'Misc',
                  }[category]
                }
              </summary>
              {fields
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
                    property.key === 'type' && text !== '*VARIES*'
                      ? propertyTypeLabel(text, korean)
                      : text;
                  const disabled =
                    locked ||
                    property.readOnly ||
                    (property.key === 'plotStyle' && !plotStyleAvailable);
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
                              apply(
                                property.key,
                                event.target.value,
                                entities.map((entity) => entity.id),
                              );
                              setError('');
                            } catch {
                              setError(
                                korean ? '도면층을 변경할 수 없습니다.' : 'Cannot change layer.',
                              );
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
                              apply(
                                property.key,
                                event.target.value,
                                entities.map((entity) => entity.id),
                              );
                              setError('');
                            } catch {
                              setError(
                                korean ? '특성을 변경할 수 없습니다.' : 'Cannot change property.',
                              );
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
                              ...propertyLineweights.filter(
                                (weight) => weight !== -1 && weight !== -2,
                              ),
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
                              apply(
                                property.key,
                                event.target.value,
                                entities.map((entity) => entity.id),
                              );
                              setError('');
                            } catch {
                              setError(
                                korean ? '특성을 변경할 수 없습니다.' : 'Cannot change property.',
                              );
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
                            setValues((previous) => ({
                              ...previous,
                              [property.key]: event.target.value,
                            }))
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
            </details>
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
