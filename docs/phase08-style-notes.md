# Phase 08 display property managers

Implemented by `apps/web/src/styles08` and the pure renderer style helpers.

## Behavior and integration

- `COLOR` opens a localized color dialog. Index Color exposes all 255 ACI
  colors plus ByLayer/ByBlock. True Color accepts RGB and HSL and stores the
  resulting RGB triplet in CECOLOR. Color Books is an explicit disabled placeholder.
  `-COLOR` accepts ACI names/numbers, ByLayer/ByBlock, and the Truecolor option.
- `LINETYPE` manages loaded native LTYPE records, current linetype, LTSCALE and
  CELTSCALE. Load/Reload selects definitions from HanCAD's original metric library
  or a local `.lin` file. The actual original resource is shipped as
  `apps/web/public/support/hancadiso.lin`; its source is `HANCAD_ISO_LIN`.
  No Autodesk resource file is bundled.
- LIN files decode UTF-8 with/without BOM or CP949. Text, shapes, source names,
  scale, offsets, upright/relative/absolute rotation and degree/radian/grad angles
  are retained in native fields. Complex glyph rendering remains owned by the
  later text/font phase. LTYPE reload retains the persistent handle, raw groups,
  extension dictionary, reactors and XDATA.
- `-LINETYPE` implements repeated List, Create, Load and Set actions. Create
  writes an original simple definition; known opened files append their original
  contents. The browser downloads the resulting LIN file. Desktop hosts can supply
  `readSupportFile` and `writeSupportFile` for local paths. A missing path is
  reported explicitly. Created linetypes require Load, matching the reference.
- `LWEIGHT` controls CELWEIGHT, LWUNITS, LWDISPLAY, LWDEFAULT and the profile
  display scale. The scale uses a local profile preference because Autodesk
  documents no corresponding system variable. The renderer is notified by
  `hancad-lineweight-scale-change`; it never changes geometry or plot weights.
- The transparency dialog edits CETRANSPARENCY (-1 ByLayer, -2 ByBlock, 0–90)
  and TRANSPARENCYDISPLAY. Drawing changes form one history operation;
  TRANSPARENCYDISPLAY remains a profile preference across Undo. Existing direct
  system-variable entry remains available. Ribbon dialog callbacks apply color,
  linetype, lineweight and transparency to selected objects when present.

## Nested block rules

`resolveInheritedStyle` walks insertion paths from the outermost reference to
the innermost. Layer 0 takes its parent reference's effective layer; a named
child layer retains its own layer. ByLayer takes the effective layer property,
and ByBlock takes the already resolved parent reference property. Top-level
ByBlock uses ACI 7, Continuous, LWDEFAULT and zero transparency. Explicit true
color stays literal; ACI 7 is resolved only after the display background is known.
Frozen/off ancestor layers keep descendants hidden even when a descendant is
on another visible named layer.

`databaseBlockDisplayEntities` applies those rules to native Phase 01
BLOCK_RECORD/BLOCK/INSERT graphs. It handles block base points, nested affine
transforms, mirrored/nonuniform scale, DXF degree-valued rotation and OCS
extrusion. Opaque INSERT records can supply their documented raw DXF groups.
The occurrence ID contains the full insertion path, and sourceId identifies
the top-level INSERT for selection. It reports cyclic/missing definitions,
unsupported children and block arrays rather than inventing display geometry.
Full block editing, attributes and arrays remain in their owning block phase.

## Reference evidence and assumptions

- [Autodesk -COLOR reference, Korean](https://help.autodesk.com/cloudhelp/2023/KOR/AutoCAD-Core/files/GUID-94630133-72B7-4EC7-859C-5798F1ADBB8C.htm):
  names/ACI range, ByLayer/ByBlock, Truecolor triplets and Color Books.
- [Autodesk -LINETYPE reference, 2026](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-LT/files/GUID-A6089331-227F-44F1-BA0C-06BC1568C3BB.htm):
  List/Create/Load/Set, simple-only command creation and explicit load afterward.
- [Autodesk Lineweight Settings, Korean, 2026](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-1BB43E62-DF93-494E-ACF2-55824ACD5130.htm):
  supported weights, current/default weight, units, display and model display scale.
- [Autodesk True Color tab, Korean](https://help.autodesk.com/cloudhelp/2022/KOR/AutoCAD-LT/files/GUID-2CFCB6B4-1CF8-4F8F-B382-6856907B19D9.htm):
  RGB/HSL model selection and 24-bit true color.
- [Autodesk graphics color reference, 2026](https://help.autodesk.com/cloudhelp/2026/ENU/OARX-ManagedRefGuide/files/OARX-ManagedRefGuide-Autodesk_AutoCAD_GraphicsInterface_NonEntityTraits_Color.html):
  ACI 0/256, top-level ByBlock falling back to color 7.
- [Autodesk INSERT DXF reference, 2026](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-28FA4CFB-9D5E-4880-9F11-36C97578252F.htm):
  raw block name, insertion point, scales, rotation, arrays and extrusion groups.

The existing model-space pixel approximation for lineweights is retained;
Autodesk does not publish its exact pixel quantization. Verify the display scale
and prompt punctuation against installed Korean AutoCAD. The existing direct
CECOLOR HSL string validator still differs; the new dialog normalizes HSL to
RGB before setting it, which preserves the color without requiring that syntax.

## Focused verification

2026-10-19: 25 tests in four focused files pass (existing style tests, new
Phase 08 style tests, native block display tests and style command tests).
Strict project TypeScript and lint scoped to the new/changed style files pass.
The tests cover nested property combinations, explicit true color/ACI 7,
frozen ancestors, native transforms/raw groups, occurrence identity/cycles,
complex Korean LIN recovery, CP949, command prefixes, one-command Undo/Redo,
protected linetypes, HSL conversion, retained reload metadata, the shipped
resource's exact match with its original source, the full standard/ISO name
set and explicit descriptor-limit rejection. Imported native definitions retain
all their elements even when they exceed the LIN parser's supported count;
the main renderer owns unsupported-pattern diagnostics.
Comprehensive phase verification remains the main agent's final gate.

Browser acceptance: `phase08-styles.spec.ts` passes all four cases in 1.2 minutes
against the running development app. It exercises ACI/RGB/HSL and Color Books,
an original Korean complex LIN through native HCD save/reopen/recovery,
lineweight GPU changes with exact Undo/Redo pixel counts, transparency profile
persistence and selected-object changes with exact Undo/Redo, and real native
nested blocks with parent freeze, exact visible-image restoration and reload.
Artifacts: `test-artifacts/phase08-styles-e2e` and
`test-artifacts/phase08-nested-styles.hcd`.
