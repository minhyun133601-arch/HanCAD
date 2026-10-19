# Phase 07 modify export and display evidence

## Supported export fixes

MIRRTEXT results keep their `mirroredX` flag through drawing recovery, native TEXT group 71, SVG text transforms, Canvas raster drawing, display bounds/hit testing, and GPU glyph quads. Native TEXT generation flags 2 and 4 are represented by an equivalent rotation plus horizontal mirror without reporting a formatting approximation solely for those flags. External edits to group 71 invalidate the owned geometry signature, so an old extension record cannot restore the previous mirror.

CHPROP color edits now resolve ACI and TrueColor before the legacy RGB cache in SVG and raster export. ACI 7 follows the white export background; explicit TrueColor retains its RGB. ByLayer and ByBlock remain symbolic in native DXF. Common native fields include linetype (6), color index (62), entity linetype scale (48), lineweight (370), TrueColor (420), and transparency (440). Referenced built-in and stored simple linetype definitions are written to the LTYPE table. Numeric transparency uses the 8-bit alpha representation and imports back to the nearest supported integer percentage. A removed group 440 imports as ByLayer; explicit zero transparency remains explicit zero.

Thickness uses native group 39 for supported LINE, CIRCLE/ARC, TEXT, 2D polyline, POINT, SOLID, and TRACE records. Current native style edits override retained app metadata. Existing native geometry signature behavior remains covered by its original tests.

## Scope and assumptions

- SVG and Canvas export now consume the same ACI color, simple dash pattern, explicit entity scale, lineweight pixel mapping, and numeric opacity. The export lineweight mapping is the renderer's enabled lineweight mapping; physical plotting scale, CTB/STB, and plot transparency policy belong to the later plotting phase.
- When native ACI/TrueColor or lineweight fields are absent, the legacy adapter keeps its prior readable-on-white RGB fallback and 1–6 pixel pen bounds. Native fields use their own resolution: explicit TrueColor white remains white, ACI 7 becomes black on white, and a 2.11 mm native lineweight maps to 9 pixels without the legacy cap. The final full verification exposed this compatibility regression; the product fallback was repaired while preserving the original bounded-SVG assertions.
- The shared Canvas entry point defaults to display mode: legacy RGB and screen-pen values remain unchanged on the dark scene. SVG, PNG export, and clipboard PNG/DIB use explicit export context. Thus a white display label remains white while a legacy white export pen becomes black; native ACI 7 resolves against the chosen background. The final render-unit regression exposed the missing context distinction; it is now explicit in the style hook and Canvas options. Clipboard rendering also receives the drawing state instead of forcing its stale legacy RGB color.
- The top 2D view does not display Z extrusion from thickness. The supported native field and recovery value are retained. Unsupported thickness entity families do not acquire a false geometric extrusion.
- Native layer transparency XDATA, global LTSCALE/header sysvars, complex SHX linetypes, native hatch preservation, and general lossless/opaque DXF round trips remain in their planned file/plot phases. This work does not claim those capabilities. ByLayer transparency resolves against the current in-memory layer for SVG/Canvas; the entity's symbolic setting survives supported native round trips.
- Existing text font/justification limitations remain unchanged. Basic TEXT generation flags are now preserved independently of HanCAD extension metadata.

## Autodesk references

- [Common entity DXF groups](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-3610039E-27D1-4E23-B6D3-7E60B22BB5BD.htm): symbolic color, linetype, linetype scale, lineweight, TrueColor, and transparency fields.
- [TEXT DXF groups](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-62E5383D-8A14-47B4-BFC4-35824CAE8363.htm): thickness and generation flag 2 (backward) / 4 (upside down).
- [Adding 3D thickness to 2D objects](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-Core/files/GUID-65C72A8C-2B2E-4CCD-B596-5D14B3742035.htm): applicable object families and top-view limitations.

## Focused verification

On 2026-10-19, `modify-export.test.ts`, the existing `draw-export.test.ts`, and `glyph-atlas.test.ts` passed together: 3 files, 20 tests. These include actual MIRROR/CHPROP command results, metadata-stripped native import, SVG attributes, Canvas draw calls, JSON normalization/recovery, current native edits overriding metadata, and mirrored glyph geometry. Focused ESLint passed. Common final formatting, typechecking, product rebuild, and broader regressions are coordinated by the root Phase 07 agent.

The final SVG fallback repair was checked against those files plus the original `bridge.test.ts`: 4 files, 24 tests. The original Korean-text/survey-geometry/bounded-viewport test remains unchanged. A new regression distinguishes legacy readable bounded pens from explicit native TrueColor white and the maximum native lineweight. Focused ESLint and formatting checks passed.

After separating display/export context, all render package unit tests plus bridge/export and affected clipboard/export-state tests passed together: **30 files, 141 tests**. This includes the original unchanged `scene.test.ts`, the legacy bounded SVG regression, explicit native color/weight export cases, and three clipboard PNG/DIB color cases using actual draw calls. Strict TypeScript, focused ESLint, formatting, and runtime JavaScript syntax checks passed. No full verification was rerun by the component owner; the root agent coordinates the final common gate.

The root agent's subsequent complete run, recorded in `test-artifacts/phase07-verify-run4-20261019.log`, passed 1,181 unit tests, 32 compatibility tests, 28 renderer scenes, and 192 browser cases, with one personal-DWG fixture skip. The final native selection identity correction then passed all 1,184 unit tests and 43 affected production-browser cases.

The Windows release passed all 13 native modify scenarios and both existing native Clipboard/WIPEOUT scripts. These independently exercised two processes, actual Win32 PNG/DIB/Bitmap consumers, export color/weight behavior, and WIPEOUT display/output frame modes; RGB pixel mismatches were zero. Logs are `phase07-native-modify-20261019.log`, `phase07-native-clipboard-20261019.log`, and `phase07-native-wipeout-20261019.log` under `test-artifacts/`. CDP key/mouse dispatch does not certify physical IME or OS shortcut routing.
