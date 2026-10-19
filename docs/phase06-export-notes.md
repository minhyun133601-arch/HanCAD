# Phase 06 drawing transport and export

The transitional entity outline remains compatible with earlier editing tools.
Validated optional WCS curves, polyline widths/elevation/thickness, REGION loops,
filled boundaries, MLINE paths/styles and revision-cloud metadata survive JSON
normalization, HCD bytes, recovery and drawing Clipboard transport. Clipboard
translation applies the existing shared geometry transform and merges required
MLINE style definitions without replacing matching destination definitions.
When a destination style already exists, the copied MLINE rebuilds its actual
rail paths from that definition as well as adopting its canonical name/offsets.

The bridge installs typed drawing-export hooks into the local runtime. Supported
DXF output uses actual POINT, LINE, XLINE, RAY, CIRCLE, ARC, ELLIPSE, SPLINE,
LWPOLYLINE and 3D POLYLINE/VERTEX/SEQEND records. Planar polylines retain variable
or constant widths, elevation and thickness. SOLID and TRACE write actual filled
quad records with the DXF vertex order; 3DFACE uses its own order. No control
polygon substitutes for an exact curve in the supported native encodings.

HanCAD's additional geometry/editor metadata is versioned JSON in owned extension
DICTIONARY/XRECORD objects named HANCAD_DRAW. This avoids the
[16 KB XDATA limit](https://help.autodesk.com/cloudhelp/2026/ENU/OARX-ManagedRefGuide/files/OARX-ManagedRefGuide-Autodesk_AutoCAD_DatabaseServices_Xrecord.html).
Native entity geometry remains useful to other applications. Own-file reopening
validates the metadata, checks the extension-dictionary relationship, applies
actual INSERT transformations and preserves block membership. Foreign files
without this metadata retain the previously documented importer behavior; this
change does not claim universal foreign DWG/DXF preservation.

Imported spline-fit POLYLINE records retain header flags/type (70/75) and original
VERTEX control-frame flags (70 bit 16), excluding generated fit vertices (bit 8)
from reconstruction. Quadratic/cubic frames provide exact uniform NURBS geometry
for SPLINE Object, including 2D elevation, 3D controls and closed periodic paths.
Open frames use clamped uniform knots; closed frames repeat the initial degree
controls with periodic uniform knots, matching the existing command factory.
Installed-reference comparison of the legacy knot convention remains pending.
Real ASCII DXF fixtures verify both degrees, open/closed paths, Object conversion,
DELOBJ 0/1 and supported native SPLINE output after conversion.
Exporting an unconverted spline-fit POLYLINE rejects its unsupported native
identity explicitly; executing SPLINE Object creates a canonical SPLINE that
exports normally. HCD/recovery/Clipboard preserve the original source marker and
exact geometry until that conversion.

Each metadata packet records a canonical signature of its native geometry,
including owned POLYLINE vertices. Reopening accepts exact editor metadata only
when that signature still matches. External native geometry edits instead use
the current native record and report a localized warning, so an old metadata
snapshot cannot silently restore the earlier shape. Style-only edits retain the
exact geometry and use the current native style. The existing foreign-import
limitations also apply to this fallback; this guard does not make unsupported
foreign records exact or provide a security signature.

SVG uses analytic affine conics and evaluated adaptive paths for NURBS, helixes
and other curves. Raster/Clipboard images sample the same curves, include filled
boundaries and object-space widths, and use correct curved bounds. Infinite
construction geometry clips to the export page/canvas instead of a fixed distant
endpoint. An unbounded-only export currently uses a 100-unit anchor window;
matching AutoCAD's active plot-window choice belongs with the plotting phase.
Tapered-width strip joins in SVG/raster still require installed-reference visual
comparison; native DXF retains the original width parameters.

The app reads the active drawing's WIPEOUTFRAME when creating file-output and
Clipboard-image snapshots. Modes 0 and 2 omit the printed/image border; mode 1
includes it. Creation-time entity metadata and the exact Clipboard JSON are
unchanged. Production regressions exercise creation in mode 1 followed by
2/1/0, decode actual PNG pixels, inspect SVG frame paths and verify unchanged
source entities across export/reload. The external Clipboard-image convention
still needs an installed-AutoCAD comparison.

File exports and Clipboard images use a transient snapshot of the current
drawing's WIPEOUTFRAME, so changing the global mode also affects existing masks.
The source entity and exact Clipboard JSON retain their original metadata.
Clipboard images follow the existing plot-like PNG convention: mode 1 includes
the frame; modes 0 and 2 omit it. Comparing this Clipboard-image convention with
installed AutoCAD remains pending. The production browser regression decodes
actual PNG pixels for all three current modes and verifies identical exact JSON;
all 13 affected Clipboard/Properties/native-contract browser tests passed.

Native ACIS REGION, MLINE style graphs, WIPEOUT image/mask dictionaries and HELIX
spline/native encoding remain with the original I/O/kernel phases. DXF export
rejects these source types explicitly before producing a download. It also
rejects a generic TRANSFORMED curve when no exact supported native encoding has
been selected. HCD, recovery and Clipboard retain their exact metadata. SVG and
images retain the supported visible geometry. This explicit boundary avoids a
misleading fallback-polyline file that loses the original entity identity.

Verification on 2026-10-19: 47 affected tests in 12 files passed, including all
legacy-bridge and io-pdf tests, Clipboard block DXF, exact Clipboard transport,
HCD bytes/recovery and document foundations. The native group-code test decodes
the exported primitives through the independent database schema and geometry
parser, bypassing HANCAD_DRAW metadata; a negative-sweep ARC is included. Separate
tests cover a real modified INSERT, exact own-DXF geometry, taper/elevation/
thickness, analytic conic SVG, evaluated NURBS raster paths, SOLID/TRACE winding
and explicit unsupported native encodings. Strict TypeScript and affected ESLint
passed. Phase-wide final verification is recorded by the parent integration pass.
The final mixed-width correction retains zero-width segments alongside filled
wide strips in SVG/raster output; all 20 affected export/Clipboard tests in three
files passed after that correction, followed by strict TypeScript and ESLint.
The final native-edit guard passed all 21 focused export/Clipboard tests in three
files and all 44 affected bridge/PDF/Clipboard/persistence tests in 11 files.
Its regression edits an actual native ELLIPSE center while retaining the old
XRECORD, then separately verifies a style-only edit keeps exact geometry.
The imported spline-fit path passed 40 affected tests in nine files, including
four actual native-record import-to-command cases. Affected ESLint passed.

References: Autodesk's [ELLIPSE](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-107CB04F-AD4D-4D2F-8EC9-AC90888063AB.htm),
[SPLINE](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-E1F884F8-AA90-4864-A215-3182D47A9C74.htm)
and [HELIX](https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-DXF/files/GUID-76DB3ABF-3C8C-47D1-8AFB-72942D9AE1FF.htm)
group-code references, plus the existing generated database schema sources.
Spline-fit record flags follow Autodesk's [POLYLINE type mapping](https://help.autodesk.com/cloudhelp/2018/ENU/OARX-RefGuide/files/OREF-AcDb2dPolyline__polyType.html)
and [VERTEX flags](https://help.autodesk.com/cloudhelp/2021/ENU/AutoCAD-DXF/files/GUID-0741E831-599E-4CBF-91E1-8ADBCFD6556D.htm).
