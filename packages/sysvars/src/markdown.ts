import type { DxfHeaderVariableDefinition, SystemVariableDefinition } from './definition';

export function systemVariableMarkdown(
  variables: readonly SystemVariableDefinition[],
  headers: readonly DxfHeaderVariableDefinition[],
): string {
  const fixed = variables.filter((variable) => variable.default !== undefined).length;
  const headerLinks = headers.filter((header) => header.systemVariable !== null).length;
  const escape = (value: string) => value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const constraints = (variable: SystemVariableDefinition): string => {
    if (variable.bitmask !== undefined) return `Bit sums within mask ${variable.bitmask}`;
    if (variable.enum) return variable.enum.map((value) => JSON.stringify(value)).join(', ');
    if (variable.min !== undefined || variable.max !== undefined)
      return [
        variable.min === undefined ? '' : `${variable.exclusiveMin ? '>' : '>='} ${variable.min}`,
        variable.max === undefined ? '' : `${variable.exclusiveMax ? '<' : '<='} ${variable.max}`,
      ]
        .filter(Boolean)
        .join('; ');
    return variable.validationNote
      ? 'Type only (no documented rejecting range)'
      : 'Documented type';
  };
  const rows = variables.map(
    (variable) =>
      `| ${variable.name} | ${variable.type} | ${escape(variable.default === undefined ? 'Unavailable (document/environment)' : JSON.stringify(variable.default))} | ${variable.scope} | ${variable.readonly ? 'Yes' : 'No'} | ${escape(constraints(variable))} | ${escape(variable.description)} | [Autodesk](${variable.source.url}) |`,
  );
  const unavailable = variables
    .filter((variable) => variable.default === undefined)
    .map(
      (variable) =>
        `| ${variable.name} | ${escape(variable.source.initial)} | ${escape(variable.defaultUnavailable ?? '')} |`,
    );
  const bits = variables
    .filter((variable) => variable.bits)
    .flatMap((variable) =>
      Object.entries(variable.bits ?? {}).map(
        ([bit, meaning]) => `| ${variable.name} | ${bit} | ${escape(meaning)} |`,
      ),
    );
  const headerRows = headers.map(
    (header) =>
      `| $${header.name} | ${header.codes.join(', ')} | ${header.systemVariable ?? 'DXF record only; command identity not verified'} |`,
  );
  return [
    '# System variables',
    '',
    'Generated from `packages/sysvars/src/catalog/*.json` by `pnpm docs:sysvars`.',
    '',
    `The catalog contains ${variables.length} variables: ${fixed} documented fixed/metric defaults and ${variables.length - fixed} explicit environment/document-dependent initial values. The base metadata was checked against Autodesk AutoCAD 2026 Windows help on 2026-10-15; Phase 06/07 additions were checked on 2026-10-19.`,
    '',
    'Registry/User-settings map to profile scope; Not-saved maps to session scope. Switch/Bitcode/Enum values are stored as integers, and Single-character values use their character code. Registration validates and stores values; it does not implement the feature controlled by that variable. Numeric constraints marked pending remain a parity gap.',
    '',
    'HANDSEED and UNDOCTL come from the live database. Read-only runtime providers may supply document-specific values; unresolved initial values raise an explicit localized error until a valid stored/provider value is supplied. No environment-dependent value is replaced with an invented zero or path.',
    '',
    'Metric defaults include INSUNITS=4, MEASUREMENT=1, ISO-25, LIMITS 420,297 and SNAPUNIT/GRIDUNIT 10,10. FONTALT and FONTMAP contain reference names only; no Autodesk resource files are bundled. DIMSTYLE is read-only; ISAVEBAK is the canonical backup variable. INPUTSEARCHOPTIONS is a command and is not registered as a sysvar.',
    '',
    '| Name | Type | Default | Scope | Read-only | Allowed values/range | Korean description | Source |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## Environment/document-dependent initial values',
    '',
    '| Name | Documented initial value | Resolution |',
    '| --- | --- | --- |',
    ...unavailable,
    '',
    '## Bit meanings',
    '',
    '| Name | Bit | Meaning |',
    '| --- | --- | --- |',
    ...bits,
    '',
    '## DXF header schema coverage',
    '',
    `All ${headers.length} expanded header names from the [Autodesk 2026 HEADER table](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-A85E8E67-27CD-4C59-BE61-4DC9FADBE74A.htm) are represented. ${headerLinks} have a matching registered command-variable identity. The other ${headers.length - headerLinks} are retained as header metadata instead of inventing SETVAR names or defaults.`,
    '',
    '| Header name | Group codes | System variable |',
    '| --- | --- | --- |',
    ...headerRows,
    '',
  ].join('\n');
}
