/** Lineweights are stored in hundredths of a millimeter (DXF group 370). */
export const LINEWEIGHT_BYLAYER = -1;
export const LINEWEIGHT_BYBLOCK = -2;
export const LINEWEIGHT_DEFAULT = -3;

export const STANDARD_LINEWEIGHTS: readonly number[] = Object.freeze([
  0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200,
  211,
]);

export function isLineweightValue(value: number): boolean {
  return (
    value === LINEWEIGHT_BYLAYER ||
    value === LINEWEIGHT_BYBLOCK ||
    value === LINEWEIGHT_DEFAULT ||
    STANDARD_LINEWEIGHTS.includes(value)
  );
}

/**
 * Resolves an entity lineweight to hundredths of a millimeter. A top-level
 * ByBlock entity and the Default value use LWDEFAULT; a layer set to Default
 * also uses LWDEFAULT.
 */
export function resolveLineweight(
  entity: number,
  layer: number,
  lwdefault: number,
  block: number = LINEWEIGHT_DEFAULT,
): number {
  let value = entity;
  if (value === LINEWEIGHT_BYLAYER) value = layer;
  else if (value === LINEWEIGHT_BYBLOCK) value = block;
  if (value === LINEWEIGHT_BYLAYER || value === LINEWEIGHT_BYBLOCK) value = LINEWEIGHT_DEFAULT;
  if (value === LINEWEIGHT_DEFAULT) value = lwdefault;
  return Number.isFinite(value) && value >= 0 ? value : 25;
}

/**
 * Model-space display width in device-independent pixels. With LWDISPLAY off
 * every object is one pixel. Lineweights of 0.25 mm and below display one
 * pixel wide; heavier values use one more pixel for every started 0.25 mm,
 * multiplied by the Lineweight Settings display scale (1 by default).
 * The exact Autodesk mapping is not published; see PARITY_CHECKLIST.md.
 */
export function lineweightPixels(hundredths: number, display: boolean, displayScale = 1): number {
  if (!display || !(hundredths > 0)) return 1;
  const pixels = Math.ceil(hundredths / 25 - 1e-9) * Math.max(0.1, displayScale);
  return Math.max(1, Math.round(pixels));
}

/** Text for the status bar and dialogs: LWUNITS 1 = millimeters, 0 = inches. */
export function formatLineweight(hundredths: number, lwunits: number): string {
  if (hundredths === LINEWEIGHT_BYLAYER) return 'ByLayer';
  if (hundredths === LINEWEIGHT_BYBLOCK) return 'ByBlock';
  if (hundredths === LINEWEIGHT_DEFAULT) return 'Default';
  if (lwunits === 0) return `${(hundredths / 2540).toFixed(3)}"`;
  return `${(hundredths / 100).toFixed(2)} mm`;
}
