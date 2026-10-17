export type SelectionGesture = 'area' | 'window' | 'crossing' | 'fence' | 'lasso';

export interface SelectionPolicy {
  clickWindow: boolean;
  dragWindow: boolean;
  lasso: boolean;
}

/** PICKAUTO bits are independent; PICKDRAG chooses click or held-button input. */
export function selectionPolicy(
  pickauto: number,
  pickdrag: number,
  overObject: boolean,
  commandActive: boolean,
): SelectionPolicy {
  const overWindow = overObject && !commandActive && Boolean(pickauto & 2);
  return {
    clickWindow: !overObject && Boolean(pickauto & 1) && pickdrag !== 1,
    dragWindow: pickdrag !== 0 && ((!overObject && Boolean(pickauto & 5)) || overWindow),
    lasso: !overObject && Boolean(pickauto & 4) && pickdrag !== 0,
  };
}
