# Decisions

## 2026-10-17: Phase 05 selection, grips and Clipboard

Selection gestures follow the independent PICKAUTO bits and PICKDRAG input
methods documented by Autodesk: [PICKAUTO](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-7BAAA374-8409-4296-B520-C5355941C836.htm),
[PICKDRAG](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-46CBF4EF-E210-447D-AE6E-793249551640.htm).
Default press-drag is lasso; click-release-click is the rectangular method.
PICKFIRST=0 blocks idle preselection while command-owned selection stays usable.
The common prompt remains literally `객체 선택:`; supplemental keyword controls
and dynamic options expose its otherwise hidden English methods.

Hover/selection styling changes only affected GPU style texels. ACI variables
control area colors and opacity; SELECTIONAREA=0 keeps the outline without fill.
SELECTIONPREVIEWLIMIT defaults to the documented 20,000; its current integer
validation uses 0..32767 pending installed-reference range comparison.
[Autodesk preview limit](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-9CDDA4F9-5B88-428F-B0C8-345E9A9DC4F1.htm).
GRIPMULTIFUNCTIONAL (3), GRIPTIPS (1), PREVIEWFILTER (3) and this preview limit
were added to the declarative catalog. No dependency upgrade was selected.

Grip transforms retain accepted copies provisionally and publish one command
transaction. Shift hot-grip selection is transient; its first Esc clears hot
state before a subsequent Esc clears object selection. Exact curve edits retain
polyline bulges in model Y-down coordinates, inverted once for WCS/DXF. Aggregate
group/clipboard-block grips follow GROUPDISPLAYMODE/GRIPBLOCK; group copies receive
separate definitions and persistent identities.

Grip dimension input reads DYNDIVIS and DYNDIGRIP rather than treating every
numeric field as pointer displacement. Single supported shape grips resolve
result/change lengths, angles and arc radii against their original geometry;
locks project through the shared point pipeline without rounding doubles.
Invalid object dimensions cannot commit through Enter or a mouse pick. TEXT,
DIMENSION, ARC endpoints and aggregate/multiple hot grips retain displacement
input. The exact adjacent-segment presentation remains an installed-reference
comparison item; official sources are recorded in phase05-grip-notes.md.

Named groups and clipboard block instances survive local recovery and supported
DXF. Named FILTER definitions use a profile-global store with 18-character names;
Apply then asks for objects and filters the picked methods. XOR takes exactly two
operands and NOT takes one. The earlier optional drawing/DXF filter extension is
still decoded for compatibility; it is not the authoritative named-filter store.
Mirrored native entities provide real persistent
handles, ownership and reactors inside the same command transaction; they are
excluded from duplicate display/snaps. These adapters do not claim lossless
foreign-object DWG/DXF preservation or complete later-phase block editing.

Win32 Clipboard uses a real HWND, registered HanCAD.Drawing.v1 and PNG formats,
CF_DIB and Unicode text. Browser ClipboardItem offers exact JSON plus PNG; denied
OS access is explicitly reported and falls back to same-origin IndexedDB for
cross-window use. COPYCLIP's inferred lower-left base and 500 ms grip-menu hover
timing require comparison with installed Korean AutoCAD. Native compilation and
runtime checks are blocked by missing MSVC/Windows SDK, independently of passing
actual browser system Clipboard checks. Detailed sources and tests are in the
three phase05 workstream notes; final verification belongs to PROGRESS.md.

## 2026-10-17: Phase 04 WIP checkpoint and pause

The user explicitly paused Phase 04 before integration and acceptance. The new
code is a checkpoint, not a verified release. Exact partial checks and failures
are recorded in PROGRESS.md; the accepted production build remains Phase 03.

The coordinate layer keeps ANGBASE/SNAPANG in radians and POLARANG/POLARADDANG
in degrees, formats command input through AUNITS, and preserves optional Z only
when semantically supplied. An unwanted absolute-2D base-Z inheritance case is
still failing. Z preservation through the transitional normalizer remains open.
Snap source geometry uses WCS Y up and converts only at the public model-Y-down
query boundary. The dynamic RTree moved to geom to avoid a draft-to-render
dependency. Dynamic fields share raw command input and the same unit parser;
their UI and canvas integration are pending.

Unverified assumptions to resolve on resume: 400 ms hover acquisition dwell,
isometric lattice spacing and polar sensitivity, localized modifier prompts,
deferred preview and typed-versus-snap priority. The current POLARANG catalog
restriction also needs reconciliation with the drafting-settings documentation
that permits an entered increment; it has not been changed at this checkpoint.

Reference material read during WIP: [LINE](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-E8C1190C-A26C-484C-ADDD-DDF81666F69F.htm),
[coordinates](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-0A0135DB-3216-482B-81DD-74E6DB8CA3E3.htm),
[POLARMODE](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-Core/files/GUID-D91628CC-9975-4DBF-8D02-10B23A6F3ED5.htm),
[TRACKPATH](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-Core/files/GUID-6BF0703C-28B2-4591-8337-34B8C20443F2.htm),
[object tracking](https://help.autodesk.com/view/ACD/2026/ENU/?caas=caas%2Fdocumentation%2FACDLT%2F2014%2FENU%2Ffiles%2FGUID-665DC37F-8C3E-414A-9369-72A13C0BE07A-htm.html).

## 2026-10-17: Phase 03 drawing menus, status controls and help

The drawing-area right-click policy follows Autodesk's SHORTCUTMENU bit codes:
1 default, 2 edit, 4 active command, 8 active command with keywords. Bit 16
uses SHORTCUTMENUDURATION: a shorter press is Enter, an equal or longer press
opens the contextual menu. Shift+right-click and MBUTTONPAN=0 middle click open
the object-snap menu independently. Menu macros use the same command routing as
the keyboard. Commands owned by later phases remain explicit pending commands.
Default/edit/command Korean menu ordering and mnemonic letters are reference
assumptions pending comparison with an installed Korean release.

Endpoint, midpoint, center, quadrant, intersection, nearest and None are one-shot
snap choices. They do not write OSMODE or enter undo; a rejected point retains the
choice, successful typed or picked input consumes it, and cancellation clears it.
Held temporary overrides take precedence until release. Unsupported snap modes
print a localized pending message. Exact no-snap-found Korean wording and held-key
precedence require reference comparison. Non-point prompts receive the normal
`_ENDP`-style input instead of storing a hidden override.

Status coordinates are hidden initially, as documented by Autodesk. COORDS
cycles 0 (last accepted point), 1 (live absolute), 2 (relative distance/angle
during a point prompt); formatting reads drawing unit/angle settings. Session
callbacks publish the actual constrained accepted point and keep drawings
isolated, and synchronize the LASTPOINT session variable. Geographic coordinates require the future geolocation host and are
explicitly unavailable. Right-click settings are focused menus; the full
DSETTINGS dialog remains Phase 04. Isoplane uses the existing F5 plane cycle.
Visibility customization is a profile preference. F1/HELP uses command registry
metadata and keeps an interrupted command active.

Official sources:

- [SHORTCUTMENU](https://help.autodesk.com/view/ACD/2026/ENU/?caas=caas%2Fdocumentation%2FCIV3D%2F2014%2FENU%2FfilesACD%2FGUID-27079CDD-85E0-4883-A961-82C8FC5C7F46-htm.html)
- [Right-click duration](https://help.autodesk.com/cloudhelp/2022/ENU/AutoCAD-Core/files/GUID-1F0CD64B-A9EC-437A-9EC3-E475D7A83DBA.htm)
- [Shortcut-menu contexts](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Customization/files/GUID-8AE6163C-BBB0-4862-96F1-EB49923E317D.htm)
- [Object snaps](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-8F5E5431-9EFB-414E-BC6D-2C65EFB2DAC3.htm)
- [Coordinate display](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-8E3F0C5A-ED83-4DD4-8AE6-FC1CE54533F6.htm)
- [Coordinate menu](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-A4EAB53A-AB2B-497D-8530-119552DF6238.htm)

## 2026-10-17: Phase 03 keyboard focus and ribbon keytips

Temporary override keys defer to text editors and modal UI, reset at prompt
boundaries and blur, and restore the remaining physical-key effect when a chord
key is released. Exact overlapping-key release behavior remains a reference
assumption. Alt displays application/ribbon/quick-access keytips with MENUBAR=0;
text composition and AltGr keep their normal input. The Korean documentation
confirms F and H/IN/AN/PA/VI/MA/O/GI/CO/ET; the command customization documentation
confirms LINE=LI. Other tool/file tips and this shell's quick-access numbering
are original mappings requiring comparison with the installed CUI workspace.
No Autodesk CUI or icon resources are bundled.

References: [Keytips](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-9404C7E3-7A99-428E-A185-9DBD3CCEE4CF.htm),
[ribbon command properties](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Customization/files/GUID-5DAC6811-BA2D-422D-9B2E-BC1E6C9A5C90.htm).

## 2026-10-16: Batch implementation and verify at each phase end

The user explicitly changed the development workflow to reduce repeated full
verification. Implement the requested phase's remaining milestones in batches.
During implementation, use typechecking and brief checks of changed core
behavior, with focused tests when needed for a bug or complex change. Add
meaningful test coverage alongside features, but do not run full suites merely
to start/resume a session or after each milestone.

Once that phase's implementation is finished, review all Build and Acceptance
requirements and run the complete required verification against the current
build. Fix failures and rerun affected checks; repeat full verification only
when justified by subsequent changes or unresolved concerns. Feature scope,
parity requirements and the final acceptance standard remain unchanged. Record
pending checks honestly and start the next phase only when requested.

This supersedes the earlier Phase 03 handoff that required full verification of
3.8 before starting 3.9. Implement 3.9 and 3.10 first, then include 3.8 in the
final Phase 03 verification. The root protocol, prompt copies, continuation
prompt and active handoffs are synchronized with this decision.

## 2026-10-16: Phase 03 keyboard bindings and temporary overrides (milestone 3.8)

Every function key and Ctrl shortcut of Reference B is one row of
`packages/input/src/shortcuts.ts`: a CUI-style macro (Ctrl+S `^C^C_QSAVE`,
Ctrl+1 `^C^C_PROPERTIES`, Ctrl+Z `^C^C_U`), a drafting toggle, or a shell action.
Keys resolve in AutoCAD's order: a focused text editor or input keeps its keys, an
open dialog blocks the rest, the command line handles typing, Enter/Space, Esc,
Ctrl+[ and history, and only then the global table runs. Macros for commands that
are not built yet print the registry's Korean not-implemented message; Ctrl+R
(viewport cycling) and Shift+Space at a selection prompt (cycling overlapping
objects) print an explicit pending message. Ctrl+J/Ctrl+M act as Enter, so they
repeat the last command at an empty prompt. Ctrl+Tab/Ctrl+Shift+Tab switch
drawings and Ctrl+PageUp/PageDown layout tabs. In the browser, keys the browser
reserves (Ctrl+N, Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PageUp/PageDown,
Ctrl+F4, F11) may be taken by the browser before HanCAD sees them; the desktop app
receives them.

Toggles share one implementation for F-keys, Ctrl keys, `^B ^D ^E ^G ^O ^T` in
macros and the status-bar buttons, and echo `<그리드 켜기>`-style lines (the Korean
wording is an assumption listed for comparison). They flip the variable the way
AutoCAD stores it: OSMODE and 3DOSMODE through their suppress bits (restoring the
default modes from 0), AUTOSNAP bits 8 and 16, DYNMODE, QPMODE and
SELECTIONCYCLING by sign, SNAPISOPAIR cycling left/top/right, PICKSTYLE bit 1.
Turning Ortho on turns polar tracking off and vice versa. All seven status-bar
buttons are now live; for aids whose behavior comes later (snap, polar, tracking,
dynamic input, dynamic UCS, isoplanes and others) only the variable changes, the
button tooltip says so and the first use in a session prints a note.

Temporary override keys (TEMPOVERRIDES=1) work at point prompts while nothing has
been typed, so Shift+2 still types "@" and Shift+, still types "<" inside a
coordinate. Shift alone toggles Ortho; Shift+A/' toggles and Shift+S/; enforces
running snaps; Shift+E/P, V/M and C/, force endpoint, midpoint and center; Shift+D/L
disable snaps and tracking; Shift+Q/], X/. and Z// toggle tracking, polar and
dynamic UCS. AutoCAD implements these as CUI key-down/key-up macros; HanCAD applies
the same effect as an effective-value layer read by drafting and snapping, so a
held key never writes drawing variables, enters undo or disturbs the active prompt.

## 2026-10-16: Phase 03 menu macros, DIESEL and MODEMACRO (milestone 3.7)

Ribbon buttons, menus, the recent-command list and the Delete key run AutoCAD
command macros. A bare command name becomes `^C^C_NAME`, so the history shows
`명령: _LINE` as AutoCAD does after a ribbon click; the "도면 전체 맞춤" button runs
AutoCAD's transparent `'_zoom _e`, so it zooms inside LINE and resumes it. A
macro is replayed through the same command-line routing as typed input: `^C`
cancels only when something is active (so a preselection survives `^C^C_ERASE`
at idle) and prints `*취소*` once; `;` and `^M` are Enter; a space is the
Spacebar (Enter, except at free-text prompts); `\` waits for one user answer
(typed entry, click or window selection); a macro ending in text gets AutoCAD's
automatic trailing space; `^Z` suppresses it; `*^C^C` restarts the macro after
each command that needed user input, until Esc or a command typed by the user.
`^B`/`^G`/`^O` toggle snap/grid/ortho through the status-bar toggles; `^P` toggles
the input echo (MENUECHO bits 1 and 4) and `^Q` hides the macro's history lines.
`^D`, `^E`, `^T`, `^V`, `^R`, `^]` and `=*` print an explicit "not supported yet"
message. Each step waits for React to commit the previous one (or 30 ms), so it
never acts on a stale prompt.

DIESEL follows the Autodesk function reference: arithmetic, comparisons, bitwise
and/or/xor, eq, if, nth, index, strlen, substr, upper, fix, rtos, angtos, getvar,
getenv, eval and edtime, at most ten parameters, quoted literals with doubled
quote marks, and the four error forms `$?`, `$(func,??)`, `$(func)??` and
`$(++)`. Undocumented details are assumptions listed for comparison: integers print
without decimals and reals with up to 15 significant digits; leading and trailing
spaces are ignored in numbers, names and eq; `$(if,0,x)` returns an empty string;
getenv has no HanCAD environment yet; the output limit is 4096 characters.
`$M=` output is replayed as macro text. MODEMACRO is evaluated on every status-bar
update and shown left of the toggles. DEVMACRO (development builds or
`?devtools=1`) runs a typed macro for tests. A command whose `nextPrompt` step sets
`text` gets a free-text prompt.

An apostrophe entry at the idle command prompt now runs the command normally,
without `>>` prompts or the transparent CMDACTIVE bit; the runner derives "a
command is running" from CMDACTIVE when the caller does not say.

## 2026-10-16: Phase 03 user PGP files, ALIASEDIT and REINIT (milestone 3.6)

The user's acad.pgp is merged over the built-in aliases (the user's definition
wins; the last definition in the file wins), and built-in aliases the user removes
are kept as a separate profile list, because PGP syntax cannot express a removal.
The file is chosen in ALIASEDIT. Where the browser provides the File System Access
API, HanCAD keeps a handle in IndexedDB: REINIT (PGP file option) and RE-INIT 16
re-read the file on disk, and ALIASEDIT writes edits back to it. Otherwise HanCAD
keeps a copy and REINIT reapplies that copy. Files are read as UTF-8 (with or
without BOM) or CP949, detected automatically, and written as UTF-8 per AGENTS.md;
whether the user's AutoCAD reads a rewritten UTF-8 acad.pgp with Korean comments is
listed for verification. ALIASEDIT edits change only the affected lines, so
comments and order survive. RE-INIT is reset to 0 after it triggers a reload, so
the next 16 reloads again.

REINIT prints nothing on success, as AutoCAD does; it reports unreadable lines,
denied file access and read failures. The dialog shows AutoCAD's digitizer options
disabled. ALIASEDIT (an Express Tools command in AutoCAD) is HanCAD's own dialog
with four tabs: command aliases (with built-in/user source), external commands
(one PGP line each), the AutoCorrect list (AutoCorrectUserDB.pgp entries) and the
synonym list (acadSynonymsGlobalDB.pgp form). Synonyms only add their command to
the suggestion list; they never become aliases. Autodesk's own synonym and
misspelling databases are not bundled. The Korean dialog wording is HanCAD's and is
listed for comparison.

## 2026-10-16: Phase 03 transparent commands (milestone 3.5)

An apostrophe entry at any prompt of a running command (a drawing tool, ZOOM/PAN
or a session prompt such as UNDO) starts a transparent command. The entry is
echoed after the outer prompt (`다음 점 지정 또는 [명령 취소(U)]: 'Z`), the
transparent command's prompts start with `>>`, and when it ends HanCAD prints
`LINE 명령 재개 중.` and shows the outer prompt again. The command window shows
the transparent command's name with its apostrophe (`'ZOOM`) while it runs; this
naming is an assumption. A transparent command does not become the command that
Enter repeats.

Owners: 'ZOOM/'PAN use the navigation session, 'DIST the measurement session
(which now takes input and picks before the command it interrupts), and
'SETVAR/'GETVAR/variable names a second "nested" prompt slot of the command
session, so they never overwrite the outer command's own prompt state. Other
transparent commands run through the same runner; unimplemented ones ('CAL,
'OSNAP, 'HELP until milestone 3.10) print the not-implemented message and the
outer command resumes. A non-transparent command, a second transparent command,
or a command interrupting another instance of itself prints
`** 해당 명령은 투명하게 호출할 수 없습니다 **` and the outer prompt stays.
Esc cancels the transparent command together with the command it interrupted
and prints `*취소*` once, as AutoCAD's Esc cancels the whole command stack.

LINE now follows the AGENTS.md prompt sequence: `[명령 취소(U)]` after the first
and second points, `[닫기(C)/명령 취소(U)]` from the third point, and C is
rejected before that. PLINE keeps its interim prompt until Phase 06.

## 2026-10-16: Phase 03 AutoComplete and input search options (milestone 3.4)

Suggestions come from one pure function (`suggestCommandInput`) over the command
registry and the system-variable catalog, so tests run headless. Tiers are exact
(the typed command, alias, learned correction or variable), prefix, mid-string and
AutoCorrect; within a tier the order is usage count (default) or alphabetical. An
alias puts its command first and submits the alias as typed, so prefixes keep
their meaning. Inside a running command only apostrophe input lists transparent
commands and system variables. UNDEFINEd commands are not listed.

Autodesk's help says that Enter runs the command at the top of the list. HanCAD
highlights the top suggestion, and Enter or Space submits it, only when what was
typed is not already a valid name and the user can see the suggestion: either
the inline completion is showing or the list has opened (INPUTSEARCHDELAY,
default 300 ms). Typing faster than the delay therefore runs what was typed. The
inline completion (the rest of the top prefix match, shown highlighted after the
caret) follows the -INPUTSEARCHOPTIONS description "automatically filled in on the
command line"; it starts at the second typed character, as AutoCAD 2014's
AutoAppend did. Backspace first removes the completion. Up/Down move through an
open list (otherwise they recall history), Tab and Shift+Tab cycle it, and Tab
switches to the separate system-variable list when that option is on.

AutoCorrect cannot ship Autodesk's misspelling database. HanCAD suggests catalog
names within edit distance 1 (names up to four letters) or 2 (five or more
letters, adjacent swaps counting once). A correction is counted when the user
accepts an AutoCorrect suggestion, or when an unknown entry is followed by a
command within that distance. After the threshold (default 3) the pair is
remembered in AutoCorrectUserDB.pgp form and resolves directly from then on.
Usage counts, learned corrections and the options are profile data in browser
storage, shared by all open drawings; only the delay is a system variable.

Defaults: AutoComplete, mid-string search, frequency order, AutoCorrect,
system-variable search and content search are on; "Separate Commands and System
Variables" is off; the correction threshold is 3. Content search results need
layers (Phase 08), text and dimension styles (Phases 10 and 11), hatches (Phase
12), blocks (Phase 13) and visual styles (Phase 21). Until then the dialog stores
the setting and says that results arrive with those phases. Synonym lists
(acadSynonymsGlobalDB.pgp) come with PGP import in milestone 3.6.

-INPUTSEARCHOPTIONS uses the official Korean yes/no prompts for each option. The
top-level option prompt, its keyword letters and the "[예(Y)/아니오(N)] <예>"
format are assumptions, and the official Korean delay prompt says seconds
(`지연 시간(초) 지정`) although the value is in milliseconds. Commands with their
own prompt sequence now share one mechanism: `CommandDefinition.nextPrompt`
returns the next prompt for the answers so far. UNDO and MREDO moved onto it, and
English keyword detection now reads capitals anywhere in a label (`eXit`).

## 2026-10-16: Phase 03 command window (milestone 3.3)

The default command window floats near the bottom of the drawing area, centered,
930 px wide with 25% transparency, as in AutoCAD 2013 and later. Its recent prompt
lines (CLIPROMPTLINES, default 3) stay visible after each entry and fade 5 seconds
later; Autodesk does not publish the delay, so 5 s is an assumption to measure.
The floating bar covers the drawing area the same way AutoCAD's does, so picks
under the bar hit the bar. Dragging the grip past the bottom edge docks the window;
a docked window shrinks the drawing area instead of covering it, shows a fixed
number of history lines and opens the text window on F2. When floating, F2
expands the history above the bar. Ctrl+F2 and TEXTSCR always open the text window,
GRAPHSCR closes it. The close button asks for confirmation; Ctrl+9 and
COMMANDLINEHIDE hide without asking, and Ctrl+9 or COMMANDLINE show the window
again. Placement and transparency are profile preferences, not drawing data.
The idle "명령:" prompt stays in the accessible text but is visually replaced by the
"명령 입력" placeholder, matching AutoCAD's empty floating bar.

E2E helpers that map model points to screen points shrink the extents view by
0.8X before picking, because the floating bar can cover objects at the bottom edge
of a ZOOM Extents view.

## 2026-10-16: Phase 03 input modes and command-line interpretation (milestone 3.2)

Every active prompt reports one input type: command, keyword, number, point,
osnap, selection, name, text or file. The first six use physical keys and treat
Space as Enter, so a Korean IME never reaches command syntax; Hangul that still
arrives through paste or composition is reversed to Dubeolsik keys. Names (layer
or block names, getstring without spaces) compose Korean in an editable element
but Space accepts, as in AutoCAD. Free text, file names and string system-variable
values (for example MODEMACRO) insert spaces and accept only on Enter.

`interpretCommandInput` is the single classifier shared by the headless runner and
the UI. At the command prompt it resolves command/alias, then PGP external command,
then system variable, otherwise unknown; an empty entry repeats the previous
non-transparent command. Inside a command only apostrophe input is a command. A
non-transparent command or a second transparent command while one is running prints
`** 해당 명령은 투명하게 호출할 수 없습니다 **`; the official Korean wording was not
found and is listed for review. An UNDEFINEd command stays unknown even when a
system variable has the same name. Browser mode cannot launch PGP external
commands and reports that they run only in the desktop app.

## 2026-10-16: Phase 03 command catalog and aliases (milestone 3.1)

The command registry is seeded from one catalog (`packages/commands/src/catalog/`)
of 372 commands. Each row carries the canonical name, Korean and English display
names, one-sentence Korean/English help text and the original phase that owns the
complete command. Korean AutoCAD keeps English command names, so the global name
(the `_` form) equals the canonical name. Catalog names/help stay authoritative
when an application hook registers the implementation, so ribbon, F1 help and
AutoComplete share one source. Display names follow GLOSSARY.md; the official
Korean command-reference index could not be retrieved from the Autodesk help TOC,
so the remaining Korean names and help sentences are HanCAD wording recorded for
reference review in PARITY_CHECKLIST.md.

Flags mirror ObjectARX registration: transparent, modal, pickfirst (USEPICKSET)
and no-undo-marker. Only U/UNDO/REDO/MREDO/HELP/GETVAR and the two HanCAD
diagnostic commands are no-undo; AutoCAD records other informational commands
in the undo history. The transparent, modal and pickfirst lists are documented
assumptions where Autodesk does not publish a table.

Reference B aliases remain the built-in core. 172 further pairs come from the
alternative/legacy/discontinued sections of an installed acad.pgp and are flagged
for comparison with the current release; HanCAD writes its own table rather than
bundling the Autodesk file. Reference B listed `GCON=GEOCONSTRAINT`; the actual
command is GEOMCONSTRAINT, so the alias and ribbon button use GEOMCONSTRAINT.
`ED` stays TEXTEDIT (current releases) rather than the older DDEDIT.

PGP state has three layers: built-in aliases, the user's acad.pgp (last definition
wins, user wins over built-in) and AutoCorrect entries below both. External
command lines (`name,executable,flags,[*]prompt,`) are parsed and kept. A user
alias to a command missing from the catalog registers an explicit not-implemented
placeholder instead of "unknown command", so the user's file never fails silently.
`docs/COMMANDS.md` is generated from the catalog and alias tables by
`pnpm docs:commands`; only the status column is hand-written, and
`pnpm docs:commands:check` (part of `pnpm test`) rejects drift.

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

## 2026-10-17: Geographic coordinate display without a location host

The coordinate shortcut menu disables Geographic because the current drawing host
has no geographic-location transform. Setting COORDS=3 through the command line
shows a localized unavailable-location message, never UCS coordinates presented
as latitude and longitude. Geographic conversion remains later geographic-data
work. Autodesk permits the Geographic menu option only for drawings containing
[geographic location information](https://help.autodesk.com/cloudhelp/2026/KOR/AutoCAD-Core/files/GUID-A4EAB53A-AB2B-497D-8530-119552DF6238.htm).

## 2026-10-17: Phase 04 shared point input and drafting aids

Typed, dynamic and queued input share unit parsing without display-precision
rounding. ANGBASE/SNAPANG remain radians internally; angle prompts use AUNITS.
POLARANG/POLARADDANG remain degrees. Absolute XY uses ELEVATION; relative XY
inherits its base's optional Z. Supported DXF output preserves stored doubles
and uses elevation/3D polyline records when required. This does not establish
lossless unsupported-object I/O or a full 3D editor.

OSNAPCOORD follows Autodesk's [keyboard/script priority table](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-Core/files/GUID-94994960-5E62-4044-BEF7-9CF91667F641.htm).
Explicit single-pick modifiers remain explicit requests; NON bypasses lookup.
Script origin is a queued-session contract, with SCRIPT execution still later
work. Canvas-origin dynamic entry uses DYNPICOORDS; explicit command-line entry
retains absolute defaults. Noneditable focus preserves physical-key IME safety.

Prepared curve geometry and a dynamic R-tree are cached between pointer moves.
Accepted provisional LINE segments update a small additional index rather than
rebuilding drawing geometry. Analytic conic/line intersections and numerical
spline refinement preserve WCS doubles; exact snaps precede mouse constraints.
Hover acquisition uses an initial 400 ms dwell, seven points and re-hover
removal. That timing, polar aperture sensitivity and near-tied candidate order
are reference assumptions awaiting installed-AutoCAD comparison. Explicit
extended INT retains its first object after an invalid second-object pick.

Natural conic extensions use full conics; open spline extension uses endpoint
tangents. The latter, circle-center radial Perpendicular ambiguity and rotated
quadrant conventions are tracked in PARITY_CHECKLIST. OSOPTIONS negative-Z
suppression requires an actually active dynamic UCS; enabling UCSDETECT alone
does not activate a face-based UCS in the current 2D editor.

DSETTINGS exposes all seven required tabs, retaining the previous tab and
selecting the relevant tab from status menus. Settings for future grips, 3D,
quick properties and selection cycling are stored as system variables; their
editors remain owned by later phases. [TRACKPATH](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-6BF0703C-28B2-4591-8337-34B8C20443F2.htm)
bit 1 shortens object tracking paths; bit 2 hides polar paths.
[DYNTOOLTIPS](https://help.autodesk.com/cloudhelp/2022/ENU/AutoCAD-Core/files/GUID-52163CC6-858B-4656-82D1-372D09E3F7DC.htm)
separates value-only tooltip appearance from all drafting tooltips. No external
package upgrades were selected; the frozen workspace lockfile check passed.

Detailed geometry, coordinate and UI reference evidence and focused results are
in phase04-snap-notes.md, phase04-coordinate-notes.md and phase04-dynamic-notes.md.
The phase's final acceptance evidence is owned by PROGRESS.md.

The final integration audit adds canonical GRID/SNAP/ORTHO/ISOPLANE/ISODRAFT
prompt sequences and SNAPGRIDLEGACY (profile, default 0). Idle grid snapping is
shown only when Legacy is enabled; point-prompt snapping remains the default.
Grid constraints move the displayed crosshair independently of AutoSnap magnet.
Natural conic tracking overlays clip to the viewport and bound their tessellation
work, preserving the visible cursor-side chord tolerance at extreme zoom.

Dynamic tooltips use the renderer's actual screen cursor after view changes.
Their empty space passes pointer events to the canvas; only their controls take
input. Explicit command-line focus clears dynamic locks and accepts initial
<angle literally; initial canvas Shift+Comma remains temporary Center. Dynamic
Tab navigation stays on noneditable canvas focus. Scalar field locks never
rewrite command keywords or point modifiers. The old typed-menu-snap E2E was
strengthened to reject a coordinate without its explicitly requested Midpoint,
then accept a valid Midpoint and verify one-pick expiry. OSNAPCOORD governs
running snaps; explicit request priority remains an installed-reference check.
