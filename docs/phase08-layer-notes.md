# Phase 08 layer implementation notes

## Implemented behavior

`apps/web/src/layers/` owns the modeless Layer Properties Manager, layer CLI,
filters, saved states, LAS interchange and selection-based layer tools. The
manager has the requested twelve Korean/English columns, column sorting, search,
new/delete/current actions, F2 renaming, property and group filters and inversion.
LAYER, LAYERCLOSE, LAYERSTATE, LAYERSTATESAVE and LAYWALK share that panel.

`LayerController` owns LAYISO/LAYUNISO, LAYOFF/LAYON, LAYFRZ/LAYTHW,
LAYLCK/LAYULK, LAYMCUR/LAYMCH/LAYCUR, LAYMRG/LAYDEL, COPYTOLAYER,
SETBYLAYER and LAYERP. LAYISO defaults to Lock and Fade, with an Off setting;
LAYUNISO restores the exact captured layer properties. LAYWALK supplies a
temporary display state that disappears when the palette closes. LAYERPMODE
controls layer-previous recording separately from the command Undo journal.

Layer records and the transitional drawing snapshot commit in the same native
database transaction. Native handles survive renaming. Renames also patch native
entity layer references, including entities owned by block definitions. Native
DXF groups are edited without replacing vendor groups, XDATA, ownership,
reactors or extension dictionaries. Percent transparency converts to/from group
440 alpha encoding; choosing ACI after True Color removes the RGB override.
Native-only layers are merged into the manager without deleting unrepresented
native layers during unrelated drawing commits.

Saved states, filters, isolation snapshots and layer-previous state live in the
reserved `HANCAD_LAYER_METADATA` drawing variable. LAS uses a DXF-style text pair
stream with LAYERSTATEDICTIONARY/LAYERSTATE headers, layer names, state flags,
ACI/True Color, lineweight, linetype and encoded transparency. UTF-8 and CP949
input pass through the shared support-file decoder; export writes UTF-8.

## Official reference evidence

- [-LAYER, Korean 2026 reference](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-2C75A883-10CA-4B6C-96AC-BCD7A7794614.htm):
  Make defaults to color 7, Continuous and Default lineweight; Set cannot make a
  frozen layer current; Color turns layers on unless a negative index is given;
  transparency is 0–90; state operations and new-layer reconciliation are listed.
- [LAYISO](https://help.autodesk.com/cloudhelp/2025/ENG/AutoCAD-Core/files/GUID-E24B9866-9538-43BF-A3DF-AA7E2341C624.htm):
  Off and Lock/Fade methods and restoration by LAYUNISO.
- [LAYERP](https://help.autodesk.com/cloudhelp/2025/ENG/AutoCAD-Core/files/GUID-F266407A-0894-4930-9544-8D4087FD66B9.htm):
  previous restores property settings while retaining added/deleted layers and
  current names of renamed layers.
- [LAYULK](https://help.autodesk.com/cloudhelp/2025/ENG/AutoCAD-Core/files/GUID-6B23C58C-F9D1-4926-A691-0447EC506E1F.htm):
  unlocks the layer of a selected object, rather than all drawing layers.
- [SETBYLAYERMODE](https://help.autodesk.com/cloudhelp/2025/ENG/AutoCAD-Core/files/GUID-7A27C789-A03B-4EBE-869D-2E429CF928C1.htm):
  property mask bits 1/2/4/8/16/128 and the ByBlock/include-block settings.
- [COPYTOLAYER](https://help.autodesk.com/cloudhelp/2019/ENU/AutoCAD-Core/files/GUID-0A1C99AD-53BE-4272-AD32-DAFECAECD6F7.htm):
  copies selected objects onto a destination layer and permits displacement.
- [LAYERSTATESAVE](https://help.autodesk.com/cloudhelp/2025/ENG/AutoCAD-Core/files/GUID-CA2A1FF0-0BF9-4D47-B268-23261B289035.htm):
  official canonical command for saving a new named layer state.
- [Layer Settings, 2026](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-DEB2A4C9-8C16-4EC9-8392-1BF8ED2A383A.htm):
  LAYEREVAL, LAYEREVALCTL and LAYERNOTIFY control evaluation/notifications.
- [Layer DXF, 2026](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-D94802B0-8BE8-4AC9-8054-17197688AFDB.htm):
  flags, signed color, linetype, plot and lineweight fields.

## Explicit assumptions and reference boundaries

The official command help documents behavior rather than every literal Korean
prompt. Option order and keyword letters follow the documented English command;
Korean wording still needs comparison in installed Korean AutoCAD. The material,
plot-style and Xref options retain the model boundary of their owning later
phases. Xref-reset reports that an attached reference is required; Color Books
remain the explicitly requested placeholder.

LAS serialization is an original implementation. Autodesk's public command
documentation confirms LAS import/export, but does not publish the full LAS
serialization contract. Flags used here are inferred as off/frozen/locked/plot/
new-viewport bits 1/2/4/8/16, and should be verified against a personally exported
AutoCAD LAS fixture before claiming external LAS parity. Internal round trips
are covered; arbitrary vendor LAS extensions are currently not represented.

The CLI previews accepted settings while collecting answers, then commits one
validated result on Enter or Escape. Accepted changes survive Escape as one Undo
group. Transparent invocation uses the session's nested prompt and the same pure
parser, while queued headless execution replays all supplied inputs atomically.
COPYTOLAYER supports base/second-point mouse acquisition, displacement mode,
relative/polar/direct-distance input and preview through the shared point parser.
Saved-state restoration exposes selective property masks. Viewport override
restoration remains part of the explicitly deferred Phase 14 viewport columns.

## Verification

Focused layer tests cover independent On/Freeze flags, current-layer restrictions,
0/Defpoints protection, exact isolation restoration, native/legacy atomic Undo,
all primary tool families, CLI invalid-input retention, IME text prompts,
property/group filters, LAS round trips, native transparency/ACI/True Color,
native rename references, opaque groups and XDATA retention.

Run:

```text
pnpm exec vitest run apps/web/src/layers
pnpm exec playwright test apps/web/tests/phase08-layers.spec.ts --workers=1 --output=test-artifacts/phase08-layers-e2e
```

Phase-level acceptance and final native-browser verification are recorded in
PROGRESS.md by the integrating agent; this note does not claim unrun checks.

The headless adapter replays queued entity IDs/ALL selection, existing PICKFIRST
selection, keywords, WCS point tuples and typed point expressions through the same
controller and point parser. It uses an isolated drawing/profile while collecting
inputs, then publishes one native/legacy command. Missing inputs, Escape, invalid
IDs and trailing inputs publish no drawing or profile mutations.

Final focused results before the architecture audit: 20 unit tests in three files pass. ESLint and the
Prettier check pass for the layer module and browser test. Four browser scenarios
pass in the expanded five-case run, covering progressive-CLI Escape, Korean
CLI/Undo, ribbon freeze/exact isolation restoration, modeless F2/filter editing
and Korean LAS interchange. The remaining combined transparent-LINE/COPYTOLAYER
case passes in its affected rerun (14.7 seconds), including mouse base points,
relative second points, correct destination layer and exact one-step Undo.
The two notification browser cases also pass after the alert received an
explicit clickable position above the viewport overlay. Outputs are under
`test-artifacts/phase08-layers-e2e`, `phase08-layers-e2e-copy` and
`phase08-layer-notifications-final`. These are development-browser checks;
the comprehensive phase gate remains the integrating agent's responsibility.
The final architecture audit adds twelve HeadlessCommandRunner scenarios; all
32 layer unit tests in four files pass, including one-command Undo and rejected
partial-input rollback. Strict TypeScript and layer ESLint pass after the adapter.
