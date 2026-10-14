# CAD 클론 단계별 구현 프롬프트 (영문)

작성일: 2026-10-14

## 사용법

아래 프롬프트를 순서대로 AI 코딩 도구(Claude Code, Cursor, Codex 등)에 붙여넣으면, AutoCAD와 같은 명령·단축키·조작감을 가진 Windows용 CAD가 단계별로 만들어진다. 기준 제품은 AutoCAD 한국어판, 앱 UI는 한국어, 프롬프트와 코드는 영어다. 코드 블록 하나가 프롬프트 하나이므로 블록 내용을 통째로 복사해 붙여넣는다. 함께 받은 압축 파일(HanCAD_prompts.zip)에는 같은 내용이 파일별로 나뉘어 있다.

1. 빈 폴더를 만들고 그 폴더에서 AI 코딩 도구를 연다.
2. 첫 세션에는 MASTER PROMPT, Reference A, Reference B, Phase 0을 한 메시지로 함께 붙여넣는다. AI가 마스터 프롬프트를 `AGENTS.md`로, Reference A·B를 `docs/` 아래 파일로 저장하고, 이후 세션은 그 파일을 읽고 시작한다.
3. 각 Phase가 끝나면 앱을 직접 실행해 그 Phase의 Acceptance 항목을 손으로 확인한 뒤 다음 Phase를 붙여넣는다. 순서는 건너뛰지 않는다.
4. 한 Phase가 한 세션에 안 끝나면 AI가 `docs/PROGRESS.md`에 남긴 지점부터 맨 아래 "이어하기" 프롬프트로 계속한다.
5. 버그는 "버그 수정" 프롬프트에 증상을 한국어로 적어 붙인다. AI는 항상 한국어로 보고하도록 마스터 프롬프트에 지정해 두었다.

있으면 사용감이 더 같아지는 준비물:

- 쓰고 있는 AutoCAD의 `acad.pgp`(명령 별칭 파일)와 SHX 글꼴 폴더 경로. Phase 3과 Phase 10에서 그대로 가져와 손에 익은 단축키와 글꼴이 그대로 동작한다.
- DWG 저장용 ODA File Converter(무료, Windows x64). 없어도 DXF는 전부 되고, DWG 읽기는 LibreDWG로 대신한다.
- 비교용 실제 도면(DWG/DXF) 10~20개. Phase 9와 Phase 24의 호환성 테스트에 쓴다.

기대치: Phase 0~9를 마치면 기본 작도·수정·도면층·DXF 저장이 되는 2D CAD가 되고, Phase 10~16에서 문자·치수·해치·블록·출력까지 실무 도면이 갖춰진다. Phase 17~23은 고급 기능과 3D, 24~25는 안정화와 설치 파일이다. AutoCAD 전체와 완전히 같아지는 것은 장기 작업이라, 모든 Phase는 끝날 때마다 실행 가능한 상태로 남도록 짜여 있다. 앱 이름은 임시로 `HanCAD`이며 마스터 프롬프트 한 곳만 고치면 바뀐다.

## MASTER PROMPT — AGENTS.md

프로젝트 전체 규칙이다. 첫 세션에 한 번 붙여넣으면 AI가 `AGENTS.md`로 저장하고 매 세션 다시 읽는다. 스택은 Tauri 2 + TypeScript + WebGL2, 무거운 기하 연산은 Rust/WASM, DWG는 ODA File Converter와 LibreDWG로 잡았다.

```text
# HanCAD — Project Constitution
(Save this whole text verbatim as AGENTS.md in the repository root. Re-read it at the start of every session.)

## 0. Mission
Build HanCAD (working title), a Windows-first desktop CAD application whose workflow and feel are indistinguishable from AutoCAD (current releases, 2024–2027, Korean edition) for an experienced Korean AutoCAD user. Indistinguishable means the same command names, aliases, option keywords, prompt sequences, defaults, system variables, keyboard shortcuts, mouse behavior, object snaps, tracking, selection rules, grip editing, undo behavior, and DWG/DXF compatibility. AutoCAD muscle memory must transfer with zero retraining.

Language rules:
- The app UI is Korean (ko-KR) by default, with an English (en-US) switch.
- I, the person giving you these prompts, am Korean. Always report to me in Korean.
- Code, identifiers, code comments, commit messages, and docs are in English, except Korean UI strings and docs/GLOSSARY.md.

## 1. Reference behavior
- Reference: AutoCAD for Windows with the metric template (acadiso.dwt) and Korean-edition prompts and UI terms. When unsure, follow Autodesk's official documentation (the Korean help pages for wording). Record every assumption in docs/DECISIONS.md and add it to docs/PARITY_CHECKLIST.md so I can verify it in real AutoCAD.
- Never invent behavior because it seems nicer. Improvements go behind an option that defaults to AutoCAD behavior. The Korean-input fixes in section 3 are the only exception and are on by default.
- Do not use Autodesk trademarks, logos, icons, or bundled Autodesk files (fonts, templates, .cuix, .lin, .pat, .ctb). Draw original icons in a similar flat style and write original resource files that use the standard names and patterns. At runtime I may point HanCAD at my own files (acad.pgp, SHX fonts, .lin, .pat, .ctb, .lsp).

## 2. Parity rules (the feel)
1. Command line first. Every feature is a command with a canonical English name. Ribbon, menus, toolbars, palettes, and shortcuts only run commands, as macros like ^C^C_LINE. Prefixes work like AutoCAD: _ global name, . built-in (ignores UNDEFINE), - command-line version without a dialog, ' transparent (its prompts start with >>). UNDEFINE and REDEFINE work.
2. Prompts follow AutoCAD exactly: order, options, keyword letters, defaults in <angle brackets>, and remembered values (OFFSETDIST, FILLETRAD, CIRCLERAD, CHAMFERA/CHAMFERB, TEXTSIZE, and so on). Korean prompt text follows Korean AutoCAD phrasing, for example:
   LINE: 첫 번째 점 지정: → 다음 점 지정 또는 [명령 취소(U)]: → 다음 점 지정 또는 [닫기(C)/명령 취소(U)]:
   CIRCLE: 원에 대한 중심점 지정 또는 [3점(3P)/2점(2P)/Ttr - 접선 접선 반지름(T)]: → 원의 반지름 지정 또는 [지름(D)] <10.0000>:
   Keywords are clickable in the command line, accepted as the English word or the letter in parentheses, and listed in the dynamic-input down-arrow menu.
3. Enter, Space, and (configurable) right-click end or repeat commands exactly as in AutoCAD. Esc cancels and prints *취소*; a second Esc clears the selection. Up/Down recall input history. A bare number at a point prompt is direct distance entry along the cursor direction.
4. Every AutoCAD system variable that affects behavior exists with the same name, type, range, metric default, and scope (saved in drawing, saved in profile, or not saved). SETVAR, GETVAR, and typing a variable name at the command line work. Code reads sysvars; never hardcode something AutoCAD controls with a sysvar.
5. The visual language matches: crosshair with pickbox, AutoSnap marker shapes and tooltips, dotted tracking paths, window selection (left to right, blue, solid) versus crossing (right to left, green, dashed), lasso, grips (blue, hover, red when hot), selection preview, command preview, ACI color 7 shown white on dark and black on light backgrounds, the dark model-space background (RGB 33,40,48, configurable to black), and the UCS icon.
6. Undo matches: one command is one undo group; U inside LINE or PLINE removes only the last segment; UNDO with Auto, Control, BEgin, End, Mark, Back, and a number; REDO, MREDO, and OOPS.
7. Files round-trip: a DWG or DXF opened and saved keeps everything, including entities and objects HanCAD does not support yet (kept as opaque proxies), XDATA, extension dictionaries, reactors, and handles.

## 3. Korean-user requirements (on by default)
- IME-safe command input. In AutoCAD, Korean users constantly hit the 한/영 mode problem. In HanCAD, whenever the active prompt expects a command name, keyword, number, coordinate, or osnap override, input comes from physical keys (KeyboardEvent.code mapped through US QWERTY). Keyboard focus stays on a non-editable element, so the IME stays inactive. Any Hangul that still arrives, as jamo or composed syllables, is converted back to the Dubeolsik keys that produced it (ㅣ→L, 채→CO, ㅣㅑㅜㄷ→LINE). When a prompt expects free text (layer or block names, TEXT and MTEXT content, attribute values, file names, FIND strings), switch to an editable input so Korean composition works, with the composition shown inline at the caret.
- Korean text everywhere: Korean TrueType fonts (맑은 고딕; 굴림, 돋움, 바탕 from .ttc collections; 나눔 fonts), SHX fonts with BigFonts (whgtxt.shx, whgdtxt.shx, and others) loaded from user support paths, and a missing-font substitution dialog like AutoCAD's.
- Encodings: DXF up to R2004 stores text in $DWGCODEPAGE (ANSI_949 = CP949); R2007 and later use UTF-8. Decode \U+XXXX and MIF \M+nXXXX (n=3 Wansung/CP949, n=4 Johab). Read .lsp, .scr, .pgp, .lin, .pat, .dcl, and .csv as UTF-8 (with or without BOM) or CP949, detected automatically. Write UTF-8 unless I choose otherwise.
- Defaults: metric (MEASUREMENT=1, INSUNITS=4 for millimeters), ISO-25 dimension style, A-series paper (A0 to A4), scale lists covering 1:1 to 1:1200, and Korean date formats in fields and plot stamps.
- UI terms match Korean AutoCAD; see docs/GLOSSARY.md. Command names stay English.

## 4. Technology stack
Verify the latest stable versions before installing, pin them, and record the choices in docs/DECISIONS.md.
- Desktop shell: Tauri 2. Rust handles OS integration only: files, dialogs, font enumeration, printers, clipboard formats, external converters, autosave and crash recovery, and Windows IME helpers if needed.
- App: TypeScript in strict mode, Vite, pnpm workspaces. React is used only for UI chrome (ribbon, palettes, dialogs). The drawing canvas never renders through React.
- Renderer: a custom WebGL2 renderer, with an optional WebGPU backend later. Use instanced screen-space wide lines for lineweights, shader-computed linetype dashes from per-vertex cumulative distance, and analytic or adaptively tessellated arcs. Render relative to eye with a floating origin, so coordinates in the hundreds of millions of millimeters (Korean TM survey coordinates) do not jitter.
- Geometry: double precision in TypeScript. Hot paths are Rust compiled to WASM: cavalier_contours for offsets and booleans of line-and-arc polylines (its bulge is limited to half circles, so split larger arcs; its offsets only produce rounded joins, so build the extended corners of OFFSETGAPTYPE 0 and the chamfered corners of 2 on top of it), boundary and hatch region detection, and large-file parsing if profiling shows a need.
- Spatial index: a dynamic R-tree.
- 2D constraint solver (Phase 18): @salusoft89/planegcs (FreeCAD's PlaneGCS as WASM) or an equivalent.
- 3D kernel (Phase 22): OpenCASCADE (OCCT) behind a Kernel3D interface. Choose between a maintained WASM build and a native OCCT bridge from Rust at that phase.
- DWG: first choice is the free ODA File Converter, if installed, called through its command-line interface for DWG<->DXF in any version. Fallback is LibreDWG compiled to WASM (@mlightcad/libredwg-web, GPL-3.0) for reading, isolated in its own package and Web Worker. This is a personal build; keep GPL code separate.
- PDF: our own vector PDF writer with CJK font subsetting; pdf.js for PDF underlays and PDFIMPORT.
- Tests: Vitest for unit tests, headless command-script tests, renderer golden images, a DXF round-trip corpus, and Playwright end-to-end tests against the browser build.
- The app runs in two modes: the Tauri desktop app, and a plain browser dev mode with OS features mocked behind a Platform interface (for E2E tests and fast iteration).

## 5. Architecture rules
- Monorepo layout (rename if needed, keep the boundaries): apps/desktop (Tauri), packages/db (drawing database), packages/geom, packages/sysvars, packages/render, packages/input (command line, keys, mouse, IME), packages/editor (Editor API, jigs, selection, osnap, tracking), packages/commands (one folder per command), packages/ui, packages/io-dxf, packages/io-dwg, packages/io-pdf, packages/fonts, packages/lisp, packages/kernel3d, crates/* (Rust compiled to WASM), docs/.
- The drawing database mirrors AutoCAD's. A Database owns symbol tables (BLOCK_RECORD, LAYER, LTYPE, STYLE, DIMSTYLE, UCS, VIEW, VPORT, APPID) and a named object dictionary (GROUP, LAYOUT, MLINESTYLE, MLEADERSTYLE, TABLESTYLE, SCALE, PLOTSETTINGS, XRECORD, and so on). Every object has a persistent hex handle, an owner, reactors, an extension dictionary, and XDATA. Entity fields map one-to-one to DXF group codes, so entget/entmod/entmake, DXF I/O, and the Properties palette share one schema.
- Commands are async coroutines against an Editor API that mirrors AutoCAD's: getPoint, getCorner, getDistance, getAngle, getOrientation, getInteger, getReal, getString, getKeyword, getSelection, getEntity, getNestedEntity. They take InitGet-style flags (no null, no zero, no negative, arbitrary input, keyword list) and use jigs for rubber-band previews. Every command also runs headless from an input queue (scripts, LISP (command ...), tests) with identical results.
- One transaction per command. The undo journal stores before and after states. Events (added, modified, erased) drive the renderer, associativity, and later LISP reactors.
- Performance budgets: 60 fps pan and zoom with 1,000,000 simple entities; under 16 ms for a typical edit; under 10 s to open a 50 MB DXF; under 4 ms of osnap and hover work per mouse move.
- Keep files under about 400 lines. No any. Geometry functions are pure. No silent stubs: an unimplemented command prints a Korean message in the style of AutoCAD's unknown-command message and is tracked in docs/COMMANDS.md.

## 6. Repository docs you maintain
AGENTS.md (this file), docs/ARCHITECTURE.md, docs/PROGRESS.md (phase status, current milestone, exact next step), docs/COMMANDS.md (command, aliases, options implemented, status, tests), docs/SYSVARS.md, docs/SHORTCUTS.md (Reference B), docs/GLOSSARY.md (Reference A), docs/DECISIONS.md, docs/PARITY_CHECKLIST.md (items for me to verify in real AutoCAD).

## 7. Standard Phase Protocol (applies to every phase prompt)
1. Read AGENTS.md, docs/PROGRESS.md, docs/ARCHITECTURE.md, and the docs the phase touches. Run all tests first; if anything fails, fix it before new work.
2. Write a plan in docs/PROGRESS.md as milestones (N.1, N.2, ...), each small enough for one session and each leaving the app runnable.
3. For each milestone: implement, add tests, run lint, typecheck, and all tests, launch the app and exercise the feature, update the docs, then commit (feat(phaseN.M): ...).
4. If your context is running low, stop at a clean commit and write the exact next step in docs/PROGRESS.md.
5. A phase is done when every Acceptance item passes, nothing regressed, and the docs are current. Then report to me in Korean: what was built, how to test it by hand (keystroke by keystroke), what still differs from AutoCAD, and what comes next.
6. Ask me (in Korean) only about decisions that are mine to make. Otherwise choose the AutoCAD-faithful option and log it in docs/DECISIONS.md.
```

## Reference A — 한국어 UI 용어집

앱 화면의 한국어를 한국어판 AutoCAD 용어와 맞추기 위한 기준표다. 첫 세션에 함께 붙여넣으면 `docs/GLOSSARY.md`로 저장되고, 목록에 없는 용어는 AI가 Autodesk 한국어 도움말을 찾아 추가한다.

```text
# Reference A — Korean AutoCAD UI glossary
(Save as docs/GLOSSARY.md. Use these exact Korean terms in the UI. If a term is missing or doubtful, use the term from Autodesk's Korean AutoCAD help, add it here, and list it in docs/PARITY_CHECKLIST.md.)

## Shell
| English | 한국어 UI |
|---|---|
| Command line / "Command:" / "Type a command" | 명령행 / 명령: / 명령 입력 |
| *Cancel* | *취소* |
| Model / Layout tabs | 모형 / 배치1, 배치2 |
| Model space / Paper space | 모형 공간 / 도면 공간 |
| Viewport | 뷰포트 |
| Ribbon tabs | 홈, 삽입, 주석, 파라메트릭, 뷰, 관리, 출력, 애드인, 공동 작업, Express Tools |
| Home tab panels | 그리기, 수정, 주석, 도면층, 블록, 특성, 그룹, 유틸리티, 클립보드, 뷰 |
| Quick Access Toolbar / Application menu | 신속 접근 도구막대 / 응용프로그램 메뉴 |
| Workspace | 작업공간 |
| Tool Palettes / DesignCenter | 도구 팔레트 / 디자인센터 |
| Properties / Quick Properties | 특성 / 빠른 특성 |
| Options / Drafting Settings / Units | 옵션 / 제도 설정 / 단위 |
| Undo / Redo | 명령 취소 / 명령 복구 |
| Start tab | 시작 |

## Properties
| English | 한국어 UI |
|---|---|
| Layer / Layer Properties Manager | 도면층 / 도면층 특성 관리자 |
| Color / Linetype / Lineweight / Transparency | 색상 / 선종류 / 선가중치 / 투명도 |
| Plot style / Plot style table | 플롯 스타일 / 플롯 스타일 테이블 |
| On / Freeze / Lock / Plot / New VP Freeze / Description | 켜기 / 동결 / 잠금 / 플롯 / 새 VP 동결 / 설명 |
| ByLayer / ByBlock | ByLayer / ByBlock (kept in English) |
| *VARIES* | *다양함* |
| Text style / Dimension style | 문자 스타일 / 치수 스타일 |
| Multileader style / Table style | 다중 지시선 스타일 / 테이블 스타일 |
| Annotative / Annotation scale | 주석 / 주석 축척 |

## Status bar
| English | 한국어 UI |
|---|---|
| Grid / Snap / Ortho | 그리드 / 스냅 / 직교 모드 |
| Polar tracking / Isometric drafting | 극좌표 추적 / 등각투영 제도 |
| Object snap tracking / Object snap / 3D object snap | 객체 스냅 추적 / 객체 스냅 / 3D 객체 스냅 |
| Lineweight / Transparency / Selection cycling | 선가중치 / 투명도 / 선택 순환 |
| Dynamic UCS / Dynamic input / Quick properties | 동적 UCS / 동적 입력 / 빠른 특성 |
| Annotation visibility / Clean screen | 주석 가시성 / 화면 정리 |

## Object snaps (marker tooltips)
끝점(END), 중간점(MID), 중심(CEN), 기하학적 중심(GCE), 노드(NOD), 사분점(QUA), 교차점(INT), 연장선(EXT), 삽입(INS), 직교(PER), 접점(TAN), 근처점(NEA), 가상 교차점(APP), 평행(PAR), 없음(NON)

## Selection
| English | 한국어 UI |
|---|---|
| Select objects: / Specify opposite corner: | 객체 선택: / 반대 구석 지정: |
| n found | n개를 찾음 |
| Window / Crossing | 윈도우 / 걸침 |
| Window polygon / Crossing polygon / Fence / Lasso | 윈도우 폴리곤 / 걸침 폴리곤 / 울타리 / 올가미 |
| All / Last / Previous / Add / Remove / Undo | 모두 / 최종 / 이전 / 추가 / 제거 / 명령 취소 |

## Common prompt fragments
첫 번째 점 지정, 다음 점 지정, 기준점 지정, 두 번째 점 지정, 반대 구석 지정, 반지름 지정, 지름(D), 간격띄우기 거리 지정, 통과점(T), 지우기(E), 도면층(L), 닫기(C), 명령 취소(U), 다중(M)

## Command display names (ribbon, tooltips, Help)
| Command | 한국어 |
|---|---|
| LINE, PLINE, CIRCLE, ARC | 선, 폴리선, 원, 호 |
| RECTANG, POLYGON, ELLIPSE, SPLINE | 직사각형, 폴리곤, 타원, 스플라인 |
| XLINE, RAY, POINT, DONUT | 구성선, 광선, 점, 도넛 |
| DIVIDE, MEASURE, REVCLOUD, WIPEOUT | 등분할, 길이 분할, 구름형 리비전, 가리기 |
| HATCH, GRADIENT, BOUNDARY, REGION, HELIX | 해치, 그라데이션, 경계, 영역, 나선 |
| MOVE, COPY, ROTATE, MIRROR, SCALE, STRETCH | 이동, 복사, 회전, 대칭, 축척, 신축 |
| TRIM, EXTEND, OFFSET, FILLET, CHAMFER, BLEND | 자르기, 연장, 간격띄우기, 모깎기, 모따기, 혼합 곡선 |
| ARRAYRECT, ARRAYPOLAR, ARRAYPATH | 직사각형 배열, 원형 배열, 경로 배열 |
| ERASE, EXPLODE, BREAK, BREAKATPOINT, JOIN | 지우기, 분해, 끊기, 점에서 끊기, 결합 |
| LENGTHEN, ALIGN, PEDIT, SPLINEDIT | 길이 조정, 정렬, 폴리선 편집, 스플라인 편집 |
| MATCHPROP, DRAWORDER, OVERKILL | 특성 일치, 그리기 순서, 중복 객체 삭제 |
| TEXT, MTEXT | 단일 행 문자, 여러 줄 문자 |
| DIMLINEAR, DIMALIGNED, DIMANGULAR, DIMARC | 선형, 정렬, 각도, 호 길이 |
| DIMRADIUS, DIMDIAMETER, DIMJOGGED, DIMORDINATE | 반지름, 지름, 꺾기, 세로좌표 |
| DIMBASELINE, DIMCONTINUE, QDIM | 기준선, 계속, 빠른 치수 |
| MLEADER, TABLE | 다중 지시선, 테이블 |
| BLOCK, INSERT, BEDIT, ATTDEF | 블록 작성, 삽입, 블록 편집기, 속성 정의 |
| XREF, LAYER | 외부 참조, 도면층 특성 |
| ZOOM, PAN, 3DORBIT | 줌, 초점이동, 궤도 |
| DIST, AREA, LIST, MEASUREGEOM, QUICKCALC | 거리, 면적, 리스트, 측정, 빠른 계산기 |
| PLOT, PAGESETUP, PURGE | 플롯, 페이지 설정 관리자, 소거 |
```

## Reference B — 단축키·명령 별칭·마우스 기준표

AutoCAD의 기본 단축키, 임시 재지정 키, 마우스 동작, 좌표 입력 문법, acad.pgp 핵심 별칭을 모은 표다. 첫 세션에 함께 붙여넣으면 `docs/SHORTCUTS.md`로 저장되며, 내 acad.pgp를 가져오면 그것이 우선한다.

```text
# Reference B — Shortcuts, aliases, mouse behavior, input syntax
(Save as docs/SHORTCUTS.md. Every binding here must work. Bindings whose command is not built yet must still be registered and print the Korean not-implemented message.)

## Function keys
F1 Help · F2 expanded command history · F3 running object snaps · F4 3D object snap · F5 cycle isoplane · F6 dynamic UCS · F7 grid · F8 ortho · F9 snap · F10 polar tracking · F11 object snap tracking · F12 dynamic input

## Ctrl shortcuts
Ctrl+0 clean screen · Ctrl+1 Properties · Ctrl+2 DesignCenter · Ctrl+3 Tool Palettes · Ctrl+4 Sheet Set Manager · Ctrl+6 dbConnect · Ctrl+7 Markup Set Manager · Ctrl+8 QuickCalc · Ctrl+9 command line on/off
Ctrl+A select all · Ctrl+Shift+A toggle group selection · Ctrl+B snap · Ctrl+C copy · Ctrl+Shift+C copy with base point · Ctrl+D dynamic UCS · Ctrl+E cycle isoplane · Ctrl+F running object snaps · Ctrl+G grid · Ctrl+H PICKSTYLE · Ctrl+Shift+H hide/show palettes · Ctrl+I coordinate display · Ctrl+Shift+I infer constraints · Ctrl+J repeat last command · Ctrl+K hyperlink · Ctrl+L ortho · Ctrl+M repeat last command · Ctrl+N new · Ctrl+O open · Ctrl+P plot · Ctrl+Shift+P quick properties · Ctrl+Q quit · Ctrl+R cycle layout viewports · Ctrl+S save · Ctrl+Shift+S save as · Ctrl+T tablet · Ctrl+U polar · Ctrl+V paste · Ctrl+Shift+V paste as block · Ctrl+W selection cycling · Ctrl+X cut · Ctrl+Y redo · Ctrl+Z undo · Ctrl+[ and Ctrl+\ cancel · Ctrl+Tab / Ctrl+Shift+Tab next / previous drawing · Ctrl+Page Up / Ctrl+Page Down previous / next layout tab · Ctrl+F4 close drawing
Plain keys: Enter and Space accept or repeat · Esc cancel · Delete erase selection · Up/Down command history · Shift+Space cycle overlapping objects · Alt shows ribbon key tips

## Temporary override keys (TEMPOVERRIDES=1; hold to apply, release to restore; both key sets work)
Shift: toggle ortho · Shift+A or Shift+': toggle object snap · Shift+S or Shift+;: enforce object snap · Shift+E or Shift+P: endpoint override · Shift+V or Shift+M: midpoint override · Shift+C or Shift+,: center override · Shift+D or Shift+L: disable all snapping and tracking · Shift+Q or Shift+]: toggle object snap tracking · Shift+X or Shift+.: toggle polar tracking · Shift+Z or Shift+/: toggle dynamic UCS

## Mouse
Left click: pick or select. Left drag: left-to-right window, right-to-left crossing. Press-drag-release: lasso (PICKAUTO). Shift+click: remove from selection. Ctrl+click: subobject selection (polyline segments; solid faces, edges, vertices).
Right click: shortcut menu or Enter, per right-click customization (SHORTCUTMENU, time-sensitive right-click with SHORTCUTMENUDURATION). Shift+right click: object snap menu.
Wheel: zoom at cursor (ZOOMFACTOR, ZOOMWHEEL). Middle drag: pan (MBUTTONPAN=1). Middle double-click: zoom extents. Shift+middle drag: orbit.
Double-click an object: per double-click actions (DBLCLKEDIT/CUI) — TEXT, MTEXT, and dimension text edit in place; polyline opens PEDIT; hatch opens HATCHEDIT; block opens Edit Block Definition; block with attributes opens EATTEDIT; xref opens REFEDIT.
Grips: click a grip to make it hot; Space/Enter cycles 신축 → 이동 → 회전 → 축척 → 대칭; Shift+click selects several hot grips; Ctrl cycles multifunctional grip options and toggles copy mode; right-click on a hot grip opens the grip menu.

## Point input syntax
x,y · x,y,z · @dx,dy (relative) · @dist<angle · dist<angle (absolute polar) · #x,y (absolute when dynamic input defaults to relative) · <angle (angle override) · direct distance entry (type a number while the cursor shows the direction) · .X .Y .Z .XY .XZ .YZ point filters · FROM (FRO) base point plus offset · M2P or MTP midpoint between two points · TT temporary tracking point · TK tracking · spherical @dist<angle<angle · cylindrical @dist<angle,z

## Object snap overrides typed at point prompts
END, MID, CEN, GCE, NOD, QUA, INT, EXT, INS, PER, TAN, NEA, APP, PAR, NON, FROM, M2P, TT

## Keywords at Select objects (객체 선택:)
W, C, BOX, ALL, F, WP, CP, G, A, R, M, P, U, AU, SI, SU, O, L

## Dynamic input
Tab moves between fields · comma moves to the Y field in pointer input · < locks the angle · @ relative · # absolute · Down arrow opens the options menu · Enter accepts

## Default command aliases (core of acad.pgp)
Load these as the built-in default. Import the user's acad.pgp with identical syntax; the user's file wins on conflicts.
3A=3DARRAY, 3DO=3DORBIT, 3DW=3DWALK, 3F=3DFACE, 3M=3DMOVE, 3P=3DPOLY, 3R=3DROTATE, 3S=3DSCALE
A=ARC, AA=AREA, AC=BACTION, ADC=ADCENTER, AL=ALIGN, AP=APPLOAD, AR=ARRAY, ATE=ATTEDIT, -ATE=-ATTEDIT, ATT=ATTDEF, -ATT=-ATTDEF
B=BLOCK, -B=-BLOCK, BC=BCLOSE, BE=BEDIT, BH=HATCH, BO=BOUNDARY, -BO=-BOUNDARY, BR=BREAK, BS=BSAVE, BVS=BVSTATE
C=CIRCLE, CBAR=CONSTRAINTBAR, CH=PROPERTIES, -CH=CHANGE, CHA=CHAMFER, CLI=COMMANDLINE, CO=COPY, COL=COLOR, CP=COPY, CYL=CYLINDER
D=DIMSTYLE, DAL=DIMALIGNED, DAN=DIMANGULAR, DAR=DIMARC, DBA=DIMBASELINE, DC=ADCENTER, DCE=DIMCENTER, DCO=DIMCONTINUE, DCON=DIMCONSTRAINT, DDI=DIMDIAMETER, DED=DIMEDIT, DELCON=DELCONSTRAINT, DI=DIST, DIMTED=DIMTEDIT, DIV=DIVIDE, DJL=DIMJOGLINE, DJO=DIMJOGGED, DLI=DIMLINEAR, DO=DONUT, DOR=DIMORDINATE, DOV=DIMOVERRIDE, DR=DRAWORDER, DRA=DIMRADIUS, DRE=DIMREASSOCIATE, DS=DSETTINGS, DST=DIMSTYLE, DT=TEXT, DV=DVIEW, DX=DATAEXTRACTION
E=ERASE, ED=TEXTEDIT, EL=ELLIPSE, EPDF=EXPORTPDF, ER=EXTERNALREFERENCES, EX=EXTEND, EXIT=QUIT, EXP=EXPORT, EXT=EXTRUDE
F=FILLET, FI=FILTER, FSHOT=FLATSHOT
G=GROUP, -G=-GROUP, GCON=GEOCONSTRAINT, GD=GRADIENT
H=HATCH, -H=-HATCH, HE=HATCHEDIT, HI=HIDE
I=INSERT, -I=-INSERT, IAD=IMAGEADJUST, IAT=IMAGEATTACH, ICL=IMAGECLIP, IM=IMAGE, IMP=IMPORT, IN=INTERSECT, INF=INTERFERE, IO=INSERTOBJ
J=JOIN, JOG=DIMJOGGED
L=LINE, LA=LAYER, -LA=-LAYER, LAS=LAYERSTATE, LE=QLEADER, LEAD=LEADER, LEN=LENGTHEN, LI=LIST, LO=-LAYOUT, LS=LIST, LT=LINETYPE, -LT=-LINETYPE, LTS=LTSCALE, LW=LWEIGHT
M=MOVE, MA=MATCHPROP, ME=MEASURE, MEA=MEASUREGEOM, MI=MIRROR, ML=MLINE, MLD=MLEADER, MLE=MLEADEREDIT, MLS=MLEADERSTYLE, MO=PROPERTIES, MS=MSPACE, MT=MTEXT, MV=MVIEW
O=OFFSET, OP=OPTIONS, ORBIT=3DORBIT, OS=OSNAP, -OS=-OSNAP
P=PAN, -P=-PAN, PA=PASTESPEC, PAR=PARAMETERS, PARAM=BPARAMETER, PE=PEDIT, PL=PLINE, PO=POINT, POFF=HIDEPALETTES, POL=POLYGON, PON=SHOWPALETTES, PR=PROPERTIES, PRE=PREVIEW, PRINT=PLOT, PS=PSPACE, PSOLID=POLYSOLID, PU=PURGE, -PU=-PURGE, PYR=PYRAMID
QC=QUICKCALC, QP=QUICKPROPERTIES, QVD=QVDRAWING, QVL=QVLAYOUT
R=REDRAW, RA=REDRAWALL, RE=REGEN, REA=REGENALL, REC=RECTANG, REG=REGION, REN=RENAME, -REN=-RENAME, REV=REVOLVE, RO=ROTATE, RR=RENDER
S=STRETCH, SC=SCALE, SCR=SCRIPT, SEC=SECTION, SET=SETVAR, SHA=SHADEMODE, SL=SLICE, SN=SNAP, SO=SOLID, SP=SPELL, SPE=SPLINEDIT, SPL=SPLINE, SPLANE=SECTIONPLANE, SSM=SHEETSET, ST=STYLE, SU=SUBTRACT
T=MTEXT, -T=-MTEXT, TB=TABLE, TEDIT=TEXTEDIT, TH=THICKNESS, TI=TILEMODE, TO=TOOLBAR, TOL=TOLERANCE, TOR=TORUS, TP=TOOLPALETTES, TR=TRIM, TS=TABLESTYLE
UC=UCSMAN, UN=UNITS, -UN=-UNITS, UNI=UNION
V=VIEW, -V=-VIEW, VP=DDVPOINT, -VP=VPOINT, VS=VSCURRENT, VSM=VISUALSTYLES
W=WBLOCK, -W=-WBLOCK, WE=WEDGE
X=EXPLODE, XA=XATTACH, XB=XBIND, -XB=-XBIND, XC=XCLIP, XL=XLINE, XR=XREF, -XR=-XREF
Z=ZOOM
Complete the remaining aliases from the acad.pgp of the current AutoCAD release (Autodesk publishes the full list), add each one here, and flag any you could not verify in docs/PARITY_CHECKLIST.md.
```

## Phase 0 — 프로젝트 부트스트랩

도구 설치, 폴더 구조, 문서, 테스트 파이프라인을 갖춘 빈 HanCAD 창을 만드는 단계다. 마스터 프롬프트, Reference A·B와 함께 붙여넣는다.

```text
PHASE 0 — Bootstrap the project
This is the first session. Together with this prompt I pasted the master prompt, Reference A, and Reference B.

Goal: an empty but runnable HanCAD shell with the full toolchain, repository layout, docs, and test pipeline in place.

Do:
1. Save the master prompt verbatim as AGENTS.md, Reference A as docs/GLOSSARY.md, and Reference B as docs/SHORTCUTS.md. If you are Claude Code, also create CLAUDE.md telling you to read AGENTS.md; if you are Cursor, add a project rule that points to AGENTS.md.
2. Check this Windows PC for Git, Node LTS, pnpm, Rust stable with the wasm32-unknown-unknown target, wasm-bindgen/wasm-pack, MSVC Build Tools, and the WebView2 runtime. Install what is missing and tell me in Korean what you installed and why.
3. Create the monorepo from AGENTS.md section 5. Every package gets a README stating its responsibility and its allowed dependencies. Strict tsconfig, ESLint, Prettier, Vitest, Playwright. A Rust workspace with one crate compiled to WASM and called from TypeScript, with a test that proves the round trip.
4. Tauri 2 app: one main window titled HanCAD, minimum 1280x720, remembers its size and position. The same UI runs in a browser with pnpm dev:web, with OS features behind a Platform interface (files, dialogs, fonts, printers, clipboard) that is mocked in the browser.
5. Shell layout placeholders with Korean labels from docs/GLOSSARY.md: file tab bar (Drawing1.dwg), quick access toolbar, ribbon with the Korean tab names, a drawing canvas filling the center (background RGB 33,40,48), a floating command line at the bottom with the placeholder 명령 입력 and a history area above it, the 모형/배치1/배치2 tabs, and a status bar with placeholder toggles.
6. i18n: typed message catalogs (ko-KR default, en-US). No hardcoded UI strings anywhere.
7. Scripts: pnpm verify (lint, typecheck, unit tests, WASM build, E2E smoke), pnpm tauri dev, pnpm dev:web, pnpm build.
8. Docs skeletons per AGENTS.md section 6. Put this phase list in docs/PROGRESS.md: 0 Bootstrap; 1 Database, sysvars, undo; 2 Renderer and view navigation; 3 Command system, shortcuts, Korean IME; 4 Coordinate input and drafting aids; 5 Selection, grips, clipboard; 6 Draw commands; 7 Modify commands; 8 Layers and properties; 9 DXF/DWG I/O and recovery; 10 Text and fonts; 11 Dimensions and leaders; 12 Hatch, boundary, region; 13 Blocks, attributes, xrefs, images, underlays; 14 Layouts, viewports, plotting; 15 Inquiry, utilities, settings; 16 Advanced 2D; 17 Dynamic blocks; 18 Parametric constraints; 19 AutoLISP, scripts, DCL; 20 Customization and Express Tools; 21 3D foundation; 22 3D modeling; 23 Visualization and 3D documentation; 24 Performance and compatibility hardening; 25 Packaging and release.
9. git init, a .gitignore that ignores test-corpus/ (my private drawings), and the first commit.

Acceptance:
- [ ] pnpm tauri dev opens the Korean shell; pnpm dev:web shows the same in a browser.
- [ ] Typing any text in the command line and pressing Enter prints a Korean unknown-command message in AutoCAD style.
- [ ] pnpm verify passes, including the WASM round-trip test.
- [ ] AGENTS.md and all docs exist; docs/PROGRESS.md lists phases 0–25.
```

## Phase 1 — 도면 데이터베이스, 시스템 변수, 실행 취소

이후 모든 단계가 기대는 도면 데이터 구조를 AutoCAD와 같은 모양으로 만드는 단계다. 화면 변화는 거의 없고 테스트로 확인한다.

```text
PHASE 1 — Drawing database, system variables, undo, multiple documents
Follow the Standard Phase Protocol in AGENTS.md. Phase 0 is done.

Goal: the in-memory drawing model every later phase builds on, mirroring AutoCAD's database.

Build:
- Database with symbol tables, the named object dictionary, layouts (Model, Layout1, Layout2) and their block records (*Model_Space, *Paper_Space), handles ($HANDSEED), owners, reactors, extension dictionaries, and XDATA by registered application.
- Entity base with common properties: layer, color (ACI 0–256, true color, color book name), linetype, linetype scale, lineweight, transparency, plot style name, visibility, thickness, extrusion normal, material, shadow flags.
- Data definitions with DXF group-code mapping for every AutoCAD entity and object type (2D, 3D, annotation, references, proxies). Geometry behavior (bounds, transform, evaluation, closest point, length, area) now for LINE, POINT, CIRCLE, ARC, ELLIPSE, LWPOLYLINE (bulges, widths), 2D/3D POLYLINE, SPLINE (NURBS and fit data), XLINE, RAY. Types without behavior yet are stored losslessly.
- Defaults that match acadiso.dwt: layer 0; linetypes ByBlock, ByLayer, Continuous; text styles Standard and Annotative; dimension styles ISO-25 (current), Standard, Annotative; multileader, table, and mline styles; the World UCS; LIMITS 0,0 to 420,297; GRIDUNIT and SNAPUNIT 10,10; LUNITS 2; LUPREC 4.
- System variables: a declarative registry (name, type, default, range or enum, bit-flag meanings, scope drawing/profile/session, read-only, Korean description). Include every DXF header variable and every sysvar named in Reference B or in later phases; aim for completeness (500+). SETVAR, GETVAR, and typing a name at the command line (OSMODE에 대한 새 값 입력 <4133>: — verify the Korean wording). Invalid values are rejected with AutoCAD-style Korean messages. Generate docs/SYSVARS.md from the registry.
- Transactions and undo: one group per command; U, UNDO (Auto, Control, BEgin, End, Mark, Back, number), REDO, MREDO, UNDOCTL, OOPS. Sysvar changes saved in the drawing are undoable as in AutoCAD.
- Event bus: object added, modified, erased, unerased; sysvar changed; document activated.
- Multiple documents: Drawing1, Drawing2, ...; each with its own database, undo, and drawing-scope sysvars; profile-scope sysvars are shared.
- Command registry and a headless runner that feeds scripted input (points, keywords, strings) to commands.
- A native format (.hcd: zipped JSON plus binary blobs) for autosave, tests, and saving work until DXF arrives in Phase 9.

Acceptance:
- [ ] A property-based test applies 1,000 random create/modify/erase operations, undoes them all, and gets a database identical to the start; redo restores the end state.
- [ ] Headless: typing OSMODE shows 4133; setting 99999 is rejected; SETVAR LUPREC 2 changes display precision.
- [ ] docs/SYSVARS.md lists every registered variable with scope and default.
- [ ] Saving to .hcd and reloading gives an identical database.
```

## Phase 2 — 렌더링 엔진과 화면 탐색

도면을 빠르고 정확하게 그리고, 휠 줌·가운데 버튼 이동을 AutoCAD와 같게 만드는 단계다. 큰 좌표에서 화면이 떨리지 않는지도 여기서 잡는다.

```text
PHASE 2 — Rendering engine and view navigation
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–1 are done.

Goal: draw the database fast and exactly like AutoCAD, and navigate it like AutoCAD.

Build:
- WebGL2 renderer per AGENTS.md section 4: high-DPI; incremental updates from database events; batching by layer and style; floating origin; wide lines for lineweights (LWDISPLAY, LWDEFAULT, LWUNITS); linetypes from LTYPE definitions (LTSCALE, CELTSCALE, PSLTSCALE, MSLTSCALE, PLINEGEN; complex linetypes with text and shapes after Phase 10); the exact 256-color ACI table; true color; ByLayer/ByBlock resolution; transparency; color 7 inversion by background; draw order.
- Display of every entity with geometry from Phase 1, including polyline widths and bulges, NURBS splines, POINT with PDMODE/PDSIZE, and XLINE/RAY clipped to the view. Curves stay smooth at every zoom level.
- ZOOM with every option (All, Center, Dynamic, Extents, Previous, Scale with nX and nXP, Window, Object, Realtime); PAN realtime and -PAN; wheel zoom about the cursor (ZOOMFACTOR, ZOOMWHEEL); middle-drag pan (MBUTTONPAN); middle double-click = Zoom Extents; smooth view transitions (VTENABLE, VTDURATION); the Zoom Previous stack; REGEN, REGENALL, REDRAW, REDRAWALL as compatible commands.
- Cursor and aids: crosshair (CURSORSIZE), pickbox (PICKBOX), crosshair hidden outside the canvas, UCS icon (UCSICON ON/OFF/ORigin, 2D style), grid (GRIDMODE, GRIDUNIT, GRIDMAJOR, GRIDDISPLAY adaptive and limits options, axis coloring), model background color option.
- Hit testing: an R-tree over entity bounds; pick queries return candidates under the pickbox with exact distances.
- A dev-only command DEVSTRESS that generates N random lines, arcs, and polylines.

Acceptance:
- [ ] After DEVSTRESS 1000000, pan and zoom stay at 60 fps on this PC.
- [ ] Geometry drawn around (200000000, 450000000) shows no jitter at high zoom.
- [ ] Wheel zoom keeps the point under the cursor fixed; middle drag pans; middle double-click shows extents.
- [ ] DASHED, CENTER, HIDDEN, and PHANTOM render correctly and follow LTSCALE; lineweights appear only when LWDISPLAY is on.
- [ ] Golden-image tests for at least 20 reference scenes pass.
```

## Phase 3 — 명령 시스템, 명령행, 단축키, 한글 IME 처리

타이핑·단축키·마우스 버튼을 AutoCAD와 똑같이 만들고, 한글 모드에서도 명령이 그대로 입력되게 하는 단계다. 내 acad.pgp를 가져오는 기능도 여기서 들어간다.

```text
PHASE 3 — Command system, command line, shortcuts, Korean IME
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–2 are done.

Goal: typing, shortcuts, and mouse buttons behave exactly like AutoCAD, and Korean IME mode never breaks command input.

Build:
- Command registry entries: canonical name, global name, Korean display name, flags (transparent, modal, pickfirst, no-undo), Korean help text.
- Command line exactly like AutoCAD: a floating translucent bar with fading recent prompt lines, dockable; F2 expanded history; Ctrl+9 toggle; AutoComplete with INPUTSEARCHOPTIONS (auto-append, AutoCorrect, search system variables, mid-string search, delay); a suggestion list; clickable keywords; Up/Down history; a right-click menu with recent input, copy history, and options; 명령: prefix lines.
- Input parsing: commands, aliases, the _ . - ' prefixes, sysvar names, transparent commands inside prompts ('ZOOM, 'PAN, 'CAL, 'DIST, 'SETVAR, 'OSNAP) with >> prompts; Enter/Space accept; at an empty prompt Enter/Space repeats the last command; Space inserts a space only in prompts that allow spaces; Esc prints *취소*.
- PGP aliases: built-in default from docs/SHORTCUTS.md; import and merge my acad.pgp (same syntax, mine wins); ALIASEDIT dialog; REINIT reloads.
- Keyboard: every binding in docs/SHORTCUTS.md, resolved in this order: text editor, dialog, command line, global. Temporary override keys with key-down and key-up macros (TEMPOVERRIDES). Bindings for commands not built yet print the Korean not-implemented message.
- Mouse: right-click customization (SHORTCUTMENU bits, time-sensitive right-click with SHORTCUTMENUDURATION) and Korean shortcut menus (default, edit, and command modes).
- Macro language for menus and buttons: ^C^C, ;, \ pause, *^C^C repeat, $M= DIESEL. A DIESEL evaluator for macros and MODEMACRO.
- ImeController per AGENTS.md section 3: decides latin mode vs text mode from the active prompt type. The Dubeolsik reverse map covers compound vowels (ㅘ ㅙ ㅚ ㅝ ㅞ ㅟ ㅢ), compound finals (ㄳ ㄵ ㄶ ㄺ ㄻ ㄼ ㄽ ㄾ ㄿ ㅀ ㅄ), and shifted jamo (ㅃ ㅉ ㄸ ㄲ ㅆ ㅒ ㅖ). Unit-test at least 60 cases.
- Status bar: every toggle with Korean labels and AutoCAD-like icons; left click toggles; right click opens its settings menu; coordinate display (COORDS modes); the customization menu to show or hide items.
- F1 opens a Korean help panel for the active command, generated from registry metadata.

Acceptance:
- [ ] With the Windows IME in 한글 mode, pressing Z then Enter starts ZOOM (that key produces ㅋ); typed ㅣ, ㅊ, or 채 resolve to L, C, or CO.
- [ ] At a free-text prompt, Korean composes normally and the composition shows at the caret.
- [ ] Typing OSM shows OSMODE in AutoComplete; typing a sysvar name lets me set it.
- [ ] My own acad.pgp imports and its aliases work right after REINIT.
- [ ] F3, F7–F12, and Ctrl+B/E/F/G/L/U/W flip the right sysvars and status-bar buttons.
- [ ] 'Z during another command runs transparently with >> prompts, then returns to the original prompt.
- [ ] Right-click as Enter works when configured; Shift+right click opens the (placeholder) object snap menu.
```

## Phase 4 — 좌표 입력과 제도 보조 기능

점을 찍는 손맛을 AutoCAD와 같게 만드는 단계다. LINE을 여기서 완성해 객체 스냅, 극좌표, 추적, 동적 입력을 전부 검증한다.

```text
PHASE 4 — Coordinate input and drafting aids (LINE as the reference command)
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–3 are done.

Goal: picking points feels exactly like AutoCAD. Build LINE completely in this phase and use it to prove every aid.

Build:
- LINE with all prompts, U and C, continuation from the last line or arc endpoint (Enter at the first prompt), and command preview.
- Point input: everything under Point input syntax in docs/SHORTCUTS.md; parsing and formatting by LUNITS, LUPREC, AUNITS, AUPREC, ANGBASE, ANGDIR (decimal, engineering, architectural, fractional, scientific; degrees, DMS, grads, radians, surveyor's); OSNAPCOORD priority between typed coordinates and snaps.
- Object snaps: running snaps (OSMODE bits, including the 16384 off flag) and single-pick overrides (typed, Shift+right-click menu, temporary keys). Every mode, with AutoCAD's marker shapes, magnet, tooltips, aperture box, and Tab cycling among candidates: Endpoint, Midpoint, Center, Geometric Center (closed polylines), Node, Quadrant (rotated ellipses too), Intersection (all 2D pairs, including extended intersection), Extension (hover acquisition, small + marker, dotted path), Insertion, Perpendicular and Tangent (including the deferred modes when the first point is unknown), Nearest, Apparent Intersection, Parallel. OSOPTIONS (ignore hatches, dimension extension lines, negative Z).
- Polar tracking: POLARANG increments, additional angles (POLARADDANG), POLARMODE (absolute or relative to the last segment; orthogonal-only or all angles for tracking), polar snap (POLARDIST with SNAPTYPE), a tooltip like 극좌표: 123.4567 < 45°.
- Object snap tracking: acquisition by hover (or by Shift, per AUTOSNAP and TRACKPATH), up to 7 acquired points, intersections of two alignment paths, clearing on re-hover.
- Ortho (F8, Shift temporary); snap (SNAPMODE, SNAPUNIT, SNAPANG, SNAPBASE; rectangular, isometric, polar); isometric drafting with isoplane cycling (F5, Ctrl+E) and isoplane cursors; grid that follows snap.
- Dynamic input (DYNMODE, DYNPROMPT, DYNDIGRIP, DYNPIFORMAT, DYNPICOORDS, DYNTOOLTIPS): pointer input tooltip, dimensional input with Tab between length and angle, field locking, prompts at the cursor, the down-arrow options menu; appearance like AutoCAD.
- Drafting Settings dialog (DSETTINGS) with the Korean tabs 스냅 및 그리드, 극좌표 추적, 객체 스냅, 3D 객체 스냅, 동적 입력, 빠른 특성, 선택 순환; the -OSNAP command-line version.

Acceptance:
- [ ] LINE accepts 100,50, @100<30, #0,0, direct distance with polar on, .X filters, FROM with @10,10, TT, and M2P, each producing exact coordinates.
- [ ] Fixture tests for every osnap mode on lines, arcs, circles, ellipses, splines, and polylines pass.
- [ ] Hovering two endpoints and moving to where their alignment paths cross snaps to that point, with a tooltip.
- [ ] Shift+E forces Endpoint for one pick; holding Shift toggles ortho; F3, F8, F10, F11, F12 behave as in AutoCAD.
- [ ] Dynamic input shows length and angle fields; Tab switches; typed values lock.
```

## Phase 5 — 선택 시스템과 그립

윈도우·걸침·올가미 선택과 그립 편집, 복사·붙여넣기를 AutoCAD와 같게 만드는 단계다.

```text
PHASE 5 — Selection, grips, clipboard
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–4 are done.

Goal: selecting and grip editing feel exactly like AutoCAD.

Build:
- Selection rules: PICKFIRST (noun-verb), PICKADD 0/1/2, PICKAUTO (implied windowing, press-drag lasso), PICKDRAG, PICKSTYLE, SELECTIONPREVIEW, SELECTIONEFFECT, PREVIEWFILTER, SELECTIONAREA with its colors and opacity, SELECTIONCYCLING (Ctrl+W, list box), locked-layer filtering with messages.
- The 객체 선택: prompt with every keyword in docs/SHORTCUTS.md, n개를 찾음 counts, and duplicate messages. Ctrl+A, Shift+click removal, Esc clearing.
- QSELECT dialog, SELECTSIMILAR (with its settings), FILTER (named filters and operators), SELECT, GROUP and GROUPEDIT (create, name, description, add, remove, explode), the Ctrl+Shift+A group toggle, group bounding boxes.
- Grips: GRIPS, GRIPSIZE, GRIPCOLOR, GRIPHOVER, GRIPHOT, GRIPCONTOUR, GRIPOBJLIMIT, GRIPBLOCK, GRIPTIPS, GRIPMULTIFUNCTIONAL. The Space/Enter cycle 신축 → 이동 → 회전 → 축척 → 대칭 with Base point, Copy, Undo, Reference, and eXit; multiple hot grips with Shift; grips that honor osnap, polar, tracking, and dynamic input. A grip-provider interface plus providers for every current entity, including multifunction menus (polyline Add Vertex, Remove Vertex, Convert to Arc/Line, Stretch; line Lengthen).
- ERASE and the Delete key; OOPS.
- Clipboard: COPYCLIP (Ctrl+C), CUTCLIP (Ctrl+X), PASTECLIP (Ctrl+V), COPYBASE (Ctrl+Shift+C), PASTEBLOCK (Ctrl+Shift+V), PASTEORIG, between drawings and between HanCAD windows; the system clipboard carries an internal format plus an image.
- A basic Properties palette (Ctrl+1) and Quick Properties for current entity types; the full version comes in Phase 8.

Acceptance:
- [ ] Left-to-right drag selects only enclosed objects (blue); right-to-left selects touching objects (green, dashed); press-drag draws a lasso.
- [ ] Select-then-command and command-then-select both work; Shift+click removes.
- [ ] Clicking a line grip, pressing Space three times, and typing 2 scales by 2 about that grip.
- [ ] The polyline vertex grip menu offers Add Vertex, Remove Vertex, and Convert to Arc, and each works.
- [ ] Ctrl+Shift+C then Ctrl+V in another drawing pastes at the chosen base point.
```

## Phase 6 — 2D 그리기 명령

PLINE, ARC, CIRCLE, SPLINE 등 모든 2D 그리기 명령을 옵션·프롬프트·미리보기까지 AutoCAD와 같게 만드는 단계다.

```text
PHASE 6 — 2D draw commands
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–5 are done.

Goal: every 2D drawing command with every option, prompt, preview, and remembered value AutoCAD has.

Build each with Korean prompts, dynamic input, command preview, grips, and headless tests:
- XLINE (Hor, Ver, Ang, Bisect, Offset), RAY.
- PLINE: Arc (Angle, CEnter, CLose, Direction, Halfwidth, Line, Radius, Second pt, Undo, Width), Halfwidth, Length, Undo, Width, Close; PLINEWID, PLINEGEN, FILLMODE; tangent continuation.
- RECTANG (Chamfer, Elevation, Fillet, Thickness, Width; Area, Dimensions, Rotation), POLYGON (Inscribed, Circumscribed, Edge), DONUT.
- CIRCLE (center-radius, center-diameter, 3P, 2P, Ttr; Tan-Tan-Tan from the ribbon), CIRCLERAD.
- ARC: all 11 ribbon methods, plus continuing tangent from the last line or arc with Enter.
- ELLIPSE (axis-end, center, arc, rotation, parameter and angle options; Isocircle when isometric snap is on).
- SPLINE (Fit and CV methods, Knots, Object, degree, start and end tangency, tolerance, close; SPLMETHOD, SPLDEGREE, SPLKNOTS).
- POINT (single, multiple), PTYPE dialog, DIVIDE and MEASURE (including the Block option).
- REVCLOUD (Arc length, Object, Rectangular, Polygonal, Freehand, Style Normal/Calligraphy, Modify), WIPEOUT (frames on, off, or display-but-not-plot), REGION, SKETCH, HELIX (2D now), SOLID, TRACE, 3DPOLY, and MLINE with a basic MLSTYLE.

Acceptance:
- [ ] For every command, a headless parity script produces geometry identical (to 1e-9) to the expected values in its test.
- [ ] By hand: PL with an arc segment, then L for line, then Width, behaves like AutoCAD; REC with Fillet 5 remembers the radius next time; A then Enter continues tangent from the last line.
- [ ] Every command shows the same preview AutoCAD shows while the cursor moves.
```

## Phase 7 — 2D 수정 명령

TRIM, OFFSET, FILLET, PEDIT 등 모든 2D 편집 명령을 AutoCAD와 같은 옵션과 결과로 만드는 단계다.

```text
PHASE 7 — 2D modify commands
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–6 are done.

Goal: every 2D editing command with AutoCAD's exact options, results, and previews.

Build each with Korean prompts, command preview where AutoCAD has it, and headless tests:
- MOVE, COPY (Displacement, mOde single/multiple, Array; COPYMODE), ROTATE (Copy, Reference with Points), SCALE (Copy, Reference), MIRROR (MIRRTEXT, MIRRHATCH), STRETCH (crossing window or polygon, several windows), ALIGN (two or three point pairs, scale option).
- OFFSET (Through, Erase, Layer, Multiple, Exit, Undo; OFFSETDIST; OFFSETGAPTYPE 0/1/2) for lines, arcs, circles, ellipses (result as a spline, like AutoCAD), splines, xlines, rays, and polylines through cavalier_contours (it only makes rounded joins, so build the OFFSETGAPTYPE 0 and 2 corners yourself).
- TRIM and EXTEND: TRIMEXTENDMODE Quick and Standard, cutting and boundary edges, Fence, Crossing, mOde, Project, Edge (EDGEMODE), eRase, Undo, Shift to switch between trim and extend, hatch boundaries as edges.
- FILLET (Radius, Polyline, Trim/No trim with TRIMMODE, Multiple, Undo; Shift-pick for radius 0; parallel lines; arcs and circles), CHAMFER (Distance, Angle, Method, Polyline, Trim, Multiple, Expression), BLEND (Tangent, Smooth).
- BREAK (First point, @ for the same point), BREAKATPOINT, JOIN (results exactly as AutoCAD produces them; PEDITACCEPT), EXPLODE (each type exactly as AutoCAD explodes it), LENGTHEN (DElta with Angle, Percent, Total, DYnamic).
- ARRAYRECT, ARRAYPOLAR, ARRAYPATH with ASsociative = No for now (associative arrays come in Phase 16), plus the classic -ARRAY.
- PEDIT with every option: Multiple, Join with fuzz distance and join type, Width, the Edit vertex submode, Fit, Spline (SPLINETYPE, SPLINESEGS), Decurve, Ltype gen, Reverse. SPLINEDIT (Close/Open, Join, Fit data, Edit vertex, convert to Polyline, Reverse, refine).
- REVERSE, DRAWORDER (Above, Under, Front, Back), CHANGE, CHPROP, OVERKILL (tolerance, ignored properties, options), and COMMANDPREVIEW for TRIM, EXTEND, FILLET, CHAMFER, OFFSET, LENGTHEN, BLEND.

Acceptance:
- [ ] Quick-mode TRIM: dragging a fence across segments trims them; Shift-click extends instead.
- [ ] OFFSET of a closed polyline with arcs fills outward gaps by extension (OFFSETGAPTYPE 0), arcs (1), or chamfers (2), matching AutoCAD.
- [ ] FILLET with a Shift-pick makes a sharp corner regardless of FILLETRAD.
- [ ] JOIN of collinear lines makes one LINE; lines plus arcs make a polyline; EXPLODE of a wide polyline warns as AutoCAD does.
- [ ] U after any command removes exactly what that command did.
```

## Phase 8 — 도면층과 특성

도면층 특성 관리자, 선종류, 색상, 선가중치, 특성 팔레트(Ctrl+1)를 AutoCAD와 같게 만드는 단계다.

```text
PHASE 8 — Layers and properties
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–7 are done.

Goal: layers, linetypes, colors, lineweights, and the Properties palette work like AutoCAD's.

Build:
- Layer Properties Manager (LAYER) as a modeless palette with the Korean columns 상태, 이름, 켜기, 동결, 잠금, 플롯, 색상, 선종류, 선가중치, 투명도, 새 VP 동결, 설명 (viewport columns arrive in Phase 14). Sorting, search, new/delete/set current, rename with F2, property filters with expressions, group filters, invert filter, layer states (save, restore, import/export .las), unreconciled-layer notifications (LAYERNOTIFY, LAYEREVAL), LAYLOCKFADECTL, the rules for layer 0 and Defpoints, LAYERP and LAYERPMODE, and the full -LAYER command-line version.
- Layer tools: LAYISO (lock-and-fade or off setting), LAYUNISO, LAYOFF, LAYON, LAYFRZ, LAYTHW, LAYLCK, LAYULK, LAYMCUR, LAYMCH, LAYCUR, LAYMRG, LAYDEL, LAYWALK, COPYTOLAYER, SETBYLAYER.
- Color dialog (Index Color, True Color with RGB/HSL, Color Books placeholder). LINETYPE manager: load from .lin files; ship an original .lin with the standard names and patterns (DASHED, HIDDEN, CENTER, PHANTOM, DOT, DASHDOT, BORDER, DIVIDE, the ISO set); complex linetypes are parsed now and rendered after Phase 10. LWEIGHT dialog. Transparency (CETRANSPARENCY, TRANSPARENCYDISPLAY). CLAYER, CECOLOR, CELTYPE, CELWEIGHT, CELTSCALE.
- Properties palette: categories (일반, 3D 시각화, 형상, 기타, and per type), multiple selection with *다양함*, a type filter list, the Quick Select, PICKADD, and select buttons, editable geometry fields that accept expressions. Quick Properties (Ctrl+Shift+P, QPLOCATION). Rollover tooltips (ROLLOVERTIPS).
- Ribbon Home panels for layers and properties: the layer dropdown with on/freeze/lock icons that work directly, color/linetype/lineweight/transparency dropdowns, Match Layer.
- MATCHPROP with its Settings dialog; special properties are added as each type arrives in later phases.
- ISOLATEOBJECTS, HIDEOBJECTS, UNISOLATEOBJECTS (OBJECTISOLATIONMODE).

Acceptance:
- [ ] Freezing a layer from the ribbon dropdown hides its objects immediately; LAYISO then LAYUNISO restores the exact previous state.
- [ ] Selecting a line and a circle shows *다양함* for differing values and edits both when a shared value changes.
- [ ] Loading my own .lin file with a complex linetype keeps its definition (text and shapes may render only after Phase 10).
- [ ] ByLayer and ByBlock resolve exactly as in AutoCAD for nested blocks (tests with block data from Phase 1).
```

## Phase 9 — DXF/DWG 입출력, 자동 저장, 복구

실제 도면을 손실 없이 열고 저장하는 단계다. 이 단계가 끝나면 회사 도면으로 HanCAD를 시험해 볼 수 있다.

```text
PHASE 9 — DXF/DWG I/O, autosave, recovery
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–8 are done.

Goal: open and save real drawings losslessly, so I can start using HanCAD on real files.

Build:
- DXF reader and writer, ASCII and binary: R12 (AC1009), R2000 (AC1015), R2004 (AC1018), R2007 (AC1021), R2010 (AC1024), R2013 (AC1027), R2018 (AC1032). All sections: HEADER, CLASSES, TABLES, BLOCKS, ENTITIES, OBJECTS, THUMBNAILIMAGE, ACDSDATA. Every entity and object type from Phase 1; unknown ones preserved verbatim; XDATA, extension dictionaries (102 groups), reactors (330), handles, owners. R12 output converts types the way AutoCAD does (for example LWPOLYLINE to POLYLINE). Korean text per AGENTS.md section 3 ($DWGCODEPAGE, \U+, \M+). Streaming parse in a worker.
- DWG through ODA File Converter: detect it or let me set its path (OPTIONS > 파일), and convert through temporary folders with its command-line interface (input folder, output folder, output version, output type, recurse flag, audit flag, file filter; verify the exact syntax in its documentation). Fallback reading through @mlightcad/libredwg-web in a worker; its default build has DXF parsing and DWG writing turned off, so use it only for reading DWG. Show a Korean notice when DWG saving is unavailable.
- Viewing fidelity for everything I may open now, even where editing comes later: MTEXT, TEXT, DIMENSION (through its *D block), HATCH, INSERT, LEADER, MULTILEADER, TABLE, IMAGE frames, VIEWPORT, and 3D entities as wireframe.
- File commands: NEW and QNEW (templates), OPEN (preview thumbnail, read-only, several files), SAVE, QSAVE, SAVEAS (DWG/DXF versions, DXF precision, DWT, native .hcd), CLOSE, CLOSEALL, QUIT with Korean save prompts, RECOVER, AUDIT, DRAWINGRECOVERY, autosave (SAVETIME, SAVEFILEPATH, .sv$), .bak files (ISAVEBAK), a lock file against concurrent editing, drag and drop to open, recent files, the 시작 (Start) tab with templates and recent files, and the file-tab context menu.
- A built-in metric template equivalent to acadiso.dwt, saved as .dwt.
- A round-trip harness: a semantic diff of databases (ignoring handle order) that runs on generated files and on my private test-corpus/ folder.

Acceptance:
- [ ] My real DWG and DXF files open; layers, blocks, text, dimensions, and hatches look as they do in AutoCAD.
- [ ] Open, save as DXF 2018, and reopen gives zero semantic differences across the corpus.
- [ ] Korean layer and block names survive R2004 (CP949) and R2018 (UTF-8) round trips.
- [ ] A 50 MB DXF opens in under 10 s with a progress bar and Esc to cancel.
- [ ] Killing the app mid-edit and restarting offers recovery through DRAWINGRECOVERY.
```

## Phase 10 — 문자와 글꼴

SHX·빅폰트·트루타입 글꼴과 한글 입력을 AutoCAD와 같은 모양·크기·편집 방식으로 만드는 단계다. 내 SHX 폴더를 지정하면 회사 도면의 한글이 그대로 보여야 한다.

```text
PHASE 10 — Text and fonts (SHX, BigFont, TrueType, Korean)
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–9 are done.

Goal: text looks, measures, and edits exactly like AutoCAD, including Korean.

Build:
- Font engine: an SHX parser for shape 1.0, unifont 1.0, and bigfont 1.0 files (escape ranges, extended shapes); TTF/OTF/TTC parsing with cached glyph tessellation; a Korean glyph fallback chain (style font, then 맑은 고딕, then 굴림); font mapping (FONTMAP .fmp, FONTALT); support file search paths (OPTIONS > 파일) including my AutoCAD fonts folder; a missing-SHX dialog with replacement choices that are remembered.
- STYLE dialog (문자 스타일): font, font style, use BigFont, annotative, height, width factor, oblique angle, upside down, backwards, vertical; new, rename, delete, set current.
- TEXT/DTEXT: every justification (Left, Center, Right, Align, Middle, Fit, TL TC TR ML MC MR BL BC BR), style, height, rotation; in-place multi-line entry on the canvas with Korean IME composition; TEXTEDIT and DTEXTED; %%c, %%d, %%p, %%u, %%o, %%nnn; QTEXT, TEXTFILL.
- MTEXT: an in-place editor with the contextual ribbon tab 문자 편집기 (font, height, color, bold/italic/underline/overline/strikethrough, width factor, oblique, tracking, stacking via \S, columns, paragraphs with indents, tabs, alignment, and line spacing, bullets and numbering, the symbol menu, background mask, AutoCAPS, find/replace, import text). Full read/write of MTEXT format codes (\P \f \F \H \W \Q \T \A \C \c \L \l \O \o \K \k \S \p \N \~ and the rest).
- FIND (find and replace with options), SPELL (English dictionary; never flag Hangul words).
- Text and SHX shapes inside complex linetypes; SHAPE and LOAD.
- Match AutoCAD's text height semantics for SHX and TrueType and its justification math. Compare against reference DXF files and add each case to the parity checklist.

Acceptance:
- [ ] A Korean drawing that uses romans.shx + whgtxt.shx renders identical to AutoCAD once my SHX folder is set; a missing SHX opens the substitution dialog.
- [ ] Korean typed into TEXT and MTEXT composes in place, with the IME candidate window at the caret and the 한자 key working.
- [ ] MTEXT with stacked fractions, columns, and numbered lists round-trips through DXF unchanged.
- [ ] TrueType and SHX text of height 2.5 in every justification lines up with AutoCAD in overlay comparisons.
```

## Phase 11 — 치수, 지시선, 공차

모든 치수 명령과 치수 스타일 관리자, 연관 치수, 다중 지시선을 AutoCAD와 같게 만드는 단계다.

```text
PHASE 11 — Dimensions, leaders, tolerances
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–10 are done.

Goal: complete dimensioning that matches AutoCAD's geometry, styles, and associativity.

Build:
- A dimension engine that draws from the definition and also writes the anonymous *D blocks AutoCAD expects in DWG/DXF.
- Commands: DIMLINEAR (Mtext, Text, Angle, Horizontal, Vertical, Rotated), DIMALIGNED, DIMANGULAR (two lines, arc, circle, three-point vertex, Quadrant), DIMARC, DIMRADIUS, DIMDIAMETER, DIMJOGGED, DIMORDINATE (Xdatum, Ydatum), DIMBASELINE, DIMCONTINUE, QDIM, the unified DIM command (smart preview, Layer option, baseline, continue, align, distribute), DIMBREAK, DIMSPACE, DIMJOGLINE, DIMCENTER, CENTERMARK, CENTERLINE, DIMEDIT, DIMTEDIT, DIMOVERRIDE, DIMREASSOCIATE, DIMDISASSOCIATE, DIMREGEN, DIMINSPECT, TOLERANCE (GD&T frames with symbols and datums).
- Leaders: QLEADER with its settings dialog, LEADER, MLEADER, MLEADERSTYLE, MLEADEREDIT (add and remove leaders), MLEADERALIGN, MLEADERCOLLECT, with MTEXT or block content.
- DIMSTYLE manager with every tab (선, 기호 및 화살표, 문자, 맞춤, 1차 단위, 대체 단위, 공차) and every DIM system variable; overrides and compare; ISO-25 defaults; a KS-oriented preset (record exactly what it changes in docs/DECISIONS.md).
- Associativity (DIMASSOC 2): dimensions update when geometry changes; DIMANNO, DIMSCALE.
- All standard arrowheads plus user blocks; text formatting (units, precision, rounding, zero suppression, prefix/suffix, measurement scale), placement and fit rules, DIMTMOVE, and dimension grips with their multifunction menus.

Acceptance:
- [ ] Dimensions from my real drawings display identically and regenerate identical geometry after any style edit.
- [ ] Stretching a dimensioned rectangle updates its associative dimensions.
- [ ] DIM hovering over a line, an arc, and a circle previews linear, arc or radius, and diameter dimensions as AutoCAD does.
- [ ] Every DIMSTYLE setting changes the result the same way AutoCAD's does (a golden test per setting).
```

## Phase 12 — 해치, 경계, 영역

내부 점 클릭으로 경계를 찾는 해치를 AutoCAD만큼 안정적으로 만들고, 그라데이션·연관 해치·영역까지 완성하는 단계다.

```text
PHASE 12 — Hatch, gradient, boundary, region
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–11 are done.

Goal: hatching that finds boundaries as reliably as AutoCAD and round-trips perfectly.

Build:
- A boundary engine in Rust/WASM: a planar arrangement of lines, arcs, circles, ellipses, splines (approximated within tolerance), polylines, xlines, and rays; the smallest enclosing loop with islands; gap tolerance (HPGAPTOL); a boundary set from the current viewport or from selected objects.
- HATCH with the contextual ribbon tab 해치 작성 and the dialog version (HPDLGMODE): pick points, select objects, remove boundaries, recreate boundary, island detection (Normal, Outer, Ignore), patterns from .pat files (ship an original .pat with the standard names; accept my .pat folder), user-defined (single, double), SOLID, gradients (one and two colors, the nine shapes, centered, angle, tint and shade), angle, scale, spacing, ISO pen width, transparency, background color, origin options (set, corners, center, store as default), associativity (HPASSOC), annotative, separate hatches, draw order, inherit properties, hover preview, HPMAXLINES.
- AutoCAD-style errors: when no valid boundary is found, red circles mark the gaps.
- HATCHEDIT, -HATCH, hatch grips (center grip menu: stretch, origin, angle, scale), HATCHGENERATEBOUNDARY, HATCHTOBACK.
- BOUNDARY (BO) with polyline or region output, REGION, UNION/SUBTRACT/INTERSECT on regions, MASSPROP for regions.
- DXF fidelity: pattern definition lines, seed points, and every boundary path edge type, including spline edges.

Acceptance:
- [ ] Clicking inside nested shapes with text inside hatches around the text as AutoCAD does (Normal island detection).
- [ ] A boundary with a 0.5 gap fails at HPGAPTOL 0 with red gap markers and succeeds at 1.
- [ ] Moving a boundary edge updates an associative hatch.
- [ ] Hatches from my real drawings render identically and round-trip through DXF unchanged.
```

## Phase 13 — 블록, 속성, 외부 참조, 이미지, 언더레이

블록·도면 양식 속성·외부 참조·이미지·PDF 첨부처럼 매일 쓰는 재사용 기능을 만드는 단계다.

```text
PHASE 13 — Blocks, attributes, external references, images, underlays
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–12 are done.

Goal: reuse and references work the way AutoCAD users rely on every day.

Build:
- BLOCK (dialog and -BLOCK: name, base point, retain/convert/delete, annotative, scale uniformly, allow exploding, units, open in block editor), redefinition prompts, WBLOCK, INSERT with the Blocks palette (Current drawing, Recent, Favorites, Libraries; repeat placement; explode option), -INSERT with every option including *name, MINSERT, nested blocks.
- Attributes: ATTDEF (Invisible, Constant, Verify, Preset, Lock position, Multiple lines; tag, prompt, default), ATTDIA and ATTREQ behavior, ATTEDIT and -ATTEDIT, EATTEDIT, BATTMAN, ATTSYNC, ATTDISP, ATTIPEDIT, DATAEXTRACTION (a simplified wizard that exports block counts and attributes to CSV or a TABLE).
- BEDIT for static blocks (dynamic features come in Phase 17), REFEDIT and REFCLOSE for in-place editing of blocks and xrefs, COUNT with its counting palette.
- External references: the EXTERNALREFERENCES palette (attach DWG/DXF, overlay, full/relative/no path, nested display, reload, unload, detach, bind and insert), XBIND, XCLIP (rectangular, polygonal, inverted, delete; XCLIPFRAME), xref|layer names, VISRETAIN, XREFNOTIFY balloons, XDWGFADECTL, XOPEN; Korean paths.
- Images: IMAGEATTACH (PNG, JPG, TIF, BMP), IMAGECLIP, IMAGEADJUST, IMAGEFRAME, IMAGEQUALITY, transparency.
- PDF: PDFATTACH (layers, snapping to PDF geometry, clipping, fade/contrast/monochrome) and PDFIMPORT (vectors, text including Korean, raster images, solid fills, layer options).
- DesignCenter (Ctrl+2): browse blocks, layers, styles, and linetypes in other drawings and drag them in. Dragging a .dwg or .dxf onto the canvas inserts it as a block.

Acceptance:
- [ ] A title block with attributes inserts with Korean attribute prompts; EATTEDIT edits values; ATTSYNC updates references after BATTMAN changes.
- [ ] An xref with a relative path reloads when the source changes and shows the AutoCAD-style notification.
- [ ] PDFIMPORT of a vector PDF yields editable lines and Korean text.
- [ ] Blocks and xrefs from my real drawings round-trip through DXF/DWG unchanged.
```

## Phase 14 — 배치, 뷰포트, 플롯

축척이 정확한 배치와 뷰포트, CTB 펜 설정에 맞는 출력과 PDF를 만드는 단계다. 회사 CTB 파일로 출력 결과가 AutoCAD와 같은지 확인한다.

```text
PHASE 14 — Layouts, viewports, page setup, plotting
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–13 are done.

Goal: correctly scaled sheets and plots, exactly as an AutoCAD office produces them.

Build:
- Layouts: create, delete, rename, move, copy, from template (LAYOUT options), the tab context menu, Ctrl+Page Up/Down; paper display (sheet, shadow, dashed printable area, white background).
- Viewports: MVIEW (Fit, Lock, Object, Polygonal, Restore, LAyer, 2/3/4), VPORTS for layouts and for tiled model viewports with named configurations, standard and custom scale lists (SCALELISTEDIT), VPMAX/VPMIN, MSPACE/PSPACE and double-click switching, CHSPACE, VPCLIP, VPLAYER, layer viewport overrides (color, linetype, lineweight, transparency, plot style) with the Layer manager's VP columns, viewport locking, shade plot options, per-viewport annotation scale, PSLTSCALE, Ctrl+R cycling.
- PAGESETUP manager and plotter configurations: Windows printers through Tauri; a built-in PDF plotter with an original name; ISO A0–A4 with and without margins; custom sizes; plot area (Display, Extents, Limits, Layout, Window); offset and centering; exact scale or fit; scaled lineweights; CTB/STB plot style tables (read and write AutoCAD's .ctb/.stb files, with an editor dialog — Korean offices map colors to pen widths through CTB, so this must be exact); shaded viewport options; plot options; orientation.
- PLOT dialog with full preview (PREVIEW); plotting to a printer, PDF, PNG, and SVG; PUBLISH (several layouts or drawings to one multi-page PDF or to printers); PLOTSTAMP; EXPORTPDF; EXPORTLAYOUT.
- PDF quality: vector geometry, TrueType text as searchable embedded subset fonts (Korean included), SHX text as geometry, optional PDF layers, hyperlinks, images, solid and gradient fills, transparency.

Acceptance:
- [ ] A 1:100 viewport on A3 plotted to PDF measures exactly (1000 mm in the model is 10 mm on paper).
- [ ] My company's .ctb produces the same pen widths and colors as AutoCAD's PDF of the same layout.
- [ ] Korean TrueType text in the PDF is searchable and copyable.
- [ ] PUBLISH of all layouts from three drawings creates one PDF with the pages in order.
```

## Phase 15 — 조회·유틸리티·설정

거리·면적 조회, 빠른 계산기, 옵션 대화상자, 소거처럼 매일 쓰는 보조 도구를 만드는 단계다.

```text
PHASE 15 — Inquiry, utilities, settings, cleanup
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–14 are done.

Goal: the supporting tools and dialogs AutoCAD users touch every day.

Build:
- Inquiry: DIST (multiple points), AREA (object, add, subtract), MEASUREGEOM (quick hover measuring plus distance, radius, angle, area, volume), ID, LIST, MASSPROP (regions now, solids in Phase 22), TIME, STATUS, DWGPROPS.
- Calculation: the QUICKCALC palette (variables, unit conversion, geometry functions, picking coordinates, distances, angles, and intersections from the drawing) and CAL with AutoCAD's functions (rad, dee, ill, ille, nee, vec, vec1, cvunit, pld, plt, rot, cur, and @).
- Settings: UNITS dialog (including insertion scale), LIMITS, OPTIONS with every tab (파일, 화면표시, 열기 및 저장, 플롯 및 게시, 시스템, 사용자 기본 설정, 제도, 3D 모델링, 선택, 프로파일) wired to sysvars and profile storage, profiles (create, rename, export, import), and a system variable browser.
- Cleanup: PURGE (dialog with purgeable and non-purgeable views, nested items, zero-length geometry, empty text, orphaned data; -PURGE), RENAME, and Korean AUDIT reports.
- Views: the VIEW manager (named views with layer snapshots, UCS, backgrounds), NAVBAR.
- HYPERLINK, and DWGCOMPARE (overlay two drawings with color-coded differences).

Acceptance:
- [ ] OPTIONS changes (crosshair size, background color, right-click behavior, autosave interval) persist across restarts in the active profile.
- [ ] AREA with Add and Subtract matches AutoCAD on a test plan with holes; MEASUREGEOM quick mode shows hover dimensions.
- [ ] PURGE removes every unused layer, style, and block, including nested ones.
- [ ] CAL evaluates the rad, ill, and cvunit examples from AutoCAD's documentation correctly.
```

## Phase 16 — 고급 2D

연관 배열, 테이블과 수식, 필드, 주석 축척 등 남은 2D 기능을 마무리하는 단계다.

```text
PHASE 16 — Advanced 2D drafting
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–15 are done.

Goal: the remaining advanced 2D features.

Build:
- Associative arrays: ARRAYRECT, ARRAYPOLAR, ARRAYPATH with ASsociative = Yes, stored the way AutoCAD stores them for DWG/DXF compatibility; the contextual ribbon tab 배열; array grips (count, spacing, levels, radius, and so on); ARRAYEDIT (Source, Replace, Reset; Ctrl+click item editing); ARRAYCLOSE; ARRAYASSOCIATIVITY.
- TABLE and TABLESTYLE: insert empty, from CSV/XLSX data links, or from data extraction; in-place cell editing with Korean IME; formulas (=Sum, Average, Count, cell references, equations); cell formats; merging; inserting and deleting rows and columns; table breaks; table grips; TABLEEXPORT; pasting Excel ranges as tables.
- FIELD: insert fields (date, file name, object properties such as area and length, system variables, DIESEL expressions, formulas), FIELDEVAL, FIELDDISPLAY gray background, updates on save, regen, and plot.
- Complete annotative scaling: annotative text, dimensions, multileaders, hatches, blocks, attributes; scale representations; ANNOAUTOSCALE, ANNOALLVISIBLE, SELECTIONANNODISPLAY, ANNOUPDATE, OBJECTSCALE, AIOBJECTSCALEADD/REMOVE, ANNORESET.
- MLINE complete: the MLSTYLE dialog and MLEDIT tools.
- A simplified Sheet Set Manager (Ctrl+4): sheet list, sheet numbers and titles as fields, publishing the set.

Acceptance:
- [ ] Editing the source of an associative rectangular array changes every item; Ctrl+click moves one item only.
- [ ] A table with =Sum(A1:A3) updates when a cell changes and exports to CSV with Korean text intact.
- [ ] An annotative dimension shows at the right size in 1:50 and 1:100 viewports of the same layout.
```

## Phase 17 — 동적 블록과 블록 편집기

동적 블록을 만들고 쓸 수 있게 하고, 실제 DWG에 들어 있는 동적 블록도 깨지지 않게 유지하는 단계다.

```text
PHASE 17 — Dynamic blocks and the block editor
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–16 are done.

Goal: author and use dynamic blocks as in AutoCAD, and keep dynamic blocks from real DWGs working.

Build:
- BEDIT complete: authoring palettes (Parameters, Actions, Parameter Sets, and Constraints, which stays a placeholder until Phase 18); parameters (Point, Linear, Polar, XY, Rotation, Alignment, Flip, Visibility, Lookup, Base point); actions (Move, Scale, Stretch, Polar Stretch, Array, Rotate, Flip, Lookup, Block Properties Table); chaining; value sets (increment and list); visibility states (BVSTATE, BVHIDE, BVSHOW); lookup tables; BTABLE; BTESTBLOCK; BSAVE, BSAVEAS, BCLOSE; attribute definitions inside the editor.
- Runtime: dynamic block references with custom grips, the Custom category in Properties, RESETBLOCK, and anonymous *U block representations written exactly as AutoCAD writes them.
- Real files: read the dynamic block data stored in DWG/DXF (the evaluation graph); evaluate what you can decode, and always preserve and display the rest losslessly.

Acceptance:
- [ ] A door block with a Linear parameter plus Stretch action and a Flip parameter works through grips and the Properties palette.
- [ ] Visibility states switch through the grip dropdown.
- [ ] Dynamic blocks from my real drawings display correctly and keep their current states after save and reopen.
```

## Phase 18 — 파라메트릭 구속조건

AutoCAD 파라메트릭 탭의 기하·치수 구속조건을 FreeCAD 솔버(planegcs)로 구현하는 단계다.

```text
PHASE 18 — Parametric constraints
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–17 are done.

Goal: geometric and dimensional constraints like AutoCAD's Parametric tab.

Build:
- Geometric: GCCOINCIDENT, GCCOLLINEAR, GCCONCENTRIC, GCFIX, GCPARALLEL, GCPERPENDICULAR, GCHORIZONTAL, GCVERTICAL, GCTANGENT, GCSMOOTH, GCSYMMETRIC, GCEQUAL, GEOCONSTRAINT, AUTOCONSTRAIN, constraint inference (CONSTRAINTINFER, Ctrl+Shift+I), constraint bars (CONSTRAINTBAR, CONSTRAINTBARMODE), DELCONSTRAINT, CONSTRAINTSETTINGS.
- Dimensional: DCLINEAR, DCHORIZONTAL, DCVERTICAL, DCALIGNED, DCANGULAR, DCRADIUS, DCDIAMETER, DCCONVERT, DIMCONSTRAINT, dynamic and annotational forms (CCONSTRAINTFORM), DCDISPLAY, name formats, expressions and user parameters in the PARAMETERS manager.
- Solver: planegcs in WASM; incremental solving during grip edits and commands; over-constrained and conflicting cases reported with AutoCAD-style Korean messages; splines limited to what the solver supports (record the limits).
- Storage: constraints saved in DWG/DXF the way AutoCAD stores them (the association network); preserve whatever you cannot interpret.
- Constraint parameters inside the block editor, completing Phase 17.

Acceptance:
- [ ] A rectangle with perpendicular, horizontal, and equal constraints stays a square while a corner grip is dragged.
- [ ] Changing d1 = 100 to d1 = width*2 in PARAMETERS updates the geometry.
- [ ] Constraints survive save and reopen.
```

## Phase 19 — AutoLISP, 스크립트, DCL

회사에서 쓰던 리습(.lsp)과 스크립트(.scr)를 그대로 돌리기 위한 AutoLISP 인터프리터와 DCL 대화상자를 만드는 단계다. CP949로 저장된 예전 리습도 한글이 깨지지 않게 했다.

```text
PHASE 19 — AutoLISP, scripts, DCL, automation
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–18 are done.

Goal: run the AutoLISP routines and scripts that Korean AutoCAD users share and depend on.

Build:
- SCRIPT (.scr) with AutoCAD's semantics (spaces and newlines as Enter, RSCRIPT, DELAY, RESUME), drag-and-drop .scr files, and launching HanCAD with a script argument.
- AutoLISP interpreter in TypeScript:
  - reader: comments including ;| |;, strings with escapes, UTF-8/CP949 file decoding;
  - types: INT, REAL, STR, SYM, LIST, ENAME, PICKSET, FILE, SUBR, USUBR, VLA-object, minimal variants and safearrays;
  - core: defun with locals after /, setq, cond, if, while, repeat, foreach, mapcar, lambda, apply, list functions (assoc, subst, cons, append, reverse, nth, last, member, vl-remove, vl-sort, vl-position, and the rest), math, strings (strcat, substr, strlen, vl-string-*), conversions (rtos, atof, atoi, itoa, distof, angtos, angtof, ascii, chr), geometry (polar, distance, angle, inters, trans);
  - input: getpoint, getcorner, getdist, getangle, getorient, getint, getreal, getstring, getkword, initget, entsel, nentsel, grread;
  - selection and entities: ssget (every mode and filter list, including -4 logic), ssname, sslength, ssadd, ssdel, ssmemb, entget, entmod, entmake, entmakex, entdel, entlast, entnext, handent, entupd, XDATA with regapp, tblsearch, tblnext, tblobjname, dictsearch, dictnext, namedobjdict, dictadd, dictremove;
  - command bridge: (command ...), (command-s ...), vl-cmdf, pause;
  - system: getvar, setvar, getenv, setenv, findfile, load, autoload, startapp, file I/O, vl-file-*, vl-directory-files, prompt, princ, print, prin1, terpri, alert, *error*, vl-catch-all-apply, exit, quit, grdraw, grvecs, redraw;
  - Visual LISP subset: vl-load-com, vlax-ename->vla-object, vla-get-* and vla-put-* for common entity properties, vlax-curve-* functions, and vlr-* reactors for common events.
- Loading: APPLOAD with the Startup Suite, acad.lsp (once per session), acaddoc.lsp (per drawing), S::STARTUP, SECURELOAD and TRUSTEDPATHS with Korean prompts. (defun c:XXX ...) creates a command that appears in AutoComplete.
- DCL: parse .dcl files and render native-looking dialogs (dialog, button, edit_box, list_box, popup_list, toggle, radio buttons, rows, columns, boxed groups, text, image, slider, spacer, the ok_cancel variants); load_dialog, new_dialog, start_dialog, done_dialog, action_tile, set_tile, get_tile, mode_tile, start_list/add_list/end_list, start_image/fill_image/vector_image/end_image, client_data_tile.
- A LISP console window for testing; the Action Recorder (ACTRECORD, ACTSTOP, ACTUSERINPUT, ACTUSERMESSAGE, ACTBASEPOINT).
- A modern TypeScript plugin API (commands, database access, events), documented in docs/PLUGIN_API.md.

Acceptance:
- [ ] A CP949-encoded .lsp with Korean prompts loads and runs with correct Korean text.
- [ ] (ssget "X" '((0 . "LINE") (8 . "벽"))) returns the right lines, and entmod changes them with working undo.
- [ ] A DCL dialog with an edit box, a list box, and OK/Cancel works through action_tile callbacks.
- [ ] I will give you 10 LISP files I use; all of them run, or each failure is listed with the missing function.
```

## Phase 20 — 사용자화와 Express Tools

리본·메뉴·단축키를 CUI로 바꾸고, 내 AutoCAD .cuix를 가져오고, 자주 쓰는 Express Tools를 추가하는 단계다.

```text
PHASE 20 — Customization, workspaces, palettes, Express Tools
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–19 are done.

Goal: customize HanCAD the way AutoCAD is customized, and add the Express Tools Korean users rely on.

Build:
- A CUI editor for our own customization file (JSON), plus import of AutoCAD .cuix files (a zip of XML): keyboard shortcuts, temporary overrides, menus, ribbon tabs and panels, toolbars, double-click actions, quick properties, rollover tooltips, shortcut menus, mouse buttons, workspaces; a Transfer tab; partial customization files.
- The complete ribbon: every tab, panel, and contextual tab; galleries; split buttons that remember the last tool; slide-out panels with pins; minimize states; Alt key tips; floating panels. Quick Access Toolbar customization; the application menu with command search and recent documents; classic toolbars (float and dock); the classic menu bar (MENUBAR=1: 파일(F), 편집(E), 뷰(V), 삽입(I), 형식(O), 도구(T), 그리기(D), 치수(N), 수정(M), 파라메트릭(P), 윈도우(W), 도움말(H)); workspaces (제도 및 주석, 3D 기본 사항, 3D 모델링, and a classic layout); WSCURRENT; LOCKUI.
- TOOLPALETTES (Ctrl+3): tools for commands, blocks, hatches, and tables; drag from the drawing to create tools; tool properties; palette groups; import and export.
- Docking, floating, auto-hide, anchoring, and transparency for every palette, as in AutoCAD.
- Express Tools: TXTEXP, TXT2MTXT, TCOUNT, TCASE, TORIENT, TFRAMES, ARCTEXT, TEXTFIT, TEXTMASK, TEXTUNMASK, BURST, NCOPY, BCOUNT, BLOCKREPLACE, BSCALE, BREAKLINE, SUPERHATCH, FLATTEN, EXTRIM, MPEDIT, COPYM, GATTE, ATTOUT, ATTIN, REDIR, MOVEBAK, SHOWURLS, CHURLS, XDLIST, MKLTYPE, MKSHAPE, VPSCALE, VPSYNC, SSX, EXOFFSET. Add the rest of the Express set afterwards, as time permits.

Acceptance:
- [ ] Importing my AutoCAD .cuix brings over my keyboard shortcuts and double-click actions.
- [ ] Switching workspaces changes the ribbon, palettes, and menu bar as in AutoCAD.
- [ ] BURST, TXTEXP, and SUPERHATCH work on my test drawing.
```

## Phase 21 — 3D 기초

UCS, 3D 뷰와 뷰큐브, 궤도, 비주얼 스타일, 3D 좌표 입력을 AutoCAD와 같게 만드는 단계다. 솔리드 모델링은 다음 단계다.

```text
PHASE 21 — 3D foundation: UCS, views, navigation, visual styles
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–20 are done.

Goal: work in 3D space with AutoCAD's coordinate systems, views, and display styles.

Build:
- UCS with every option (origin, Face, NAmed, OBject, Previous, View, World, X/Y/Z rotation, ZAxis, 3-point), UCSMAN, the 3D UCS icon and UCSICON properties, UCS icon grips, UCSFOLLOW, UCSVP, UCSORTHO, PLAN, dynamic UCS (F6, Ctrl+D). Correct OCS handling (the arbitrary axis algorithm) for every planar entity, plus ELEVATION and THICKNESS.
- Views and navigation: VPOINT, DDVPOINT, DVIEW (every option), 3DORBIT, 3DFORBIT, 3DCORBIT, 3DDISTANCE, 3DSWIVEL, 3DZOOM, 3DPAN, 3DWALK/3DFLY, the ViewCube (faces, edges, corners, Home, rotate arrows, compass, UCS menu, perspective/parallel switch), NAVBAR, preset views (Top, Bottom, Left, Right, Front, Back, SW/SE/NE/NW Isometric), PERSPECTIVE, CAMERA.
- In-canvas viewport controls [-][평면도][2D 와이어프레임] with their menus.
- Visual styles: 2D 와이어프레임, 와이어프레임, 숨김, 사실적, 개념, 음영처리, 모서리로 음영처리, 회색 음영, 스케치, X-ray; the VISUALSTYLES manager with all face, edge, environment, and lighting settings; VSCURRENT, SHADEMODE, HIDE.
- 3D display pipeline: depth, edges and silhouettes, hidden-line removal, default lighting, backgrounds.
- Legacy 3D entities: 3DFACE (invisible edges), 3DPOLY, PFACE, 3DMESH, RULESURF, TABSURF, REVSURF, EDGESURF (SURFTAB1, SURFTAB2).
- 3D input and editing: x,y,z, spherical and cylindrical coordinates, 3D object snaps (3DOSMODE, F4), 3DMOVE, 3DROTATE, 3DSCALE gizmos (DEFAULTGIZMO), 3DMIRROR, 3DARRAY, 3DALIGN.

Acceptance:
- [ ] UCS 3-point on a tilted plane, then a circle, gives a circle whose DXF extrusion vector and OCS center match AutoCAD's.
- [ ] Clicking a ViewCube corner gives the matching isometric view; Shift+middle drag orbits.
- [ ] Hidden and Conceptual styles show 3DFACE and mesh models correctly.
```

## Phase 22 — 3D 모델링

OpenCASCADE 커널 위에 AutoCAD의 솔리드·표면·메쉬 모델링을 올리는 단계다. 커널 연결 방식(WASM과 네이티브)은 이 단계에서 성능을 재보고 고른다.

```text
PHASE 22 — 3D modeling: solids, surfaces, meshes
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–21 are done.

Goal: AutoCAD's solid, surface, and mesh modeling on an OpenCASCADE kernel.

Build:
- Kernel3D: benchmark a maintained OCCT WASM build against a native OCCT bridge from Rust, choose one, and record why. B-rep storage; adaptive tessellation (FACETRES, ISOLINES, DISPSILH); subobject picking with Ctrl+click (faces, edges, vertices; SUBOBJSELECTIONMODE); long operations in workers, cancellable with Esc.
- Primitives: BOX, WEDGE, CONE (elliptical, frustum), CYLINDER (elliptical, axis endpoint), SPHERE, TORUS, PYRAMID, POLYSOLID, PLANESURF.
- Creation: EXTRUDE (direction, path, taper angle, solid or surface mode), REVOLVE, SWEEP (alignment, base point, scale, twist, bank), LOFT (cross sections, guides, path, settings), PRESSPULL (several at once with Ctrl), THICKEN, CONVTOSOLID, CONVTOSURFACE, CONVTONURBS, XEDGES.
- Editing: UNION, SUBTRACT, INTERSECT, INTERFERE, SLICE (every plane option; keep one or both sides), SECTION, SECTIONPLANE with live section, FLATSHOT, SOLIDEDIT (faces, edges, body: imprint, separate, shell, clean, check), FILLETEDGE, CHAMFEREDGE, OFFSETEDGE, IMPRINT.
- Surfaces: SURFBLEND, SURFPATCH, SURFNETWORK, SURFOFFSET, SURFFILLET, SURFTRIM, SURFUNTRIM, SURFEXTEND, SURFSCULPT, NURBS CV editing (3DEDITBAR).
- Meshes: MESH primitives, MESHSMOOTH, MESHSMOOTHMORE/LESS, MESHREFINE, MESHCREASE/UNCREASE, MESHSPLIT, MESHEXTRUDE, MESHMERGE, MESHCAP, MESHCOLLAPSE, MESHSPIN, MESHOPTIONS, conversion to solids.
- MASSPROP for solids (volume, centroid, moments, products and radii of gyration, principal moments).
- Exchange: STEP, IGES, STL, OBJ import and export through OCCT. ACIS data in DXF/DWG (3DSOLID, REGION, BODY, SURFACE): always preserve the raw SAT/SAB; read analytic and spline faces into OCCT when possible, otherwise show a display-only proxy; record writing limits in docs/DECISIONS.md.

Acceptance:
- [ ] BOX minus CYLINDER, then FILLETEDGE on the hole edge, gives the same MASSPROP volume AutoCAD reports for the same model.
- [ ] PRESSPULL on a closed boundary extrudes live with dynamic input.
- [ ] A STEP file imports, displays in the Realistic style, and exports back.
- [ ] 3D solids in my DWG/DXF files display and survive save and reopen.
```

## Phase 23 — 시각화, 렌더링, 3D 도면화

재질·조명·렌더링과, 3D 모델에서 투상·단면·상세도를 뽑는 도면화 기능을 만드는 단계다. 투상법 기본값은 제3각법이다.

```text
PHASE 23 — Visualization, rendering, 3D documentation
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–22 are done.

Goal: materials, lights, rendering, and drawing views generated from 3D models.

Build:
- A materials browser and editor with a small original library, MATERIALATTACH by layer, MATERIALMAP.
- Lights: POINTLIGHT, SPOTLIGHT, DISTANTLIGHT, the sun with geographic location and Korea Standard Time (SUNPROPERTIES), viewport shadows.
- RENDER with presets, a render window, and image saving; BACKGROUND (solid, gradient, image, sun and sky); RENDERENVIRONMENT.
- Model documentation: VIEWBASE, VIEWPROJ, VIEWSECTION, VIEWDETAIL, VIEWEDIT, VIEWUPDATE, and VIEWSTD with third-angle projection (제3각법) as the default and first-angle as an option; associative updates when the model changes.
- 3DPRINT and STLOUT. Shaded and rendered viewport plotting in layouts.

Acceptance:
- [ ] A base view plus projected and section views of a solid update when the solid is edited.
- [ ] Rendering a simple scene with the sun and materials saves a PNG.
```

## Phase 24 — 성능과 실제 도면 호환성 강화

크고 지저분한 실제 도면에서도 빠르고 죽지 않게 만드는 단계다. 이때 내 도면 묶음(test-corpus)이 가장 많이 쓰인다.

```text
PHASE 24 — Performance and real-world compatibility hardening
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–23 are done.

Goal: HanCAD is fast and safe on large, messy, real drawings.

Do:
- A benchmark suite with thresholds that fail the build: open time, memory, pan/zoom fps, osnap latency, regen time, save time, on generated and corpus drawings. Profile and optimize (workers, WASM, GPU instancing, level of detail for hatches and text, culling, incremental indexing).
- A compatibility campaign on test-corpus/ and public DXF samples: open, save as DXF and DWG, reopen in HanCAD (I will also check in AutoCAD or DWG TrueView). Write docs/COMPAT_REPORT.md with every failure and its fix.
- Fuzz the DXF parser; corrupt files must never crash the app (AUDIT and RECOVER repair them).
- Parity audit: walk docs/COMMANDS.md and docs/PARITY_CHECKLIST.md, compare every command's prompts, options, and sysvars with Autodesk's documentation, and fix the gaps.
- Stability: open and close 100 drawings with no memory growth; an 8-hour soak test of random commands with undo/redo integrity checks; a crash handler that saves recovery copies.
- High-DPI, multiple monitors, 4K, and Windows display scaling.

Acceptance:
- [ ] All benchmarks pass their thresholds; the soak test finishes with zero integrity errors.
- [ ] docs/COMPAT_REPORT.md shows no open data-loss issues.
```

## Phase 25 — 패키징과 배포

Windows 설치 파일과, 첫 실행 때 내 AutoCAD 설정(별칭·글꼴·우클릭 동작)을 가져오는 마법사를 만드는 마지막 단계다.

```text
PHASE 25 — Packaging and release
Follow the Standard Phase Protocol in AGENTS.md. Phases 0–24 are done.

Goal: a clean Windows installer and a first-run setup that brings over my AutoCAD habits.

Do:
- An installer through the Tauri bundler (MSI or NSIS) with a Korean UI, per-user install, original icons, a Start menu entry, and an uninstaller that can keep user settings.
- File associations for .dxf; for .dwg only if I agree (AutoCAD may already be installed), off by default.
- A first-run wizard in Korean: import acad.pgp and .cuix, set the SHX font folder, the ODA File Converter path, right-click behavior, background color, and workspace.
- Settings migration between versions, an optional update check (off by default), and a portable zip build.
- docs/USER_GUIDE_KO.md: a Korean user guide plus a command reference generated from the command registry; F1 help uses the same content.
- A NOTICE file with third-party licenses; GPL components (LibreDWG) stay isolated as designed.
- A final test on a fresh Windows user account, offline.

Acceptance:
- [ ] Installing on a clean account and running the wizard gives a working HanCAD with my aliases and fonts.
- [ ] Uninstalling leaves nothing behind except the settings I chose to keep.
```

## 보조 프롬프트

Phase 중간에 필요할 때마다 꺼내 쓰는 다섯 가지다. 꺾쇠 괄호(<...>) 부분만 채워 붙여넣으면 되고, 증상은 한국어로 적어도 된다.

### 이어하기 (새 세션을 열 때마다)

```text
Continue the current phase. Read AGENTS.md and docs/PROGRESS.md, run the full test suite, then resume exactly at the next step recorded in docs/PROGRESS.md. Follow the Standard Phase Protocol. When you stop, report to me in Korean: what you finished, what is left in this phase, and how I can test the new parts by hand.
```

### 버그 수정

```text
Bug report. I describe it below, possibly in Korean.
Symptom: <what happened>
Steps to reproduce: <keystrokes and clicks>
What AutoCAD does instead: <expected behavior>
Fix it the AutoCAD-faithful way: first reproduce it with a failing test (a headless command script or a unit test), then fix the root cause, keep every test green, add the case to docs/PARITY_CHECKLIST.md if it was a parity issue, and commit. Explain the cause and the fix to me in Korean.
```

### 사용감 감사 (특정 명령이 AutoCAD와 다르게 느껴질 때)

```text
Parity audit for these commands: <COMMAND NAMES>.
Compare our implementation with Autodesk's official documentation (Korean-edition wording) for: every prompt string and its order, every option and keyword letter, defaults and remembered values, related system variables, grips, dynamic input, command preview, right-click menus, undo behavior, and error messages. Write a gap table in docs/parity/<command>.md, fix every gap, add a headless test for each prompt path, and report the fixed gaps to me in Korean.
```

### 회귀 점검 (몇 단계마다 한 번)

```text
Run a full regression pass: pnpm verify, the DXF round-trip corpus, renderer golden images, performance benchmarks, and an end-to-end script that draws, modifies, dimensions, hatches, saves, reopens, and plots a sample drawing. Fix every failure, then report the results to me in Korean as a table (area, status, notes).
```

### 내 AutoCAD 설정 가져오기 (Phase 3 이후 아무 때나)

```text
I will give you files from my AutoCAD setup: acad.pgp, my .cuix (if any), the path of my SHX font folder, my .ctb plot styles, and my LISP files. Import whatever the current phase supports: merge my aliases, map keyboard shortcuts and double-click actions from the CUIx, register the font folder as a support path, add the CTBs to the plot style list, and add my LISP files to the Startup Suite. Anything the app cannot import yet goes into docs/PROGRESS.md as a pending item. Report in Korean what was imported and what was not.
```

## 참고 자료

스택과 단축키 기준을 정할 때 확인한 페이지다. 라이브러리 버전은 작업 시점에 AI가 다시 확인하도록 해 두었다.

- [ODA File Converter](https://www.opendesign.com/guestfiles/oda_file_converter) — 무료 DWG↔DXF 변환기, Windows 10 이상 x64, GUI와 명령줄 지원
- [libredwg-web](https://github.com/mlightcad/libredwg-web) — LibreDWG 기반 DWG 읽기(WASM), GPL-3.0
- [planegcs](https://github.com/Salusoft89/planegcs) — FreeCAD 2D 구속조건 솔버의 WASM 포트, LGPL-2.1
- [cavalier_contours](https://docs.rs/crate/cavalier_contours/latest) — 호 포함 폴리선 간격띄우기·불리언(Rust), 반원 초과 호와 둥근 모서리 외 조인 미지원
- [AutoCAD 단축키·임시 재지정 키 기본값](https://documentation.help/AutoCAD-ACG/WS73099cc142f4875513fb5cd10c4aa30d6b-7c57.htm) — Autodesk 도움말 보관본
