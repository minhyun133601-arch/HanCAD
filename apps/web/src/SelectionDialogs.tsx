import { useEffect, useRef, useState } from 'react';
import type {
  CadFilterCondition,
  CadFilterExpression,
  CadFilterProperty,
  CadNamedFilter,
} from '@hancad/legacy-bridge';
import './selection-dialogs.css';
import { validateCadFilterExpression } from '@hancad/draft';

export type SelectionDialogKind = 'qselect' | 'filter' | 'similar';
interface Props {
  kind: SelectionDialogKind | null;
  korean: boolean;
  similarMode: number;
  filters: readonly CadNamedFilter[];
  hasSelection: boolean;
  close: () => void;
  apply: (
    expression: CadFilterExpression,
    options: { current: boolean; exclude: boolean; append: boolean },
  ) => void;
  setSimilarMode: (mode: number) => void;
  saveFilter: (name: string, expression: CadFilterExpression | null) => void;
}
const properties: [CadFilterProperty, string, string][] = [
  ['type', '객체 유형', 'Object type'],
  ['layer', '도면층', 'Layer'],
  ['color', '색상', 'Color'],
  ['linetype', '선종류', 'Linetype'],
  ['linetypeScale', '선종류 축척', 'Linetype scale'],
  ['lineweight', '선가중치', 'Lineweight'],
  ['transparency', '투명도', 'Transparency'],
  ['radius', '반지름', 'Radius'],
  ['length', '길이', 'Length'],
  ['text', '문자', 'Text'],
  ['name', '이름', 'Name'],
];
const similarFields = [
  [1, '색상', 'Color'],
  [2, '도면층', 'Layer'],
  [4, '선종류', 'Linetype'],
  [8, '선종류 축척', 'Linetype scale'],
  [16, '선가중치', 'Lineweight'],
  [32, '플롯 스타일', 'Plot style'],
  [64, '객체 스타일', 'Object style'],
  [128, '이름', 'Name'],
] as const;
export function SelectionDialogs(props: Props) {
  const { kind, korean: ko } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const [property, setProperty] = useState<CadFilterProperty>('layer');
  const [operator, setOperator] = useState<CadFilterCondition['operator']>('=');
  const [value, setValue] = useState('0');
  const [objectType, setObjectType] = useState('*');
  const [current, setCurrent] = useState(false);
  const [exclude, setExclude] = useState(false);
  const [append, setAppend] = useState(false);
  const [mode, setMode] = useState(props.similarMode);
  const [name, setName] = useState('');
  const [join, setJoin] = useState<'and' | 'or' | 'not' | 'xor'>('and');
  const [terms, setTerms] = useState<CadFilterExpression[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (kind) {
      setMode(props.similarMode);
      setCurrent(props.hasSelection);
      setError('');
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [kind]);
  const label = (k: string, e: string) => (ko ? k : e);
  function attempt(action: () => void): void {
    try {
      setError('');
      action();
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : '';
      setError(
        code === 'filterName'
          ? label(
              '필터 이름은 1자에서 18자까지 입력하십시오.',
              'Filter names must contain 1 to 18 characters.',
            )
          : code === 'filterExpression'
            ? label(
                '논리 연산자의 피연산자 수를 확인하십시오(AND/OR: 1개 이상, XOR: 2개, NOT: 1개).',
                'Check logical operands (AND/OR: one or more, XOR: exactly two, NOT: exactly one).',
              )
            : label(
                '선택 필터를 저장하거나 적용할 수 없습니다.',
                'Unable to save or apply the selection filter.',
              ),
      );
    }
  }
  function expressionLabel(term: CadFilterExpression): string {
    if ('children' in term)
      return `(${term.children.map(expressionLabel).join(` ${term.operator.toUpperCase()} `)})`;
    const item = properties.find(([key]) => key === term.property);
    return `${item ? label(item[1], item[2]) : term.property} ${term.operator === 'wildcard' ? '*' : term.operator} ${term.value}`;
  }
  const condition = (): CadFilterCondition => ({ property, operator, value });
  const expression = (): CadFilterExpression => ({
    operator: join,
    children: terms.length ? terms : [condition()],
  });
  return (
    <dialog
      ref={dialog}
      className="selection-dialog"
      aria-labelledby="selection-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        props.close();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          attempt(() => {
            if (kind === 'similar') props.setSimilarMode(mode);
            else {
              if (kind === 'filter') validateCadFilterExpression(expression());
              props.apply(
                kind === 'filter'
                  ? expression()
                  : {
                      operator: 'and',
                      children: [
                        ...(objectType === '*'
                          ? []
                          : [
                              {
                                property: 'type',
                                operator: '=',
                                value: objectType,
                              } as CadFilterCondition,
                            ]),
                        condition(),
                      ],
                    },
                { current, exclude, append },
              );
            }
            props.close();
          });
        }}
      >
        <h2 id="selection-dialog-title">
          {kind === 'similar'
            ? label('유사 선택 설정', 'Select Similar Settings')
            : kind === 'filter'
              ? label('객체 선택 필터', 'Object Selection Filters')
              : label('신속 선택', 'Quick Select')}
        </h2>
        {kind === 'similar' ? (
          <fieldset>
            <legend>{label('일치할 특성', 'Properties to match')}</legend>
            {similarFields.map(([bit, k, e]) => (
              <label key={bit}>
                <input
                  type="checkbox"
                  checked={(mode & bit) !== 0}
                  onChange={(event) => setMode(event.target.checked ? mode | bit : mode & ~bit)}
                />
                {label(k, e)}
              </label>
            ))}
          </fieldset>
        ) : (
          <>
            {kind === 'qselect' && (
              <label>
                {label('적용 위치', 'Apply to')}
                <select
                  aria-label={label('적용 위치', 'Apply to')}
                  value={String(current)}
                  onChange={(event) => setCurrent(event.target.value === 'true')}
                >
                  <option value="false">{label('전체 도면', 'Entire drawing')}</option>
                  <option value="true" disabled={!props.hasSelection}>
                    {label('현재 선택', 'Current selection')}
                  </option>
                </select>
              </label>
            )}
            {kind === 'qselect' && (
              <label>
                {label('객체 유형', 'Object type')}
                <select
                  aria-label={label('객체 유형', 'Object type')}
                  value={objectType}
                  onChange={(event) => setObjectType(event.target.value)}
                >
                  {['*', 'line', 'polyline', 'circle', 'arc', 'text', 'dimension', 'insert'].map(
                    (type) => (
                      <option key={type} value={type}>
                        {type === '*'
                          ? label('다중', 'Multiple')
                          : type === 'insert'
                            ? label('블록 참조', 'Block Reference')
                            : type.toUpperCase()}
                      </option>
                    ),
                  )}
                </select>
              </label>
            )}
            <label>
              {label('특성', 'Property')}
              <select
                aria-label={label('특성', 'Property')}
                value={property}
                onChange={(event) => setProperty(event.target.value as CadFilterProperty)}
              >
                {properties.map(([key, k, e]) => (
                  <option key={key} value={key}>
                    {label(k, e)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {label('연산자', 'Operator')}
              <select
                aria-label={label('연산자', 'Operator')}
                value={operator}
                onChange={(event) =>
                  setOperator(event.target.value as CadFilterCondition['operator'])
                }
              >
                {['=', '!=', '>', '>=', '<', '<=', 'wildcard'].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              {label('값', 'Value')}
              <input
                aria-label={label('값', 'Value')}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </label>
            {kind === 'filter' && (
              <fieldset>
                <legend>{label('필터 목록', 'Filter list')}</legend>
                <label>
                  {label('논리 연산자', 'Logical operator')}
                  <select
                    aria-label={label('논리 연산자', 'Logical operator')}
                    value={join}
                    onChange={(event) => setJoin(event.target.value as typeof join)}
                  >
                    {['and', 'or', 'not', 'xor'].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <div className="selection-filter-actions">
                  <button type="button" onClick={() => setTerms([...terms, condition()])}>
                    {label('리스트에 추가', 'Add to List')}
                  </button>
                  <button type="button" onClick={() => setTerms([])}>
                    {label('리스트 지우기', 'Clear List')}
                  </button>
                  <button
                    type="button"
                    disabled={!terms.length}
                    onClick={() =>
                      attempt(() => {
                        const grouped: CadFilterExpression = { operator: join, children: terms };
                        validateCadFilterExpression(grouped);
                        setTerms([grouped]);
                      })
                    }
                  >
                    {label('논리 그룹 작성', 'Group Conditions')}
                  </button>
                </div>
                <ol>
                  {terms.map((term, index) => (
                    <li key={index}>
                      <span>{expressionLabel(term)}</span>
                      <button
                        type="button"
                        onClick={() => setTerms(terms.filter((_, i) => i !== index))}
                      >
                        {label('삭제', 'Delete')}
                      </button>
                    </li>
                  ))}
                </ol>
                <label>
                  {label('저장된 필터', 'Named filters')}
                  <select
                    aria-label={label('저장된 필터', 'Named filters')}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      const saved = props.filters.find(
                        (filter) => filter.name === event.target.value,
                      );
                      if (saved && 'children' in saved.expression) {
                        setJoin(saved.expression.operator);
                        setTerms(saved.expression.children);
                      } else if (saved) setTerms([saved.expression]);
                    }}
                  >
                    <option value="">{label('선택', 'Select')}</option>
                    {props.filters.map((filter) => (
                      <option key={filter.name}>{filter.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {label('다른 이름으로 저장', 'Save As')}
                  <input
                    maxLength={18}
                    aria-label={label('다른 이름으로 저장', 'Save As')}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <div className="selection-filter-actions">
                  <button
                    type="button"
                    disabled={!name.trim()}
                    onClick={() =>
                      attempt(() => {
                        validateCadFilterExpression(expression());
                        props.saveFilter(name.trim(), expression());
                      })
                    }
                  >
                    {label('저장', 'Save')}
                  </button>
                  <button
                    type="button"
                    disabled={!name.trim()}
                    onClick={() => attempt(() => props.saveFilter(name.trim(), null))}
                  >
                    {label('삭제', 'Delete')}
                  </button>
                </div>
              </fieldset>
            )}
            {kind === 'qselect' && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={exclude}
                    onChange={(event) => setExclude(event.target.checked)}
                  />
                  {label('새 선택 세트에서 제외', 'Exclude from new selection set')}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={append}
                    onChange={(event) => setAppend(event.target.checked)}
                  />
                  {label('현재 선택 세트에 추가', 'Append to current selection set')}
                </label>
              </>
            )}
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="submit">
            {kind === 'filter' ? label('적용', 'Apply') : label('확인', 'OK')}
          </button>
          <button type="button" onClick={props.close}>
            {label('취소', 'Cancel')}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
