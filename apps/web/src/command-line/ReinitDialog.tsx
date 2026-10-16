import { useEffect, useState } from 'react';
import type { AliasEditMessages } from '@hancad/ui';
import { ModalDialog } from './CommandDialogs';

/** REINIT: the Re-initialization dialog; only the PGP file applies in HanCAD. */
export function ReinitDialog({
  open,
  text,
  onReload,
  onClose,
}: {
  open: boolean;
  text: AliasEditMessages;
  onReload: () => void;
  onClose: () => void;
}) {
  const [pgp, setPgp] = useState(false);
  useEffect(() => {
    if (open) setPgp(false);
  }, [open]);
  return (
    <ModalDialog
      open={open}
      title={text.reinitTitle}
      className="reinit-dialog"
      onClose={onClose}
      footer={
        <>
          <button
            onClick={() => {
              onClose();
              if (pgp) onReload();
            }}
          >
            {text.ok}
          </button>
          <button onClick={onClose}>{text.cancel}</button>
        </>
      }
    >
      <fieldset>
        <legend>{text.ioPorts}</legend>
        <label className="disabled">
          <input type="checkbox" disabled />
          {text.digitizer}
        </label>
      </fieldset>
      <fieldset>
        <legend>{text.devicesAndFiles}</legend>
        <label className="disabled">
          <input type="checkbox" disabled />
          {text.digitizer}
        </label>
        <label>
          <input type="checkbox" checked={pgp} onChange={(event) => setPgp(event.target.checked)} />
          {text.pgpFile}
        </label>
      </fieldset>
    </ModalDialog>
  );
}
