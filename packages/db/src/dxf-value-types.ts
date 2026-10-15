/** Numeric/string ranges from Autodesk's Group Code Value Types Reference (2026). */
export type DxfValueType =
  | 'string'
  | 'point-component'
  | 'real'
  | 'int16'
  | 'int32'
  | 'int64'
  | 'boolean'
  | 'binary'
  | 'handle'
  | 'unknown';
export const dxfValueTypeSource =
  'https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-2553CF98-44F6-4828-82DD-FE3BC7448113.htm';
export function dxfGroupValueType(code: number): DxfValueType {
  if (
    code === 105 ||
    (code >= 320 && code <= 369) ||
    (code >= 390 && code <= 399) ||
    (code >= 480 && code <= 481)
  )
    return 'handle';
  if ((code >= 310 && code <= 319) || code === 1004) return 'binary';
  if (code >= 290 && code <= 299) return 'boolean';
  if (code >= 160 && code <= 169) return 'int64';
  if (
    (code >= 60 && code <= 79) ||
    (code >= 170 && code <= 179) ||
    (code >= 270 && code <= 289) ||
    (code >= 370 && code <= 389) ||
    (code >= 400 && code <= 409) ||
    code === 1070
  )
    return 'int16';
  if (
    (code >= 90 && code <= 99) ||
    (code >= 420 && code <= 429) ||
    (code >= 440 && code <= 459) ||
    code === 1071
  )
    return 'int32';
  if ((code >= 10 && code <= 17) || (code >= 20 && code <= 27) || (code >= 30 && code <= 37))
    return 'point-component';
  if (
    (code >= 38 && code <= 59) ||
    (code >= 110 && code <= 149) ||
    (code >= 210 && code <= 239) ||
    (code >= 460 && code <= 469) ||
    (code >= 1010 && code <= 1013) ||
    (code >= 1020 && code <= 1023) ||
    (code >= 1030 && code <= 1033) ||
    (code >= 1040 && code <= 1042)
  )
    return 'real';
  if (
    (code >= 0 && code <= 9) ||
    (code >= 100 && code <= 102) ||
    (code >= 300 && code <= 309) ||
    (code >= 410 && code <= 419) ||
    (code >= 430 && code <= 439) ||
    (code >= 470 && code <= 479) ||
    code === 999 ||
    (code >= 1000 && code <= 1003) ||
    code === 1005
  )
    return 'string';
  return 'unknown';
}

/** Validate an explicit mapped edit; opaque imported values are preserved without coercion. */
export function assertDxfScalar(code: number, value: unknown): void {
  const kind = dxfGroupValueType(code);
  const valid =
    kind === 'string'
      ? typeof value === 'string'
      : kind === 'handle'
        ? typeof value === 'string' && /^[0-9a-f]+$/i.test(value)
        : kind === 'binary'
          ? typeof value === 'string' && /^(?:[0-9a-f]{2})*$/i.test(value)
          : kind === 'boolean'
            ? typeof value === 'boolean' || value === 0 || value === 1
            : kind === 'real' || kind === 'point-component'
              ? typeof value === 'number' && Number.isFinite(value)
              : kind === 'int16' || kind === 'int32'
                ? typeof value === 'number' && Number.isSafeInteger(value)
                : kind === 'int64'
                  ? typeof value === 'string' && /^-?\d+$/.test(value)
                  : true;
  if (!valid) throw new Error(`Invalid value for DXF group ${code} (${kind}).`);
}
