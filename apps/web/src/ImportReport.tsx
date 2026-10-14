import type { CadImportReport } from '@hancad/legacy-bridge';
import type { Messages } from '@hancad/ui';

export function ImportReport({
  report,
  messages,
}: {
  report: CadImportReport | null;
  messages: Messages;
}) {
  if (!report) return null;
  return (
    <details className="drawing-import-report" data-testid="drawing-import-report" open>
      <summary>
        {messages.importReport}
        <span>{report.format}</span>
      </summary>
      <dl>
        <div>
          <dt>{messages.sourceObjects}</dt>
          <dd>{report.sourceEntities}</dd>
        </div>
        <div>
          <dt>{messages.importedObjects}</dt>
          <dd>{report.imported}</dd>
        </div>
        <div>
          <dt>{messages.skippedObjects}</dt>
          <dd>{report.skipped}</dd>
        </div>
        <div>
          <dt>{messages.approximatedObjects}</dt>
          <dd>{report.approximated}</dd>
        </div>
      </dl>
      {(report.skipped > 0 || report.approximated > 0) && <p>{messages.importCountNote}</p>}
      {report.unsupported.length > 0 && (
        <details>
          <summary>{messages.unsupportedObjects}</summary>
          <ul>
            {report.unsupported.map((item) => (
              <li key={item.type}>
                {item.type}: {item.count}
              </li>
            ))}
          </ul>
        </details>
      )}
      {report.warnings.length > 0 && (
        <details>
          <summary>{messages.warnings}</summary>
          <ul>
            {report.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      <p>{messages.exportNote}</p>
    </details>
  );
}
