import { useState } from 'react';
import { formatLineweight, STANDARD_LINEWEIGHTS, lineweightPixels } from '@hancad/render';
import type { SystemVariables } from '@hancad/sysvars';
import { StyleDialogFrame } from './StyleDialogFrame';
import { readLineweightDisplayScale, writeLineweightDisplayScale } from './lineweight-scale';

export function LineweightDialog(props: {
  sysvars: SystemVariables;
  korean: boolean;
  close(): void;
  initial?: string;
  onApply?: (value: string) => void;
}) {
  const ko = props.korean,
    label = (k: string, e: string) => (ko ? k : e);
  const [weight, setWeight] = useState(
    props.initial === undefined ? props.sysvars.getNumber('CELWEIGHT') : Number(props.initial),
  );
  const [units, setUnits] = useState(props.sysvars.getNumber('LWUNITS'));
  const [display, setDisplay] = useState(props.sysvars.getNumber('LWDISPLAY') === 1);
  const [defaultWeight, setDefaultWeight] = useState(props.sysvars.getNumber('LWDEFAULT'));
  const [scale, setScale] = useState(readLineweightDisplayScale);
  function apply(): void {
    const database = props.sysvars.database,
      own = !database.undoGroupActive;
    if (own) database.beginUndoGroup();
    try {
      if (props.onApply) props.onApply(String(weight));
      else props.sysvars.set('CELWEIGHT', weight);
      props.sysvars.set('LWDISPLAY', display ? 1 : 0);
      props.sysvars.set('LWUNITS', units);
      props.sysvars.set('LWDEFAULT', defaultWeight);
    } finally {
      if (own && database.undoGroupActive) database.endUndoGroup();
    }
    writeLineweightDisplayScale(scale);
    props.close();
  }
  return (
    <StyleDialogFrame
      title={label('선가중치 설정', 'Lineweight Settings')}
      korean={ko}
      close={props.close}
      apply={apply}
    >
      <label>
        {label('선가중치', 'Lineweights')}
        <select size={9} value={weight} onChange={(e) => setWeight(Number(e.target.value))}>
          {[-1, -2, -3, ...STANDARD_LINEWEIGHTS].map((n) => (
            <option key={n} value={n}>
              {formatLineweight(n, units)}
            </option>
          ))}
        </select>
      </label>
      <p>
        {label('현재 선가중치', 'Current lineweight')}: {formatLineweight(weight, units)}
      </p>
      <label>
        {label('리스트를 위한 단위', 'Units for Listing')}
        <select value={units} onChange={(e) => setUnits(Number(e.target.value))}>
          <option value={1}>{label('밀리미터(mm)', 'Millimeters (mm)')}</option>
          <option value={0}>{label('인치(in.)', 'Inches (in.)')}</option>
        </select>
      </label>
      <label>
        <input type="checkbox" checked={display} onChange={(e) => setDisplay(e.target.checked)} />
        {label('선가중치 표시', 'Display Lineweight')}
      </label>
      <label>
        {label('기본값', 'Default')}
        <select value={defaultWeight} onChange={(e) => setDefaultWeight(Number(e.target.value))}>
          {STANDARD_LINEWEIGHTS.map((n) => (
            <option value={n} key={n}>
              {formatLineweight(n, units)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {label('축척 조정', 'Adjust Display Scale')}
        <input
          type="range"
          min="0.1"
          max="3"
          step="0.1"
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
        />
      </label>
      <span
        className="style08-weight-preview"
        style={{
          borderTopWidth: lineweightPixels(weight < 0 ? defaultWeight : weight, true, scale),
        }}
      />
    </StyleDialogFrame>
  );
}
