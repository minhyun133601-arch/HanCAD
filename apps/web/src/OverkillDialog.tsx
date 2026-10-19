import { useEffect, useRef, useState } from 'react';
import { overkillDialogDefaults } from '@hancad/draft';
import type { OverkillDialogValues } from '@hancad/draft';

const properties = [
  ['COLOR', '색상', 'Color'],
  ['LAYER', '도면층', 'Layer'],
  ['LTYPE', '선종류', 'Linetype'],
  ['LTSCALE', '선종류 축척', 'Linetype scale'],
  ['LWEIGHT', '선가중치', 'Lineweight'],
  ['THICKNESS', '두께', 'Thickness'],
  ['TRANSPARENCY', '투명도', 'Transparency'],
  ['PLOTSTYLE', '플롯 스타일', 'Plot style'],
  ['MATERIAL', '재료', 'Material'],
] as const;
export function OverkillDialog({
  korean,
  submit,
  cancel,
}: {
  korean: boolean;
  submit: (text: string) => void;
  cancel: () => void;
}) {
  const [values, setValues] = useState(overkillDialogDefaults);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const [tolerance, setTolerance] = useState('0.000001');
  const valid =
    tolerance.trim() !== '' && Number.isFinite(Number(tolerance)) && Number(tolerance) >= 0;
  function toggle(key: keyof Omit<OverkillDialogValues, 'ignore' | 'tolerance'>): void {
    setValues((state) => ({ ...state, [key]: !state[key] }));
  }
  return (
    <dialog
      className="overkill-dialog"
      ref={dialog}
      aria-label={korean ? '중복 객체 삭제' : 'Delete Duplicate Objects'}
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) submit(JSON.stringify({ ...values, tolerance: Number(tolerance) }));
        }}
      >
        <h2>{korean ? '중복 객체 삭제' : 'Delete Duplicate Objects'}</h2>
        <fieldset>
          <legend>{korean ? '객체 비교 설정' : 'Object Comparison Settings'}</legend>
          <label>
            {korean ? '공차' : 'Tolerance'}
            <input
              autoFocus
              type="text"
              value={tolerance}
              onChange={(event) => setTolerance(event.target.value)}
            />
          </label>
          <p>{korean ? '무시할 객체 특성' : 'Ignore Object Property'}</p>
          <div className="overkill-properties">
            {properties.map(([key, ko, en]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={values.ignore.includes(key)}
                  onChange={() =>
                    setValues((state) => ({
                      ...state,
                      ignore: state.ignore.includes(key)
                        ? state.ignore.filter((item) => item !== key)
                        : [...state.ignore, key],
                    }))
                  }
                />
                {korean ? ko : en}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>{korean ? '옵션' : 'Options'}</legend>
          {(
            [
              [
                'optimizePolylines',
                '폴리선 내 세그먼트 최적화',
                'Optimize Segments Within Polylines',
              ],
              ['ignoreWidths', '폴리선 세그먼트 폭 무시', 'Ignore Polyline Segment Width'],
              ['keepPolylines', '폴리선 끊지 않음', 'Do Not Break Polylines'],
              [
                'partialOverlap',
                '부분적으로 겹치는 동일 선상 객체 결합',
                'Combine Collinear Objects That Partially Overlap',
              ],
              [
                'endToEnd',
                '끝과 끝이 정렬된 동일 선상 객체 결합',
                'Combine Collinear Objects When Aligned End to End',
              ],
              ['maintainAssociativity', '연관 객체 유지', 'Maintain Associative Objects'],
            ] as const
          ).map(([key, ko, en]) => (
            <label className="overkill-option" key={key}>
              <input
                type="checkbox"
                checked={values[key]}
                disabled={
                  (key === 'ignoreWidths' || key === 'keepPolylines') && !values.optimizePolylines
                }
                onChange={() => toggle(key)}
              />
              {korean ? ko : en}
            </label>
          ))}
        </fieldset>
        <div className="dialog-actions">
          <button type="submit" disabled={!valid}>
            {korean ? '확인' : 'OK'}
          </button>
          <button type="button" onClick={cancel}>
            {korean ? '취소' : 'Cancel'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
