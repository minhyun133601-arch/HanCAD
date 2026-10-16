# Decisions

## 2026-10-16: Phase 02 display geometry, GPU backend and reference QA

The renderer-neutral display model uses WCS Y up and double precision. Legacy
snapshots remain Y down at their public boundary; the source converts coordinates,
arc direction and text rotation once. Native supported geometry adapts through
`geometryFromFields`; unsupported/invalid records return diagnostics rather than
fabricated graphics. Native TEXT/MTEXT, block expansion and complete DIMENSION
production remain with later feature phases. Legacy dimensions supply their
existing annotation geometry. Their Canvas middle anchor becomes an alphabetic
baseline with a 0.35-em local offset; exact font cap-height/middle alignment still
requires the installed Windows reference.

Display tessellation targets 0.25 CSS pixels at a power-of-two LOD. Stable asin
arc steps avoid cancellation for very large radii. Visible-arc clipping limits
extreme segment counts; native splines subdivide from knot breakpoints with
quarter/midpoint error checks. Wide polylines retain bulges and tapered widths;
FILLMODE chooses fill/outline and PLINEGEN chooses dash-run continuity. The
8192-segment cap is a display bound, not an exact-geometry alteration. PDSIZE 0
means 5% of the last regenerated view height; negative values are percentages.
Text fallback bounds assume one em per CJK character and estimated Latin advances
until the full font provider owns measurement.

The production model canvas now requires WebGL2. Opaque geometry is retained in
spatial grid-cell chunks, with global entity slots carrying source draw rank.
Transparent entities replay individually in source order rather than sharing
primitive-type batches. This implementation uses fixed spatial cells instead of
the initially proposed STR chunk partition. CPU double origins
are subtracted before float32 upload; exceptionally broad geometry is clipped
around the visible region when float error would exceed tolerance. Thin strokes
use GL_LINES and heavier displayed lineweights use instanced screen-space quads.
Cumulative distances drive shader dash fitting. An R-tree indexes finite display
bounds and exact distances refine picking; existing object snaps still use their
separate candidate pipeline.

The implemented style representation is two RGBA32F texels per entity containing
resolved RGBA/lineweight/pattern/scale data, plus an R32F dash table. The original
proposal of RGBA32UI entity properties and separate GPU layer tables was not
needed for this increment. Style changes resolve on the CPU and upload textures
without rebuilding geometry for color/selection/visibility/lineweight changes.
Linetype/scale changes also invalidate geometry's dash-phase caches. Long runs
split/rebase cumulative distances in double precision before float32 upload, and
wide-polyline fill triangles retain measured run coordinates for shader gaps.
This retains an O(entity-count) style update cost;
it must not be described as a constant-time GPU layer edit. Native LTYPEs override
imported and original built-in patterns. Matching legacy layers remain
authoritative over native metric placeholders until native layer editing owns
the source. Complex linetype text/shapes remain retained for Phase 10.

The importer now retains original ACI, true color, linetype, lineweight, object
scale and LTYPE patterns when its parser provides them. This does not upgrade
the lossy I/O adapter to preservation of unsupported geometry, objects or every
style property. Creation snapshots CECOLOR/CELTYPE/CELWEIGHT/CELTSCALE,
CETRANSPARENCY and PLINEGEN. Supported CECOLOR inputs are ByLayer/ByBlock,
ACI 1-255, the first seven English color names and RGB:r,g,b; HSL and color-book
inputs currently produce an explicit diagnostic. Autodesk documents the broader
[CECOLOR forms](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-703858E3-9038-406A-B499-90A0C05BECBF.htm)
and [new-object transparency values](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-058580C9-43DE-4770-93C4-3DE1AB2F5287.htm).

Text rasterizes installed Arial/Malgun Gothic glyphs into multiple atlas
pages and draws them on the GPU. Projected size times device pixel ratio enters
the glyph cache key, quantized to half pixels and bounded to 4-256 pixels. This
keeps 7.5/15-pixel labels closer to native font hinting than fixed 64-pixel atlas
downsampling. The optional size argument defaults to 64 for scale-independent
callers. No Autodesk fonts are bundled. A transparent
Canvas2D overlay owns transient drafting aids, and the main framebuffer is reused
during preview motion. There is no Canvas2D fallback for the main model canvas;
context failure leaves application chrome and command input available.

The renderer QA uses 28 actual WebGL scenes and independent Canvas2D reference
instructions, not screenshots from AutoCAD. Exact-color probes, strict geometry
coverage and translated-scene framebuffer hashes constrain correctness. Thirty-seven
additional exact-color contracts cover mixed transparent primitives within/across
chunks, 200-million-unit dashed lines and wide fills, object linetype scale and
PDMODE 0/1. All 37 contract probes matched exactly on the tested Intel UHD 730.
The final 28-scene mean error peaked at 1.2376/255 after single-sample smoothing
and projected-size glyph caching; the gate is below 1.25. Unmatched reference
pixels peaked at 7 and unmatched GPU pixels at 18, both below the unchanged 0.5%
one-pixel-neighborhood gate. Native compositor probes differed by at most one
channel level. Thin-line coverage tolerance remains 30%, other scenes 8%; observed
final coverage differences were below 7.2% and 2.8%, respectively. Large-coordinate
legacy and native framebuffer hashes were identical. Detailed
results and acceptance thresholds are documented in the renderer README and
ignored `test-artifacts/render-golden` evidence. Functional results do not establish
the performance budget; final benchmark acceptance belongs in PROGRESS.

Twenty additional extreme-zoom comparisons cover scales 65536 and 262144 at
origin zero and (200000000, 450000000), with fractional model lines, a small
circle, tapered widths and five one-eighth-pixel pan steps. Binary-fraction line
framebuffers were identical at every step; each origin produced five distinct
frames, so small camera movement did not stick or jump. Circle/width comparisons
had no unmatched pixels in either one-pixel geometry neighborhood. Maximum
channel differences were 1 at scale 65536 and 8 at scale 262144, with maximum mean
error 0.001851/255. These small arc differences reflect double-precision model
coordinate rounding before float upload. The gate requires mean error at most
0.005/255, maximum channel error 16 and zero unmatched geometry pixels; binary
lines require identical hashes. Evidence is in `precision-contracts.json` with
the main renderer artifacts.

Viewport culling and precise geometry clipping include half the maximum displayed
stroke width plus its half-pixel shader fringe, converted to model units. A line
center outside the geometric view can therefore still contribute visible pixels.
View-dependent buffer keys include scale as well as eye and viewport dimensions;
same-center zooming must not reuse endpoints clipped for an earlier view height.
Three GPU contracts sample opaque/translucent 9-pixel boundary strokes on two
successive frames and a 200-million-unit line during scale 4-to-1 zoom-out. The
contracts use expected pixel colors independently of the culling implementation.

The canvas uses `antialias: false` and an owned single-sample color/depth
framebuffer. The isolated 1920x1080 million-line test on Intel UHD Graphics 730
measured roughly 36 fps with browser MSAA and 60 fps without it. A
LINESMOOTHING-controlled screen-space presentation pass and analytic wide-stroke
coverage replace that costly per-vertex MSAA path. Opaque glyphs draw after the
screen filter, reusing copied opaque depth, to avoid filtering glyph coverage a
second time. Ordered transparent graphics follow those glyphs. Unit-DPI thin strokes use
one-physical-pixel GL_LINES; high-DPI thin strokes use screen-space quads so their
CSS width remains stable. The quality gate must be rerun after smoothing changes;
this isolated backend comparison is not the final sustained app acceptance.

Final stress profiling also removed per-segment temporary arrays from the packed
generator and deferred thin-only chunks' instanced-wide data until first needed.
The original thin Float32Array is retained without copying; DPR changes, enabled
lineweights and smoothed transparency promote it during draw and dispose the empty
buffer. Existing model meshes with explicit wide data keep their original path.
Program uniform locations are cached. The packed generator matches its previous
output byte for byte at three LODs, and four lifecycle tests cover lazy upload,
DPR transitions, other promotion paths and resource disposal. Final measured
cadence and startup times are recorded in PROGRESS.

## 2026-10-16: Phase 02 view and drafting-aid scope

The shared navigation state machine accepts queued command text and actual mouse
events. [ZOOM](https://help.autodesk.com/cloudhelp/2027/KOR/AutoCAD-Core/files/GUID-66E7DB72-B2A7-4166-9970-9E19CC06F739.htm)
uses the larger of limits/extents for All, retains ten Previous views, interprets
bare scales relative to limits and X scales relative to the current view. Dynamic
uses a temporary overview and move/resize box; Enter commits one navigation from
the original view, while cancellation restores it. Object zoom finishes selection
before changing the view. The XP calculation exists, but the model-only UI rejects
it until an active floating layout model viewport can supply paper height. No
paper-size value is invented. REGENALL/REDRAWALL currently affect the sole active
model viewport. PAN and -PAN share the same view/journal boundary. Transition
settings read VTENABLE, VTDURATION and the VTFPS minimum-rate fallback.
Extents and middle-button double-click use the same 0.95 viewport fill factor;
the resulting 5% fit margin is an implementation assumption awaiting reference
measurement. ZOOM All captures relative point size from its final regenerated
view, rather than the temporary preceding view.

Grid limits, adaptive density and extra subdivisions follow
[GRIDDISPLAY bits 1/2/4](https://help.autodesk.com/cloudhelp/2027/KOR/AutoCAD-Core/files/GUID-4D6AC943-FC9C-4CB8-A4E6-AD7313BF9C3A.htm);
dynamic UCS bit 8 awaits a UCS-plane producer. Model-space dots use
[GRIDSTYLE bit 1](https://help.autodesk.com/cloudhelp/2027/KOR/AutoCAD-Core/files/GUID-30FC52C7-A734-43EE-A08D-96717A4B4959.htm).
The original WCS icon implements visibility and origin/lower-left placement from
[UCSICON](https://help.autodesk.com/cloudhelp/2022/ENU/AutoCAD-Core/files/GUID-EA2D8ACA-336A-4656-BFD3-43BC371C6171.htm);
selectable grips, Properties/3D icons and multiple viewports remain later work.
OPTIONS exposes the model-background subset with the existing RGB 33,40,48
default and an explicit user-selected color, stored as a local preference.

## 2026-10-15: Phase 02 display styles (milestone 2.1)

Public ACI tables disagree (Autodesk forum posts, gohtx, ezdxf captures of AutoCAD
2020 screens that already include background contrast adjustments). HanCAD uses the
published construction that matches the AutoCAD 2020 sheet capture exactly for
indices 10-249: 24 hues at 15 degrees, full and pale (halfway to white) variants at
levels 1, 0.65, 0.5, 0.3 and 0.15, truncated. Fixed values are 1-7 primaries,
8 = 128,128,128, 9 = 192,192,192 and the 250-255 ramp 51, 91, 132, 173, 214, 255.
Color 7 and top-level ByBlock display white on a dark background and black on a
light one (luminance threshold 0.5). True colors are never inverted. AutoCAD's
additional contrast adjustment of dark ACI grays near the background is not
applied; it is a parity item.

Lineweights are hundredths of a millimeter with -1 ByLayer, -2 ByBlock and
-3 Default. A top-level ByBlock entity and Default resolve through LWDEFAULT.
Autodesk documents only that model-space lineweights are drawn in pixels in
proportion to the plotted width and that 0 is one pixel. HanCAD draws 0.25 mm and
below as one pixel and adds a pixel per started 0.25 mm (0.30 = 2, 0.70 = 3,
1.00 = 4, 2.11 = 9), times the display scale (default 1). LWDISPLAY 0 draws all
objects one pixel wide.

`packages/render/src/style/hancad-iso-lin.ts` is an original metric linetype
library with the conventional names and dash patterns (inch patterns x 25.4, ISO
patterns in millimeters); no Autodesk file is bundled. The parser reads AutoCAD
.lin syntax with ';;' comments, case-insensitive names, up to 12 elements and
shape/text elements, which are retained for Phase 10 display. Dash fitting follows
the documented A alignment: whole patterns fill the run and the first dash is split
so the run starts and ends with equal dashes of at least half the first dash
(lengthened as needed); a run shorter than one pattern draws continuous. Pattern
scale = LTSCALE x object scale (CELTSCALE at creation) x 1/CANNOSCALEVALUE when
MSLTSCALE is 1 in model space. Transparency uses DXF 440 encoding (0x02000000 |
alpha explicit, 0x01000000 ByBlock, absent = ByLayer), clamped to 0-90 percent.

## 2026-10-15: Phase 01 milestone 1.6 closes the original build list

Runtime values come from typed providers rather than invented defaults. DATE and
CDATE use the local clock (Julian day boundary at midnight, 1970-01-01 = 2440588;
CDATE `YYYYMMDD.HHMMSS`); both discard subsecond time, matching Autodesk's note
that the value changes only after a whole second. NEW stamps TDCREATE/TDUPDATE
(local) and TDUCREATE/TDUUPDATE (universal) once, outside the journal. HANSAVE
stamps TDUPDATE/TDUUPDATE and folds the session's editing time into TDINDWG and
TDUSRTIMER (the user timer is on by default; TIME arrives with its command).
Opened drawings keep their saved times. `DrawingDatabase.writeUntrackedVariable`
is the only non-journal write; it is reserved for host facts.

The [CLAYOUT reference](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-0C492884-3B3F-4C35-8BAE-8233342A9203.htm)
defines the value as `name*handle` and accepts the name, `*handle` or both. SETVAR
CLAYOUT validates against LAYOUT objects, is journaled like other drawing
variables and switches the tab. A tab click writes the value without an undo step
(pending reference check). UCSNAME is `""` for the unnamed World UCS. EXTMIN/EXTMAX
report live geometry bounds, or the inverted 1E+20 pair for an empty drawing.
VIEWCTR/VIEWSIZE/SCREENSIZE read the displayed viewport. LOCALE follows the UI
language (KOR/ENU). Palettes HanCAD does not provide report state 0, which is their
real state, as do PERSPECTIVE and VIEWBACKSTATUS/VIEWFWDSTATUS. OS identity, paths
and codepages stay explicitly unavailable in browser mode; a native Platform
provider must supply them rather than guessed Autodesk strings.

Completed wheel zoom, middle-button pan, double-middle extents and ZOOM E record
VIEWCTR/VIEWSIZE as `navigation` journal entries; Combine (default on) merges
consecutive steps, and U/REDO/MREDO restore the exact view. Before recording, the
stored view is resynchronized to the displayed one, so a fit performed by OPEN/NEW
is restored correctly. View variables never trigger the full-drawing cache write.
UNDO Auto groups a whole `HeadlessCommandRunner.runMacro` call into one step; the
menu-macro syntax that feeds it is Phase 03 work. Layer-category combination is
journal-ready; its only producer, the Layer Properties Manager, is Phase 08.

The 185 numeric variables previously marked "range pending" were audited against
their Autodesk 2026 pages. Twenty-eight have documented rejecting ranges and now
enforce them. SELECTIONEFFECTCOLOR accepts 0-255: 0 is the documented initial value
and 1-255 the documented ACI range. Angles that Autodesk normalizes (GFANG,
LOFTANG1/2) and limits that depend on other variables (FACETERSMOOTHLEV, MAXACTVP,
FACETERMINUGRID versus FACETERMAXGRID) are not rejected. The rest document no range.

Phase 01 is complete: all four acceptance checks pass and every build item is
implemented or tied to its owning later phase. Template numeric fields, scale-list
order and the fit-only periodic tangent case need the user's installed AutoCAD and
remain on the parity checklist; they do not block Phase 02.

## 2026-10-15: User-directed advance to Phase 01

The latest explicit user request advances implementation to Phase 01. It
supersedes the prior wait for Phase 00 native acceptance, which remains deferred
and unverified. Preserve completed bootstrap diagnostics and delivered drafting
features; build only original Phase 01 foundations until its requirements pass.
The missing MSVC/SDK installation remains subject to the recorded earlier policy
rejection and is not retried as part of this phase.

## 2026-10-15: Native Phase 01 foundations and explicit remaining parity

The four original Phase 01 acceptance checks are narrower than its build list.
Keep the phase partial while unresolved defaults, range validation and undo UI
integration remain. Passing native graph/HCD, randomized journal and headless
checks does not certify complete AutoCAD database or system-variable parity.

Keep entity and object records as ordered group streams with persistent common
metadata. The [common entity codes](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-3610039E-27D1-4E23-B6D3-7E60B22BB5BD.htm)
and [XDATA reference](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-A2A628B0-3699-4740-A215-C560E7242F63.htm)
require application/subclass context rather than a single code-to-value map.
Mapped edits preserve unknown and repeated groups, including dictionary entries
and per-vertex widths/bulges. Sixteen codecs are implemented; other types retain
explicit opaque status with documented numeric mappings. Metadata covers the
published entity/object/table inventory and child sections. SCALE is common-only
until a specific official group table or verified reference record is available.
Later DXF/DWG I/O must consume this graph; the current editable import adapter is
still lossy and is not upgraded merely by adding the native schema.

The default graph uses original resources and metric values, without copying an
Autodesk template or font. Named styles, 25 scales, limits and layout/block links
are established, following [DICTIONARY](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-40B92C63-26F0-485B-A9C2-B349099B26D0.htm),
[LAYOUT](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-433D25BF-655D-4697-834E-C666EDFD956D.htm)
and [BLOCK_RECORD](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-A1FD1934-7EF5-4D35-A4B0-F8AE54A9A20A.htm)
reference relationships. Exact acadiso style numeric fields, paper setup,
font substitution, default viewport contents and scale-list membership/order
still require comparison with the user's installed metric template.

Canonical geometry preserves DXF units and coordinate systems, including OCS
bulges/widths from [LWPOLYLINE](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-748FC305-F3F2-4F74-825A-61F04D757A50.htm)
and control/fit data from [SPLINE](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-E1F884F8-AA90-4864-A215-3182D47A9C74.htm).
Closest point, length and area on general splines are numerical; curved bounds
may be conservative. Widths are retained while these inquiries use centerlines.
Fit-only periodic endpoint tangents are accepted only when they match the existing
C2 periodic cubic interpolant. Inconsistent tangents are explicitly unsupported;
do not create arbitrary extra knots to force a fit. Autodesk's
[SPLINE command reference](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-5E7D51E2-1595-4E0C-85F8-2D7CBD166A08.htm)
documents fit parameterization and tangency, but does not define a general
periodic constrained solver. Arbitrary periodic endpoint tangents, natural end
conditions for omitted fit tangents and exact interpolation for stored nonzero
fit tolerance remain assumptions pending reference comparison. Nonuniform
polyline transforms retain source data with an affine wrapper; database writeback
of that transformed geometry belongs to integration.

The sourced registry has 860 variables, 798 fixed/metric defaults and 62 explicitly
unavailable host/document defaults. An unavailable default produces a typed
diagnostic, not a guessed path or zero. Keep DXF header metadata separate from
SETVAR-only names. Defer numeric ranges lacking reliable evidence. Autodesk's
[SELECTIONEFFECTCOLOR reference](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-CBB90ED0-9C2C-401A-B849-0EAD4E15DC7E.htm)
specifies default 0 alongside range 1-255; retain its documented default and
integer validation until installed-reference behavior resolves the conflict.
The documented AREA/CENTER settings resolve to HPDRAWMODE=0 and HPPATHALIGNMENT=1;
use-current defaults for HPLAYER, HPTRANSPARENCY, MLEADERLAYER and XREFLAYER retain
the official `.` sentinel. MEASUREINIT=1 follows the explicit metric startup
policy rather than guessing the host's region. Source initial-value wording stays
attached to each definition and the generated reference.

Undo supports the original options and live UNDOCTL, but Auto menu grouping and
navigation/layer category integration remain unfinished. Autodesk's
[User Preferences reference](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-2E780292-7D34-4A34-8CCC-82363D4F9092.htm)
defines those combined UI actions; exposing state flags alone does not reproduce
them. [REDO](https://help.autodesk.com/cloudhelp/2022/ENU/AutoCAD-Core/files/GUID-BA4CEE11-D8AD-4644-8488-7CEBCA50AFFE.htm)
must immediately follow U/UNDO. The runner now closes the single-REDO window on
intervening commands, including informational commands and rejected input, and
REDO restores the last actual undo batch. MREDO retains its separate redo stack.
Compare the exact command boundaries and prompts with the installed reference.
[OOPS](https://help.autodesk.com/cloudhelp/2022/ENU/AutoCAD-Core/files/GUID-0E72CDCD-9ECA-453A-8A04-CA2921740270.htm)
restores the latest ERASE set; BLOCK/WBLOCK/PURGE cases await those commands.

Use a new document for both native and imported OPEN, so a prior graph, OOPS set
or binary attachment cannot leak into the opened file. Tab reactivation retains
history; recovery/HCD reload starts a clean journal. The .hcd save preserves the
full native graph and binary blobs. The application-specific HANSAVE command is
separate from transitional supported-entity DXF output. Recovery publishes only
the active document through a shared ordered queue; full open-document-set crash
recovery is not claimed.

## 2026-10-15: Complete the next bootstrap diagnostic boundary

Continue Phase 00 only, as the user explicitly reaffirmed sequential phase
completion. Importer messages have stable namespace/code identities with typed
parameters; dynamic line numbers, limits and nested geometry reasons are data,
not parsed Korean strings. Preserve legacy fallback text and callbacks for
existing importer consumers. Fatal entity limits use identities instead of a
language-dependent regular expression.

Format current progress and persisted warning identities at display time so
changing the shell language also changes an ongoing read and a recovered report.
Untyped external diagnostics and old warning-only caches retain their original
text. Validate optional aligned warning metadata before publishing any recovered
drawing. File failure/cancellation must preserve the existing drawing and view.

Canvas initialization failures release resources and display a catalog-based
alert while the command line remains available. Export, command value and Editor
queue failures use typed domain errors. Inject app error presentation into the
headless runner so registered export failures do not become untranslated strings
before reaching the UI. UI catalogs may consume legacy-bridge diagnostic types
and guards without invoking the CAD runtime. No dependency is installed and no
parser, converter or drawing behavior is introduced by this diagnostic work.
Visual QA at 1280x720 exposed overlapping English ribbon buttons. Retain the
bootstrap ribbon's existing button/tooltip content while giving buttons a stable
width and constraining label ellipsis to that width. Full adaptive ribbon
customization remains its original later-phase requirement.

The refreshed native prerequisite inventory still lacks MSVC and the Windows
SDK. Respect the earlier automatic approval rejection (`blocked by policy`);
do not install through another route. Native Korean shell startup, the 1280x720
minimum and saved position/size remain Phase 00 acceptance blockers. Browser
verification does not satisfy those items. The later explicit user-directed
advance recorded above supersedes this entry's original Phase 01 start gate.

## 2026-10-15: Restore strict original phase order

The latest user instruction explicitly requests the supplied prompt order. It
supersedes the earlier practical feature priorities and the recorded Phase 7.3
handoff. Keep existing later-phase functionality and tests; implement new work
only in the earliest unfinished phase. Phase 00 remains open until its actual
native acceptance and remaining i18n requirements are verified.

Read-only inspection confirms no installed MSVC instance or Windows SDK on this
PC. The existing automatic installation rejection (`blocked by policy`) is still
respected. No packages are installed in this reconciliation. Bootstrap work can
improve prerequisite detection and localize the progress dialog while native
acceptance remains pending. Later diagnostic strings still require localization;
neither these corrections nor browser tests complete the whole phase.

Bootstrap localization also covers known SystemVariableError diagnostics in
headless commands and browser UI. Keep validation and storage unchanged, retain
Korean fallback diagnostics for existing API consumers, and carry reason/range/
symbol-reference data to typed message catalogs. Unrecognized exceptions remain
unchanged; do not translate arbitrary strings or erase their diagnostic content.
Importer errors/progress/warnings and renderer failure presentation remain open
Phase 00 i18n work. Their remaining hardcoded text prevents a universal-language
acceptance claim even though normal shell and typed variable errors are bilingual.

The pinned window-state 2.5.0 implementation restores and shows the initially
hidden main window by default; the official
[window-state usage](https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/window-state)
documents automatic restoration after plugin registration. Keep the existing
plugin setup rather than adding an unverified second restoration path. Actual
startup and saved position/size require the missing native toolchain.

## 2026-10-15: Continue essential editing and single-line Korean text

The continuation follows the exact next step in PROGRESS and the saved Phase 07
and Phase 10 prompts. Their complete original acceptance is still pending. The
delivered subset is TRIM/EXTEND for LINE targets, supported finite 2D boundaries,
basic OFFSET and left-baseline TEXT/DTEXT. No new dependency or converter is needed.

Autodesk's [Korean TRIM reference](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-B1A185EF-07C6-4C53-A76F-05ADE11F5C32.htm)
defines Quick/Standard, all-boundary defaults, Shift alternate operation, fences
and local Undo. Quick trim deletes an otherwise untrimmable supported LINE;
Standard reports no intersection. Actual dragged paths are finite fences. LINE,
polyline, rectangle, circle and arc boundaries are supported, including visible
locked boundaries. Only editable LINE targets are modified. Project, Crossing,
Erase, hatch boundaries and non-LINE targets remain pending; no 3D projection is
implied by this model-space subset. EDGEMODE permits implied straight boundary
extensions. The new [TRIMEXTENDMODE](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-52B3803E-FADC-4D7B-9BF2-A176C7FB7535.htm)
uses profile scope/default 1 (Quick), with 0 selecting Standard.

[OFFSET](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-LT/files/GUID-C0E4246D-C420-42BD-A6FC-8B1852EFD005.htm)
uses remembered distance/Through, Erase, Source/Current layer, Multiple and Undo.
Supported lines/circles/arcs are exact; straight open and convex closed polylines
support miter joins with OFFSETGAPTYPE 0. Self-crossing/concave/collapsed/topology-
changing results and gap types 1/2 are explicitly rejected. Curved polylines,
cavalier_contours integration, ellipses/splines/xlines/rays remain pending.
Multiple uses the most recent result as its next source; Enter returns to object
selection. Accepted offsets enter one command transaction. Autodesk documents
[OFFSETDIST](https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-Core/files/GUID-4296AA53-76EF-4BDA-8B73-1AF08EA0B523.htm)
as not saved, default -1/Through. The prior drawing-scoped definition is corrected
to session scope; NEW keeps it and application reload resets it.

[TEXT](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-D1C664DD-63D9-467E-8EC1-2F5A1777A924.htm)
creates independent lines at a baseline point, height and rotation. The current
subset uses an inline Korean composition input and existing local TrueType/browser
fallback rendering. Readable editing size is clamped to 12-64 CSS pixels and is
horizontal; final model rotation/height remain unchanged. The provisional 1.25-height
line advance and cap-height/font metrics require installed-reference comparisons.
Height is limited to the transitional model's 0 < height <= 1000 and each line to
2000 UTF-16 code units; invalid entries and capacity overflow are rejected before
mutation. Justification/style options, TEXTED/DTEXTED alternatives, SHX/BigFont,
control codes, in-place existing-text editing and full MTEXT remain pending.
Esc discards current text while retaining accepted lines; a height accepted before
Esc is remembered atomically even if no lines were created.

Browser profile scope persists in a separate validated local preference cache,
including TRIMEXTENDMODE/EDGEMODE/OFFSETGAPTYPE. It neither saves drawing/session
values nor creates drawing undo records. TEXTSIZE uses a document-ID-scoped overlay
for standalone edits and is refreshed on complete cache publications. A regression
found that an Undo overlay could otherwise override a newer Redo snapshot; browser
tests now cover both normal/empty TEXT and foreign-document overlay isolation.

## 2026-10-15: Make the basic drawing workflow reliable

The user's priority is dimensions, endpoint recognition, dragging and wheel
navigation. This slice adds exact snaps, true intersections, directional rectangular
selection, selected-object drag/move/Ctrl-copy, MOVE/COPY and read-only DIST. It
does not claim complete Phases 2/4/5/7/11/15 acceptance.

Autodesk's [Korean object-snap reference](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-50383F73-4F23-4F70-B4FC-52D5748D80AF.htm)
defines endpoint/corner, midpoint, center, quadrant and true intersection modes.
Exact object snaps bypass grid and Ortho. APERTURE controls the screen-space search
radius; AUTOSNAP bits 1/2 control markers/tooltips. Candidate selection remains
nearest-distance based. Advanced snap modes and Tab cycling require reference QA.
Intersection scanning is locally pruned, not the complete R-tree/four-ms budget.

The [pointing-device reference](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-LT-Customization/files/GUID-B1CDEE41-F8BF-48A4-A895-273DBB295378.htm)
documents cursor-centered wheel zoom, middle pan and double-middle extents.
Browser wheel events normalize 100 pixel-delta units, three line units or one page
unit to one notch, then apply reciprocal ZOOMFACTOR scaling. Mouse/browser delta
differences need reference QA. MBUTTONPAN=0 disables pan; its full snap-menu
alternative is pending. Left drag starts after four CSS pixels. This increment
implements rectangular window/crossing; default lasso, PICKAUTO/PICKDRAG, grips
and click-click selection remain pending.

Autodesk documents [selected-object dragging and Ctrl copying](https://help.autodesk.com/cloudhelp/2025/ENG/AutoCAD-Core/files/GUID-0BFF5C5E-B1B4-4996-9AA4-57396FD6F6F2.htm)
and [two-point COPY](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-1CF9287F-06E8-4D03-8377-2E130862FE02.htm).
Initial MOVE/COPY supports selection, base/second points, exact coordinates, Ortho,
snaps, direct distance and repeated copies. COPY placements are one undo group,
retained when Esc ends accepted placements. Full COPYMODE/Array/Undo/Displacement
options are pending. Coordinates remain exact; dimensions remain non-associative.

[DIST](https://help.autodesk.com/cloudhelp/2024/KOR/AutoCAD-Core/files/GUID-A72EADC7-EF79-463C-B4F1-862C6139B004.htm)
reports two-point distance, WCS deltas and XY angle without document mutation.
LUPREC/AUPREC/ANGBASE/ANGDIR are read; display is initially decimal millimeters and
degrees. Other unit formats/Multiple/transparent nesting remain pending. Dimension
point input also accepts direct distance along the cursor, relative to the most
recent definition point; verify that reference for each placement prompt. Empty
clicks at dimension entity prompts leave the prompt active.

## 2026-10-14: Measure complete paint and remove repeated drawing allocation

The first retained-path benchmark exposed a misleadingly small geometry submission
time: some frames submitted in 7-42 ms but took several seconds to reach paint and
readback. Copying the backing canvas synchronized expensive queued raster work;
initial transient JavaScript allocation also exceeded 2 GB. A callback or path
submission timer alone is insufficient performance evidence.

Static drawing now renders directly to the main canvas, with a transparent canvas
for previews/snaps. Display-only adaptive paths bound geometric deviation to
0.25 CSS pixels and retain only the current zoom bucket. All model entities and
export geometry remain unchanged and reappear at finer detail when zooming.
This remains a Canvas2D transition; the complete WebGL/R-tree performance budgets
are pending.

Owned reader results no longer receive another full deep clone. Direct commits
validate/normalize once, serialize once, and reuse the exact prepared session in
the synchronous journal observer. A finally block releases the temporary reference;
untrusted caches and undo/redo retain full parsing/validation. Composite metadata
remains independently copied. Large strings bypass Web Storage's likely quota
failure and use the existing atomic chunked IndexedDB path. The mandatory command
journal is retained; recovery still has one additional normalization pass.

## 2026-10-14: Deliver the initial dimension subset from Phase 11

The user requested dimension creation/display now, extending the previous usable
2D slice. DIMLINEAR, DIMALIGNED, DIMRADIUS, DIMDIAMETER, DIMANGULAR, smart DIM and a
basic DIMSTYLE dialog are implemented ahead of complete Phases 7-10. This does not
declare those prerequisites or the complete Phase 11 acceptance criteria done.
The original aliases remain authoritative: D opens DIMSTYLE; DLI/DAL/DRA/DDI/DAN
start dimension tools. Full named-style management, associativity, leaders,
tolerances, fit rules and additional dimension commands remain pending.

The ten supported style values are captured per dimension. Editing defaults does
not silently restyle imported dimensions. Explicit selected application is an
undoable operation and preserves definition coordinates and text overrides.
Measured model geometry remains independent of annotation size: [DIMSCALE](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-AEA309F0-B831-4432-8085-FB6CD49CDC78.htm)
scales text/arrows/offsets, while [DIMLFAC](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-B6063785-B199-4A9A-8BD7-2108EB0AB7ED.htm)
formats linear/radial measurements and does not affect angular measurements.
DIMSCALE 0 resolves to 1 in the current model-only application; annotative and
paper-space scaling remain pending. Negative DIMLFAC is ignored in model space,
following the documented paper-space-only meaning.

[DIMZIN](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-A1860981-FE1C-4947-927B-7CD6B8CEF8EE.htm)
defaults to metric trailing-zero suppression (8); the initial implementation
supports decimal leading/trailing-zero bits, not feet/inch formatting.
[DIMPOST](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-79CCF9B1-BE33-4158-891C-50E4BF795D8E.htm)
and explicit Text overrides use the measurement placeholder `<>`. Korean free
text uses editable IME input. DIMTXT 0 fixed-font-height behavior, negative DIMGAP
text boxing and complete text fitting need later font/style work and reference QA.

DXF stores editable DIMENSION definitions, their supported style values and *D
graphics blocks. This is a supported-geometry round trip, not full original DWG
or unsupported-table preservation. Current definitions are non-associative even
though DIMASSOC is a registered system variable.

The emitted style fields were checked against Autodesk's [DIMSTYLE group codes](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-F2FAD36F-0CE3-4943-9DAD-A9BCD2AE81DA.htm)
and [linear/rotated dimension codes](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-F0004556-493C-48D5-8619-61D6ADF05C04.htm).
Independent tag assertions cover degree/sign conversion for rotation and text,
dimension-kind flags, supported style values, graphics-block references and
HEADER DIMASSOC = 1. Text rotation assumes World UCS; arbitrary UCS and associative
OBJECTS records remain pending. No installed AutoCAD regeneration test was performed.

## 2026-10-14: Launch from the interactive CMD

The user reported that a healthy local server still did not produce a new browser
window. The detached launcher/port-reuse path delegated browser opening to a short
lived child process and only checked HTTP, which is insufficient evidence of GUI
launch. `HanCAD 실행.cmd` now directly invokes Windows `start` after server health,
using the installed Edge path or the default URL handler. Server scripts only
manage the local server. The user executed the changed CMD and confirmed that the
new browser window appeared. Headless/server checks explicitly skip GUI launch;
they must not be reported as proof of a visible window.

Native Edge launch verification through a shell was rejected by automatic approval
review with "blocked by policy". No alternate automated native launch was used
to bypass it; GUI confirmation came from the user running the reviewed launcher.

## 2026-10-14: Adopt the full supplied specification

The user's latest instructions authorize all phases and resolve overlapping
behavior in favor of the ZIP prompts. The original master prompt is installed
verbatim. Full 3D, automation, customization and desktop scope is accepted, while
each implementation phase remains subject to its acceptance criteria.

Existing implementation is preserved for reuse and rollback. The original alias
map does not apply to the new app: D means DIMSTYLE, DV means DVIEW and DRE means
DIMREASSOCIATE. Canonical commands, aliases and UI macros must share one registry.

## 2026-10-14: Deliver continuously usable new-app builds

The user clarified that the old standalone app need not remain usable: they are
switching to the new application and want to try each implemented feature. They
also explicitly require DWG opening and PDF/image conversion. Therefore the new
app is the main app, with a continuously refreshed browser build and a main
launcher. Necessary geometry and I/O code is migrated behind typed adapters;
obsolete screens, duplicated source and old launch/build paths are retired after
the replacement workflow is verified. A complete original backup is retained.

Usable DWG viewing and PDF/PNG/JPG/SVG output are delivered early as partial slices
of Phases 2, 9 and 14. This does not mark those phases complete or cancel the full
specification. The new app's progress dialog distinguishes usable features from
complete phases. The initial PDF is a self-contained A4 raster output; vector
plotting and exact scale controls remain pending and are shown to the user.

## 2026-10-14: Prioritize the usable simple 2D application

The user subsequently asked for essential features first and explicitly deferred
3D and secondary features. The immediate delivery target is local file opening,
viewing, basic mouse/coordinate drafting, selection/erase, command-level undo/redo,
DXF saving and PDF/image output. Move/copy, snapping, text, dimensions and practical
2D modifications follow before optional automation or 3D. Original prompts remain
organized separately with an implementation-order index in
`docs/prompt-source/PRIORITIES.md`. This changes priority without declaring full
phase acceptance or changing the reference behavior.

## 2026-10-14: Version selection

Versions were queried from the npm registry before installation and pinned in
`package.json` and the lockfile. Node 24.18.0 is already installed; pnpm 12.11.2 is
installed for the workspace. React 19.3.0, Vite 8.3.4, Vitest 5.0.4, Playwright
1.64.0, ESLint 10.12.0, typescript-eslint 8.71.2, Prettier 3.9.10, Tauri CLI 2.12.2
and API 2.12.3 were selected.

The latest TypeScript was 7.0.2, but typescript-eslint 8.71.2 declares support only
for TypeScript below 6.1.0. TypeScript 6.0.3 is therefore pinned as the latest
supported stable version for this verified toolchain.

Rust stable 1.99.0 and the wasm32-unknown-unknown target are installed. The official
wasm-bindgen 0.2.129 Windows binary is installed. WebView2 155.0.4283.45 already
exists. The attempted Microsoft C++ Build Tools installation command was rejected
by automatic approval review with the reason "blocked by policy"; no MSVC
installation was performed. The missing native toolchain must be recorded as a
desktop acceptance dependency, not worked around by bypassing that rejection.

## 2026-10-14: Bootstrap WASM ABI

The initial geometry proof uses a dependency-free Rust crate with raw WASM numeric
exports and a typed JavaScript adapter. This allows the browser/WASM acceptance
test to run without native host linking while MSVC is unavailable. The installed
wasm-bindgen CLI remains available for later binding generation. This does not
replace or bypass the missing native desktop prerequisite.

## 2026-10-14: Practical large-DWG capacity and visibility

The user's 27.4 MB R2000 drawing exposed the original 20,000-entity limit, then the
initial 200,000 transition limit. Parser diagnostics found 117 layers, 189 block
definitions with 357,382 internal entities, and a conservative reachable expansion
of 303,031 entities. All 1,453 INSERT records were 1x1, so this was legitimate
block content rather than array multiplication. A consistent 500,000-entity hard
ceiling is sufficient for this file; it imports 286,996 supported/approximated
entities. Oversized inputs are rejected explicitly instead of silently sliced.

Bounds use streaming extrema and visible-layer sets to limit memory/work. The
imperative renderer borrows immutable drawing snapshots rather than defensively
cloning all geometry. It must never mutate those inputs. Preview and selection
remain privately owned.

The imported layer flags can produce an initially blank drawing. Explicit LAYON
preserves an undoable layer change. When making an entirely hidden drawing visible,
the usable transition also fits it before the first paint: painting large circles
or text at an empty-drawing zoom can stall the browser. This automatic fit is a
documented transitional behavior requiring reference parity review; regular edits
preserve the current view.

Large cache data exceeds localStorage quota. Browser-local IndexedDB fallback
stores the serialized view without uploading it. OPEN/NEW supersede late restore
results, and failed cache writes must never resurrect a previous drawing.

## 2026-10-14: Resolve ambiguous input behavior

Dropping a drawing on the drawing canvas will insert it as a block once Phase 13
is implemented. Dropping it on the file-tab/open area will open a document. This
separates the Phase 9 and Phase 13 requirements without changing either operation.
Before insertion is implemented, its drop target must explicitly report that it
is unavailable rather than replacing the current drawing.

Selection follows PICKAUTO/PICKDRAG settings. A press-and-drag uses lasso when
enabled; otherwise it uses direction-sensitive rectangular selection. Record
reference-version parity checks before implementing these settings.
