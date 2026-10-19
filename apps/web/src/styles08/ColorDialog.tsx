import { useState } from 'react';
import { ACI_RGB, rgbToCss, rgbToHsl, hslToRgb } from '@hancad/render';
import { colorValueRgb, parseColorValue } from './color-values';
import { StyleDialogFrame } from './StyleDialogFrame';

export interface ColorDialogProps {
  initial: string;
  korean: boolean;
  apply(value: string): void;
  close(): void;
}
export function ColorDialog(props: ColorDialogProps) {
  const ko = props.korean,
    label = (k: string, e: string) => (ko ? k : e);
  const [tab, setTab] = useState<'index' | 'true' | 'books'>(
    props.initial.startsWith('RGB:') ? 'true' : 'index',
  );
  const [value, setValue] = useState(props.initial);
  const [rgb, setRgb] = useState(colorValueRgb(props.initial));
  const [model, setModel] = useState<'RGB' | 'HSL'>('RGB');
  const [error, setError] = useState('');
  function chooseRgb(next: number): void {
    setRgb(next);
    setValue(`RGB:${(next >> 16) & 255},${(next >> 8) & 255},${next & 255}`);
  }
  const hsl = rgbToHsl(rgb);
  const channels =
    model === 'RGB'
      ? [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255]
      : [hsl.hue, hsl.saturation, hsl.lightness].map(Math.round);
  function channel(index: number, raw: string): void {
    const next = channels.map((n, i) => (i === index ? Number(raw) : n));
    if (!next.every(Number.isFinite)) return;
    if (model === 'RGB' && !next.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) return;
    try {
      chooseRgb(
        model === 'RGB'
          ? (next[0]! << 16) | (next[1]! << 8) | next[2]!
          : hslToRgb(next[0]!, next[1]!, next[2]!),
      );
    } catch {
      setError(label('색상 값의 범위를 확인하십시오.', 'Check the color channel range.'));
    }
  }
  return (
    <StyleDialogFrame
      title={label('색상 선택', 'Select Color')}
      korean={ko}
      close={props.close}
      disabled={tab === 'books'}
      apply={() => {
        try {
          props.apply(parseColorValue(value));
        } catch {
          setError(label('유효한 색상 값을 입력하십시오.', 'Enter a valid color value.'));
        }
      }}
    >
      <div role="tablist" aria-label={label('색상 모델', 'Color model')}>
        {(['index', 'true', 'books'] as const).map((id, i) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === id}
            key={id}
            onClick={() => {
              setTab(id);
              setError('');
            }}
          >
            {
              [
                label('색인 색상', 'Index Color'),
                label('트루컬러', 'True Color'),
                label('색상표', 'Color Books'),
              ][i]
            }
          </button>
        ))}
      </div>
      {tab === 'index' && (
        <>
          <div className="style08-aci-grid" role="group" aria-label="ACI">
            {ACI_RGB.slice(1).map((color, i) => (
              <button
                type="button"
                key={i + 1}
                title={`ACI ${i + 1}`}
                aria-label={`ACI ${i + 1}`}
                aria-pressed={value === String(i + 1)}
                style={{ backgroundColor: rgbToCss(color) }}
                onClick={() => setValue(String(i + 1))}
              />
            ))}
          </div>
          <div className="style08-row">
            <button type="button" onClick={() => setValue('BYLAYER')}>
              ByLayer
            </button>
            <button type="button" onClick={() => setValue('BYBLOCK')}>
              ByBlock
            </button>
          </div>
        </>
      )}
      {tab === 'true' && (
        <>
          <label>
            {label('색상 모델', 'Color model')}
            <select value={model} onChange={(e) => setModel(e.target.value as 'RGB' | 'HSL')}>
              <option>RGB</option>
              <option>HSL</option>
            </select>
          </label>
          <input
            aria-label={label('트루컬러 선택', 'Choose true color')}
            type="color"
            value={rgbToCss(rgb)}
            onChange={(e) => chooseRgb(parseInt(e.target.value.slice(1), 16))}
          />
          {channels.map((n, i) => (
            <label key={i}>
              {(model === 'RGB' ? ['R', 'G', 'B'] : ['H', 'S', 'L'])[i]}
              <input
                type="number"
                min="0"
                max={model === 'RGB' ? 255 : i === 0 ? 360 : 100}
                value={n}
                onChange={(e) => channel(i, e.target.value)}
              />
            </label>
          ))}
        </>
      )}
      {tab === 'books' ? (
        <p>
          {label(
            '색상표 지원은 이후 단계에서 추가됩니다.',
            'Color Books support will be added in a later phase.',
          )}
        </p>
      ) : (
        <label>
          {label('색상', 'Color')}
          <input value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
      )}
      {error && <p role="alert">{error}</p>}
    </StyleDialogFrame>
  );
}
