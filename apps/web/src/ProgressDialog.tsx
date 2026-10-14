import { useEffect, useRef } from 'react';
import type { Messages } from '@hancad/ui';
import progress from '../../../docs/development-progress.json';

export function ProgressDialog({
  messages,
  open,
  onClose,
}: {
  messages: Messages;
  open: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open && dialog.current?.open) dialog.current?.close();
  }, [open]);
  const statuses: Record<string, string> = {
    'in-progress': messages.progressWorking,
    planned: messages.progressPlanned,
    complete: messages.progressComplete,
  };
  return (
    <dialog
      className="development-dialog"
      ref={dialog}
      aria-label={messages.developmentProgress}
      onClose={onClose}
    >
      <div className="development-dialog-header">
        <div>
          <h2>{messages.developmentProgress}</h2>
          <p>
            {messages.progressUpdated} {progress.updated}
          </p>
        </div>
        <button onClick={onClose}>{messages.close}</button>
      </div>
      <div className="development-dialog-content">
        <div className="development-summary">
          <span>
            {messages.progressTotal} <b>{progress.phases.length}</b>
          </span>
          {Object.entries(statuses).map(([status, label]) => (
            <span key={status}>
              {label} <b>{progress.phases.filter((phase) => phase.status === status).length}</b>
            </span>
          ))}
        </div>
        <h3>{messages.progressFeatures}</h3>
        <ul>
          {progress.currentApp.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
        <details>
          <summary>{messages.progressLimitations}</summary>
          <ul>
            {progress.currentApp.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </details>
        <h3>{messages.progressPhases}</h3>
        <p>{messages.progressNote}</p>
        <table>
          <thead>
            <tr>
              <th>{messages.progressPhase}</th>
              <th>{messages.progressItem}</th>
              <th>{messages.progressStatus}</th>
              <th>{messages.progressDetail}</th>
            </tr>
          </thead>
          <tbody>
            {progress.phases.map((phase) => (
              <tr key={phase.id}>
                <td>{String(phase.id).padStart(2, '0')}</td>
                <th scope="row">{phase.name}</th>
                <td>{statuses[phase.status]}</td>
                <td>{phase.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </dialog>
  );
}
