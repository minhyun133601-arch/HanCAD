import type { Messages } from '@hancad/ui';
import { ImportReport } from './ImportReport';
import type { useDrawingFiles } from './useDrawingFiles';

/** Hidden-layer, import-report and loading/restoring overlays of the drawing area. */
export function DrawingNotices({
  files,
  messages,
  execute,
}: {
  files: ReturnType<typeof useDrawingFiles>;
  messages: Messages;
  execute: (command: string) => void;
}) {
  return (
    <>
      {files.hiddenAll && (
        <div className="hidden-layers-notice">
          <p>{messages.hiddenLayersNote}</p>
          <button onClick={() => execute('LAYON')}>{messages.showAllLayers}</button>
        </div>
      )}
      <ImportReport report={files.report} messages={messages} />
      {files.reading && (
        <div className="drawing-loading" role="status">
          <p>{files.progress || messages.importing}</p>
          <button onClick={files.cancelImport}>{messages.cancelImport}</button>
        </div>
      )}
      {files.restoring && !files.reading && (
        <div className="drawing-loading" role="status">
          <p>{messages.restoringDrawing}</p>
          <button onClick={() => files.cancelRestore()}>{messages.cancelImport}</button>
        </div>
      )}
    </>
  );
}
