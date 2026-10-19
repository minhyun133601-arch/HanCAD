import type { DrawingSession } from './drawing-session';

/** Session-only isolation ends when the drawing is reopened, while Undo keeps it. */
export function endTemporaryObjectIsolation(drawing: DrawingSession): DrawingSession {
  if (!drawing.state.objectIsolation || drawing.state.objectIsolation.persistent) return drawing;
  const state = { ...drawing.state };
  delete state.objectIsolation;
  return { ...drawing, state };
}
