import { useState } from 'react';
import type { SystemVariables } from '@hancad/sysvars';
import { StyleDialogFrame } from './StyleDialogFrame';

export function TransparencyDialog(props: {
  sysvars: SystemVariables;
  korean: boolean;
  close(): void;
  initial?: string;
  onApply?: (value: string) => void;
}) {
  const initial = props.initial?.toLowerCase();
  const [value, setValue] = useState(
    initial === 'bylayer'
      ? '-1'
      : initial === 'byblock'
        ? '-2'
        : (initial ?? String(props.sysvars.getNumber('CETRANSPARENCY'))),
  );
  const [display, setDisplay] = useState(props.sysvars.getNumber('TRANSPARENCYDISPLAY') !== 0);
  const [error, setError] = useState('');
  const label = (k: string, e: string) => (props.korean ? k : e);
  function apply(): void {
    const n = Number(value);
    if (!Number.isInteger(n) || !([-1, -2].includes(n) || (n >= 0 && n <= 90))) {
      setError(label('0에서 90 사이의 투명도를 입력하십시오.', 'Enter transparency from 0 to 90.'));
      return;
    }
    const database = props.sysvars.database,
      own = !database.undoGroupActive;
    if (own) database.beginUndoGroup();
    try {
      if (props.onApply) props.onApply(n === -1 ? 'bylayer' : n === -2 ? 'byblock' : String(n));
      else props.sysvars.set('CETRANSPARENCY', n);
      props.sysvars.set('TRANSPARENCYDISPLAY', display ? 1 : 0);
    } finally {
      if (own && database.undoGroupActive) database.endUndoGroup();
    }
    props.close();
  }
  return (
    <StyleDialogFrame
      title={label('투명도', 'Transparency')}
      korean={props.korean}
      close={props.close}
      apply={apply}
    >
      <label>
        {label('투명도', 'Transparency')}
        <select
          value={value === '-1' || value === '-2' ? value : 'explicit'}
          onChange={(e) => setValue(e.target.value === 'explicit' ? '0' : e.target.value)}
        >
          <option value="-1">ByLayer</option>
          <option value="-2">ByBlock</option>
          <option value="explicit">0–90</option>
        </select>
      </label>
      {value !== '-1' && value !== '-2' && (
        <input
          aria-label={label('투명도 값', 'Transparency value')}
          type="number"
          min="0"
          max="90"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      )}
      <label>
        <input type="checkbox" checked={display} onChange={(e) => setDisplay(e.target.checked)} />
        {label('투명도 표시', 'Display transparency')}
      </label>
      {error && <p role="alert">{error}</p>}
    </StyleDialogFrame>
  );
}
