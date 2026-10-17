# Commands

The command table is generated from the Phase 03 catalog (`packages/commands/src/catalog/`) and the built-in alias tables by `pnpm docs:commands`; only the implementation status column is edited by hand. Every registered command has Korean/English display names, Korean/English help text, ObjectARX-style flags and the original phase that owns its complete implementation. Registration does not implement a feature: unimplemented commands print the Korean not-implemented message. Advanced 2D options and 3D are deferred. Full AutoCAD option/prompt parity is pending.

| Command             | Aliases                                             | 한국어                     | Implementation status                                                                                                                   |
| ------------------- | --------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 3DALIGN             | 3AL                                                 | 3D 정렬                    | Not implemented; explicit message (Phase 22)                                                                                            |
| 3DARRAY             | 3A                                                  | 3D 배열                    | Not implemented; explicit message (Phase 22)                                                                                            |
| 3DFACE              | 3F                                                  | 3D 면                      | Not implemented; explicit message (Phase 22)                                                                                            |
| 3DMOVE              | 3M                                                  | 3D 이동                    | Not implemented; explicit message (Phase 22)                                                                                            |
| 3DORBIT             | 3DO, ORBIT                                          | 궤도                       | Not implemented; explicit message (Phase 21)                                                                                            |
| 3DPOLY              | 3P                                                  | 3D 폴리선                  | Not implemented; explicit message (Phase 22)                                                                                            |
| 3DPRINT             | 3DP, 3DPLOT, RAPIDPROTOTYPE                         | 3D 인쇄                    | Not implemented; explicit message (Phase 23)                                                                                            |
| 3DROTATE            | 3R                                                  | 3D 회전                    | Not implemented; explicit message (Phase 22)                                                                                            |
| 3DSCALE             | 3S                                                  | 3D 축척                    | Not implemented; explicit message (Phase 22)                                                                                            |
| 3DWALK              | 3DNAVIGATE, 3DW                                     | 3D 보행                    | Not implemented; explicit message (Phase 21)                                                                                            |
| ACTRECORD           | ARR                                                 | 동작 기록                  | Not implemented; explicit message (Phase 20)                                                                                            |
| ACTSTOP             | -ARS, ARS                                           | 기록 중지                  | Not implemented; explicit message (Phase 20)                                                                                            |
| ACTUSERINPUT        | ARU                                                 | 사용자 입력 요청           | Not implemented; explicit message (Phase 20)                                                                                            |
| ACTUSERMESSAGE      | -ARM, ARM                                           | 사용자 메시지 삽입         | Not implemented; explicit message (Phase 20)                                                                                            |
| ADCENTER            | ADC, ADCENTER, CONTENT, DC, DCENTER                 | 디자인센터                 | Not implemented; explicit message (Phase 20)                                                                                            |
| ADDSELECTED         |                                                     | 선택 항목 추가             | Not implemented; explicit message (Phase 06)                                                                                            |
| AI_SELALL           |                                                     | 모두 선택                  | Not implemented; explicit message (Phase 05)                                                                                            |
| ALIASEDIT           |                                                     | 별칭 편집                  | Aliases, external commands, AutoCorrect and synonym lists; user acad.pgp file                                                           |
| ALIGN               | AL                                                  | 정렬                       | Not implemented; explicit message (Phase 07)                                                                                            |
| ALLPLAY             | APLAY                                               | 모두 재생                  | Not implemented; explicit message (Phase 23)                                                                                            |
| ANALYSISCURVATURE   | CURVATUREANALYSIS                                   | 곡률 해석                  | Not implemented; explicit message (Phase 22)                                                                                            |
| ANALYSISDRAFTANGLE  | DRAFTANGLEANALYSIS                                  | 구배 해석                  | Not implemented; explicit message (Phase 22)                                                                                            |
| ANALYSISZEBRA       | ZEBRA                                               | 얼룩말 해석                | Not implemented; explicit message (Phase 22)                                                                                            |
| APPLOAD             | AP                                                  | 응용프로그램 로드          | Not implemented; explicit message (Phase 19)                                                                                            |
| ARC                 | A                                                   | 호                         | Not implemented; explicit message (Phase 06)                                                                                            |
| AREA                | AA                                                  | 면적                       | Not implemented; explicit message (Phase 15)                                                                                            |
| ARRAY               | -AR, AR                                             | 배열                       | Not implemented; explicit message (Phase 07)                                                                                            |
| ARRAYPATH           |                                                     | 경로 배열                  | Not implemented; explicit message (Phase 07)                                                                                            |
| ARRAYPOLAR          |                                                     | 원형 배열                  | Not implemented; explicit message (Phase 07)                                                                                            |
| ARRAYRECT           |                                                     | 직사각형 배열              | Not implemented; explicit message (Phase 07)                                                                                            |
| ATTDEF              | -ATT, ATT, DDATTDEF                                 | 속성 정의                  | Not implemented; explicit message (Phase 13)                                                                                            |
| ATTEDIT             | -ATE, ATE, ATTE, DDATTE                             | 속성 편집                  | Not implemented; explicit message (Phase 13)                                                                                            |
| ATTEXT              | DDATTEXT                                            | 속성 추출                  | Not implemented; explicit message (Phase 13)                                                                                            |
| ATTIPEDIT           | ATI                                                 | 내부 속성 편집             | Not implemented; explicit message (Phase 13)                                                                                            |
| AUDIT               |                                                     | 감사                       | Not implemented; explicit message (Phase 09)                                                                                            |
| BACTION             | AC                                                  | 동작                       | Not implemented; explicit message (Phase 17)                                                                                            |
| BCLOSE              | BC                                                  | 블록 편집기 닫기           | Not implemented; explicit message (Phase 17)                                                                                            |
| BCPARAMETER         | CPARAM                                              | 구속조건 매개변수          | Not implemented; explicit message (Phase 18)                                                                                            |
| BEDIT               | BE                                                  | 블록 편집기                | Not implemented; explicit message (Phase 17)                                                                                            |
| BLEND               |                                                     | 혼합 곡선                  | Not implemented; explicit message (Phase 07)                                                                                            |
| BLOCK               | ACADBLOCKDIALOG, -B, B, BMAKE, BMOD                 | 블록 작성                  | Not implemented; explicit message (Phase 13)                                                                                            |
| BOUNDARY            | -BO, BO, BPOLY                                      | 경계                       | Not implemented; explicit message (Phase 12)                                                                                            |
| BPARAMETER          | PARAM                                               | 매개변수                   | Not implemented; explicit message (Phase 17)                                                                                            |
| BREAK               | BR                                                  | 끊기                       | Not implemented; explicit message (Phase 07)                                                                                            |
| BREAKATPOINT        |                                                     | 점에서 끊기                | Not implemented; explicit message (Phase 07)                                                                                            |
| BSAVE               | BS                                                  | 블록 저장                  | Not implemented; explicit message (Phase 17)                                                                                            |
| BVSTATE             | BVS                                                 | 가시성 상태                | Not implemented; explicit message (Phase 17)                                                                                            |
| CAL                 |                                                     | 계산기                     | Not implemented; explicit message (Phase 03)                                                                                            |
| CAMERA              | CAM                                                 | 카메라                     | Not implemented; explicit message (Phase 21)                                                                                            |
| CENTERLINE          |                                                     | 중심선                     | Not implemented; explicit message (Phase 11)                                                                                            |
| CENTERMARK          |                                                     | 중심 표식                  | Not implemented; explicit message (Phase 11)                                                                                            |
| CHAMFER             | CHA                                                 | 모따기                     | Not implemented; explicit message (Phase 07)                                                                                            |
| CHANGE              | -CH                                                 | 변경                       | Not implemented; explicit message (Phase 07)                                                                                            |
| CHECKSTANDARDS      | CHK                                                 | 표준 확인                  | Not implemented; explicit message (Phase 20)                                                                                            |
| CHPROP              |                                                     | 특성 변경                  | Not implemented; explicit message (Phase 08)                                                                                            |
| CIRCLE              | C                                                   | 원                         | Partial / Center and numeric or picked radius                                                                                           |
| CLEANSCREENOFF      |                                                     | 화면 정리 끄기             | Not implemented; explicit message (Phase 03)                                                                                            |
| CLEANSCREENON       |                                                     | 화면 정리                  | Not implemented; explicit message (Phase 03)                                                                                            |
| CLOSE               |                                                     | 닫기                       | Not implemented; explicit message (Phase 09)                                                                                            |
| CLOSEALL            |                                                     | 모두 닫기                  | Not implemented; explicit message (Phase 09)                                                                                            |
| COLOR               | COL, COLOUR, DDCOLOR                                | 색상                       | Not implemented; explicit message (Phase 08)                                                                                            |
| COMMANDLINE         | CLI                                                 | 명령행                     | Shows the hidden command window (also Ctrl+9)                                                                                           |
| COMMANDLINEHIDE     |                                                     | 명령행 숨기기              | Hides the command window without confirmation (also Ctrl+9)                                                                             |
| CONSTRAINTBAR       | CBAR                                                | 구속조건 막대              | Not implemented; explicit message (Phase 18)                                                                                            |
| CONSTRAINTSETTINGS  | CSETTINGS                                           | 구속조건 설정              | Not implemented; explicit message (Phase 18)                                                                                            |
| COPY                | CO, CP                                              | 복사                       | Selection, base/second point, repeated copies, Exit/Enter/Esc; one undo group                                                           |
| COPYBASE            |                                                     | 기준점을 사용하여 복사     | Not implemented; explicit message (Phase 05)                                                                                            |
| COPYCLIP            |                                                     | 복사                       | Not implemented; explicit message (Phase 05)                                                                                            |
| COUNT               |                                                     | 개수                       | Not implemented; explicit message (Phase 15)                                                                                            |
| CTABLESTYLE         | CT                                                  | 현재 테이블 스타일         | Not implemented; explicit message (Phase 16)                                                                                            |
| CUI                 |                                                     | 사용자 인터페이스 사용자화 | Not implemented; explicit message (Phase 20)                                                                                            |
| CUTCLIP             |                                                     | 잘라내기                   | Not implemented; explicit message (Phase 05)                                                                                            |
| CVADD               | INSERTCONTROLPOINT                                  | 조정 정점 추가             | Not implemented; explicit message (Phase 22)                                                                                            |
| CVHIDE              | POINTOFF                                            | 조정 정점 숨기기           | Not implemented; explicit message (Phase 22)                                                                                            |
| CVREBUILD           | REBUILD                                             | 재작성                     | Not implemented; explicit message (Phase 22)                                                                                            |
| CVREMOVE            | REMOVECONTROLPOINT                                  | 조정 정점 제거             | Not implemented; explicit message (Phase 22)                                                                                            |
| CVSHOW              | POINTON                                             | 조정 정점 표시             | Not implemented; explicit message (Phase 22)                                                                                            |
| CYLINDER            | CYL                                                 | 원통                       | Not implemented; explicit message (Phase 22)                                                                                            |
| DATAEXTRACTION      | DX                                                  | 데이터 추출                | Not implemented; explicit message (Phase 16)                                                                                            |
| DATALINK            | DL                                                  | 데이터 링크                | Not implemented; explicit message (Phase 16)                                                                                            |
| DATALINKUPDATE      | DLU                                                 | 데이터 링크 업데이트       | Not implemented; explicit message (Phase 16)                                                                                            |
| DBCONNECT           | AAD, AEX, ALI, ARO, ASE, ASQ, DBC                   | 데이터베이스 연결          | Not implemented; explicit message (Phase 20)                                                                                            |
| DDEDIT              |                                                     | 문자 편집                  | Not implemented; explicit message (Phase 10)                                                                                            |
| DDGRIPS             | GR                                                  | 그립 옵션                  | Not implemented; explicit message (Phase 05)                                                                                            |
| DDPTYPE             |                                                     | 점 스타일                  | Not implemented; explicit message (Phase 06)                                                                                            |
| DDVPOINT            | VP                                                  | 관측점 사전 설정           | Not implemented; explicit message (Phase 21)                                                                                            |
| DELAY               |                                                     | 지연                       | Not implemented; explicit message (Phase 19)                                                                                            |
| DELCONSTRAINT       | DELCON                                              | 구속조건 삭제              | Not implemented; explicit message (Phase 18)                                                                                            |
| DEVMACRO            |                                                     | 매크로 시험                | Dev-only; runs a typed menu macro (development builds or ?devtools=1)                                                                   |
| DEVSTRESS           |                                                     | 렌더러 부하 시험           | Dev-only nonpersistent renderer dataset, 0-1000000 entities                                                                             |
| DIM                 |                                                     | 치수                       | Partial / Smart line, circle and arc dimensions with hover preview                                                                      |
| DIMALIGNED          | DAL, DIMALI                                         | 정렬                       | Two points or object, placement, Text and text Angle                                                                                    |
| DIMANGULAR          | DAN, DIMANG                                         | 각도                       | Three points, two lines, arc or circle; placement, Text and text Angle                                                                  |
| DIMARC              | DAR                                                 | 호 길이                    | Not implemented; explicit message (Phase 11)                                                                                            |
| DIMBASELINE         | DBA, DIMBASE                                        | 기준선                     | Not implemented; explicit message (Phase 11)                                                                                            |
| DIMBREAK            |                                                     | 치수 끊기                  | Not implemented; explicit message (Phase 11)                                                                                            |
| DIMCENTER           | DCE                                                 | 중심 표식                  | Not implemented; explicit message (Phase 11)                                                                                            |
| DIMCONSTRAINT       | DCON                                                | 치수 구속조건              | Not implemented; explicit message (Phase 18)                                                                                            |
| DIMCONTINUE         | DCO, DIMCONT                                        | 계속                       | Not implemented; explicit message (Phase 11)                                                                                            |
| DIMDIAMETER         | DDI, DIMDIA                                         | 지름                       | Circle/arc selection, placement, Text and text Angle                                                                                    |
| DIMDISASSOCIATE     | DDA                                                 | 치수 연관 해제             | Not implemented; explicit message (Phase 11)                                                                                            |
| DIMEDIT             | DED, DIMED                                          | 치수 편집                  | Not implemented; explicit message (Phase 11)                                                                                            |
| DIMJOGGED           | DJO, JOG                                            | 꺾기                       | Not implemented; explicit message (Phase 11)                                                                                            |
| DIMJOGLINE          | DJL                                                 | 치수 꺾기선                | Not implemented; explicit message (Phase 11)                                                                                            |
| DIMLINEAR           | DIMHORIZONTAL, DIMLIN, DIMROTATED, DIMVERTICAL, DLI | 선형                       | Two points or object, H/V/Rotated, placement, Text and text Angle                                                                       |
| DIMORDINATE         | DIMORD, DOR                                         | 세로좌표                   | Not implemented; explicit message (Phase 11)                                                                                            |
| DIMOVERRIDE         | DIMOVER, DOV                                        | 치수 재지정                | Not implemented; explicit message (Phase 11)                                                                                            |
| DIMRADIUS           | DIMRAD, DRA                                         | 반지름                     | Circle/arc selection, placement, Text and text Angle                                                                                    |
| DIMREASSOCIATE      | DRE                                                 | 치수 재연관                | Not implemented; explicit message (Phase 11)                                                                                            |
| DIMSPACE            |                                                     | 치수 공간                  | Not implemented; explicit message (Phase 11)                                                                                            |
| DIMSTYLE            | D, DDIM, DIMSTY, DST                                | 치수 스타일                | Basic supported-variable dialog; explicit selected-dimension application                                                                |
| DIMTEDIT            | DIMTED                                              | 치수 문자 편집             | Not implemented; explicit message (Phase 11)                                                                                            |
| DIST                | DI                                                  | 거리                       | Two-point decimal distance, WCS deltas and angle; read-only preview                                                                     |
| DIVIDE              | DIV                                                 | 등분할                     | Not implemented; explicit message (Phase 06)                                                                                            |
| DONUT               | DO, DOUGHNUT                                        | 도넛                       | Not implemented; explicit message (Phase 06)                                                                                            |
| DRAWINGRECOVERY     | DRM                                                 | 도면 복구 관리자           | Not implemented; explicit message (Phase 09)                                                                                            |
| DRAWORDER           | DR                                                  | 그리기 순서                | Not implemented; explicit message (Phase 07)                                                                                            |
| DSETTINGS           | DDRMODES, DS, SE                                    | 제도 설정                  | Seven Korean drafting tabs, live sysvar controls, remembered tab, transactional drawing settings; unit and browser coverage             |
| DSVIEWER            | AV                                                  | 조감 뷰                    | Not implemented; explicit message (Phase 21)                                                                                            |
| DVIEW               | DV                                                  | 동적 뷰                    | Not implemented; explicit message (Phase 21)                                                                                            |
| EDITSHOT            | ESHOT                                               | 샷 편집                    | Not implemented; explicit message (Phase 23)                                                                                            |
| ELEV                |                                                     | 고도                       | Not implemented; explicit message (Phase 21)                                                                                            |
| ELLIPSE             | EL                                                  | 타원                       | Not implemented; explicit message (Phase 06)                                                                                            |
| ERASE               | DELETE, E                                           | 지우기                     | Partial / Pick or preselection; Delete shortcut                                                                                         |
| ETRANSMIT           |                                                     | 전송                       | Not implemented; explicit message (Phase 09)                                                                                            |
| EXPLODE             | X                                                   | 분해                       | Not implemented; explicit message (Phase 07)                                                                                            |
| EXPORT              | EXP, -QPUB                                          | 내보내기                   | Not implemented; explicit message (Phase 09)                                                                                            |
| EXPORTDWF           | EDWF                                                | DWF 내보내기               | Not implemented; explicit message (Phase 14)                                                                                            |
| EXPORTDWFX          | EDWFX                                               | DWFx 내보내기              | Not implemented; explicit message (Phase 14)                                                                                            |
| EXPORTJPG           |                                                     | JPG 내보내기               | White background raster, maximum 2400 px                                                                                                |
| EXPORTLAYOUT        |                                                     | 배치를 모형으로 내보내기   | Not implemented; explicit message (Phase 14)                                                                                            |
| EXPORTPDF           | EPDF                                                | PDF 내보내기               | Partial / Visible supported geometry on A4 raster PDF                                                                                   |
| EXPORTPNG           |                                                     | PNG 내보내기               | White background raster, maximum 2400 px                                                                                                |
| EXPORTSVG           |                                                     | SVG 내보내기               | Vector supported entities with fixed screen strokes                                                                                     |
| EXPORTTOAUTOCAD     | AECTOACAD                                           | 일반 DWG로 내보내기        | Not implemented; explicit message (Phase 09)                                                                                            |
| EXTEND              | EX                                                  | 연장                       | LINE targets, supported boundaries, Quick/Standard, Shift, fence, Edge, local Undo                                                      |
| EXTERNALREFERENCES  | ER                                                  | 외부 참조                  | Not implemented; explicit message (Phase 13)                                                                                            |
| EXTRUDE             | EXT                                                 | 돌출                       | Not implemented; explicit message (Phase 22)                                                                                            |
| FILL                |                                                     | 채우기                     | Not implemented; explicit message (Phase 06)                                                                                            |
| FILLET              | F                                                   | 모깎기                     | Not implemented; explicit message (Phase 07)                                                                                            |
| FILTER              | FI                                                  | 필터                       | Not implemented; explicit message (Phase 05)                                                                                            |
| FIND                |                                                     | 찾기                       | Not implemented; explicit message (Phase 10)                                                                                            |
| FLATSHOT            | FSHOT                                               | 평면 스냅샷                | Not implemented; explicit message (Phase 23)                                                                                            |
| GEOGRAPHICLOCATION  | GEO, NORTH, NORTHDIR                                | 지리적 위치                | Not implemented; explicit message (Phase 21)                                                                                            |
| GEOMCONSTRAINT      | GCON                                                | 기하학적 구속조건          | Not implemented; explicit message (Phase 18)                                                                                            |
| GETVAR              |                                                     | 시스템 변수 값 표시        | Partial / 860 typed definitions; unresolved host defaults report unavailable                                                            |
| GRADIENT            | GD                                                  | 그라데이션                 | Not implemented; explicit message (Phase 12)                                                                                            |
| GRAPHSCR            |                                                     | 그래픽 화면                | Closes the text window                                                                                                                  |
| GRID                |                                                     | 그리드                     | Implemented / spacing, X multiples, On/Off, Snap, Major, Adaptive, Limits, Follow, Aspect; drafting-commands tests                      |
| GROUP               | -G, G                                               | 그룹                       | Not implemented; explicit message (Phase 05)                                                                                            |
| HANPROGRESS         |                                                     | 개발 진행 상황             | Current features, limitations and all 26 phase statuses                                                                                 |
| HANSAVE             |                                                     | HCD 저장                   | Full native .hcd graph and blob download                                                                                                |
| HATCH               | BH, -H, H                                           | 해치                       | Not implemented; explicit message (Phase 12)                                                                                            |
| HATCHEDIT           | HE                                                  | 해치 편집                  | Not implemented; explicit message (Phase 12)                                                                                            |
| HATCHTOBACK         | HB                                                  | 해치를 뒤로 보내기         | Not implemented; explicit message (Phase 12)                                                                                            |
| HELIX               |                                                     | 나선                       | Not implemented; explicit message (Phase 06)                                                                                            |
| HELP                |                                                     | 도움말                     | Implemented: registry-generated contextual help, command search, F1 and transparent resume                                              |
| HIDE                | HI                                                  | 숨기기                     | Not implemented; explicit message (Phase 21)                                                                                            |
| HIDEOBJECTS         |                                                     | 객체 숨기기                | Not implemented; explicit message (Phase 15)                                                                                            |
| HIDEPALETTES        | POFF                                                | 팔레트 숨기기              | Not implemented; explicit message (Phase 20)                                                                                            |
| HYPERLINK           |                                                     | 하이퍼링크                 | Not implemented; explicit message (Phase 13)                                                                                            |
| ID                  |                                                     | 점 좌표                    | Not implemented; explicit message (Phase 15)                                                                                            |
| IMAGE               | -IM, IM                                             | 이미지                     | Not implemented; explicit message (Phase 13)                                                                                            |
| IMAGEADJUST         | IAD                                                 | 이미지 조정                | Not implemented; explicit message (Phase 13)                                                                                            |
| IMAGEATTACH         | IAT                                                 | 이미지 부착                | Not implemented; explicit message (Phase 13)                                                                                            |
| IMAGECLIP           | ICL                                                 | 이미지 자르기              | Not implemented; explicit message (Phase 13)                                                                                            |
| IMPORT              | IMP                                                 | 가져오기                   | Not implemented; explicit message (Phase 09)                                                                                            |
| INPUTSEARCHOPTIONS  |                                                     | 검색 입력 옵션             | Dialog and -INPUTSEARCHOPTIONS; content search results pending later phases                                                             |
| INSERT              | DDINSERT, -I, I, INSERTURL                          | 삽입                       | Not implemented; explicit message (Phase 13)                                                                                            |
| INSERTOBJ           | IO                                                  | OLE 객체                   | Not implemented; explicit message (Phase 13)                                                                                            |
| INTERFERE           | INF                                                 | 간섭                       | Not implemented; explicit message (Phase 22)                                                                                            |
| INTERSECT           | IN                                                  | 교집합                     | Not implemented; explicit message (Phase 22)                                                                                            |
| ISODRAFT            |                                                     | 등각투영 제도              | Implemented / Orthographic, Left, Top, Right; drafting-commands tests                                                                   |
| ISOLATEOBJECTS      | ISOLATE                                             | 객체 격리                  | Not implemented; explicit message (Phase 15)                                                                                            |
| ISOPLANE            |                                                     | 등각평면                   | Implemented / Left, Top, Right and transparent prompts; drafting-commands tests                                                         |
| JOIN                | J                                                   | 결합                       | Not implemented; explicit message (Phase 07)                                                                                            |
| LAYER               | DDLMODES, -LA, LA                                   | 도면층 특성                | Not implemented; explicit message (Phase 08)                                                                                            |
| LAYERSTATE          | LAS, LMAN                                           | 도면층 상태 관리자         | Not implemented; explicit message (Phase 08)                                                                                            |
| LAYFRZ              |                                                     | 도면층 동결                | Not implemented; explicit message (Phase 08)                                                                                            |
| LAYISO              |                                                     | 도면층 격리                | Not implemented; explicit message (Phase 08)                                                                                            |
| LAYMCUR             |                                                     | 현재로 만들기              | Not implemented; explicit message (Phase 08)                                                                                            |
| LAYMRG              |                                                     | 도면층 병합                | Not implemented; explicit message (Phase 08)                                                                                            |
| LAYOFF              |                                                     | 도면층 끄기                | Not implemented; explicit message (Phase 08)                                                                                            |
| LAYON               |                                                     | 모든 도면층 켜기           | Turns on all layers of the transitional imported drawing                                                                                |
| LAYOUT              | LO                                                  | 배치                       | Not implemented; explicit message (Phase 14)                                                                                            |
| LAYUNISO            |                                                     | 도면층 격리 해제           | Not implemented; explicit message (Phase 08)                                                                                            |
| LAYWALK             |                                                     | 도면층 탐색                | Not implemented; explicit message (Phase 08)                                                                                            |
| LEADER              | LEAD                                                | 지시선                     | Not implemented; explicit message (Phase 11)                                                                                            |
| LENGTHEN            | LEN                                                 | 길이 조정                  | Not implemented; explicit message (Phase 07)                                                                                            |
| LIMITS              |                                                     | 도면 한계                  | Not implemented; explicit message (Phase 15)                                                                                            |
| LINE                | L                                                   | 선                         | Implemented / Phase 04 prompts, continuation, U/Close, unit/3D syntax, modifiers and deferred previews; fixtures and browser acceptance |
| LINETYPE            | DDLTYPE, -LT, LT, -LTYPE, LTYPE                     | 선종류                     | Not implemented; explicit message (Phase 08)                                                                                            |
| LIST                | LI, LS, SHOWMAT                                     | 리스트                     | Not implemented; explicit message (Phase 15)                                                                                            |
| LTSCALE             | LTS                                                 | 선종류 축척                | Partial / System variable alias                                                                                                         |
| LWEIGHT             | LINEWEIGHT, LW                                      | 선가중치                   | Not implemented; explicit message (Phase 08)                                                                                            |
| MARKUP              | MSM                                                 | 표식 세트 관리자           | Not implemented; explicit message (Phase 20)                                                                                            |
| MATBROWSEROPEN      | MAT, RMAT                                           | 재료 탐색기                | Not implemented; explicit message (Phase 23)                                                                                            |
| MATCHPROP           | MA, PAINTER                                         | 특성 일치                  | Not implemented; explicit message (Phase 07)                                                                                            |
| MATERIALMAP         | SETUV                                               | 재료 매핑                  | Not implemented; explicit message (Phase 23)                                                                                            |
| MATERIALS           | FINISH                                              | 재료 편집기                | Not implemented; explicit message (Phase 23)                                                                                            |
| MEASURE             | ME                                                  | 길이 분할                  | Not implemented; explicit message (Phase 06)                                                                                            |
| MEASUREGEOM         | MEA                                                 | 측정                       | Not implemented; explicit message (Phase 15)                                                                                            |
| MENU                |                                                     | 메뉴                       | Not implemented; explicit message (Phase 20)                                                                                            |
| MESHCREASE          | CREASE                                              | 주름 추가                  | Not implemented; explicit message (Phase 22)                                                                                            |
| MESHREFINE          | REFINE                                              | 메쉬 정밀화                | Not implemented; explicit message (Phase 22)                                                                                            |
| MESHSMOOTH          | CONVTOMESH, SMOOTH                                  | 부드러운 객체 변환         | Not implemented; explicit message (Phase 22)                                                                                            |
| MESHSMOOTHLESS      | LESS                                                | 덜 부드럽게                | Not implemented; explicit message (Phase 22)                                                                                            |
| MESHSMOOTHMORE      | MORE                                                | 더 부드럽게                | Not implemented; explicit message (Phase 22)                                                                                            |
| MESHSPLIT           | SPLIT                                               | 면 분할                    | Not implemented; explicit message (Phase 22)                                                                                            |
| MESHUNCREASE        | UNCREASE                                            | 주름 제거                  | Not implemented; explicit message (Phase 22)                                                                                            |
| MIRROR              | MI                                                  | 대칭                       | Not implemented; explicit message (Phase 07)                                                                                            |
| MIRROR3D            | 3DMIRROR                                            | 3D 대칭                    | Not implemented; explicit message (Phase 22)                                                                                            |
| MLEADER             | MLD                                                 | 다중 지시선                | Not implemented; explicit message (Phase 11)                                                                                            |
| MLEADERALIGN        | MLA                                                 | 다중 지시선 정렬           | Not implemented; explicit message (Phase 11)                                                                                            |
| MLEADERCOLLECT      | MLC                                                 | 다중 지시선 수집           | Not implemented; explicit message (Phase 11)                                                                                            |
| MLEADEREDIT         | MLE                                                 | 다중 지시선 편집           | Not implemented; explicit message (Phase 11)                                                                                            |
| MLEADERSTYLE        | MLS                                                 | 다중 지시선 스타일         | Not implemented; explicit message (Phase 11)                                                                                            |
| MLINE               | ML                                                  | 여러 줄                    | Not implemented; explicit message (Phase 16)                                                                                            |
| MOVE                | M                                                   | 이동                       | Preselection or pick/window selection, base/second point, exact/snapped input                                                           |
| MREDO               |                                                     | 다중 명령 복구             | Partial / Redo by count, All or Last                                                                                                    |
| MSPACE              | MS                                                  | 모형 공간                  | Not implemented; explicit message (Phase 14)                                                                                            |
| MTEXT               | MT, -T, T                                           | 여러 줄 문자               | Not implemented; explicit message (Phase 10)                                                                                            |
| MVIEW               | MV                                                  | 뷰포트                     | Not implemented; explicit message (Phase 14)                                                                                            |
| NAVSMOTION          | MOTION                                              | ShowMotion                 | Not implemented; explicit message (Phase 23)                                                                                            |
| NAVSMOTIONCLOSE     | MOTIONCLS                                           | ShowMotion 닫기            | Not implemented; explicit message (Phase 23)                                                                                            |
| NAVSWHEEL           | WHEEL                                               | SteeringWheels             | Not implemented; explicit message (Phase 21)                                                                                            |
| NAVVCUBE            | CUBE                                                | ViewCube                   | Not implemented; explicit message (Phase 21)                                                                                            |
| NEW                 |                                                     | 새로 만들기                | Partial / New independent DrawingN with metric defaults                                                                                 |
| NEWSHOT             | NSHOT                                               | 새 샷                      | Not implemented; explicit message (Phase 23)                                                                                            |
| NEWVIEW             | NVIEW                                               | 새 뷰                      | Not implemented; explicit message (Phase 21)                                                                                            |
| OFFSET              | O                                                   | 간격띄우기                 | Distance/two points/Through, Erase/Layer/Multiple/Exit/Undo; supported 2D subset                                                        |
| OOPS                |                                                     | 복원                       | Partial / Restore latest erase set across edits and tab reactivation                                                                    |
| OPEN                | DXFIN, OPENURL                                      | 열기                       | Partial / New document from HCD or lossy local DWG/DXF import                                                                           |
| OPTIONS             | OP, PREFERENCES                                     | 옵션                       | Display background controls; other Options tabs explicitly pending                                                                      |
| ORTHO               |                                                     | 직교                       | Implemented / On/Off and transparent prompts; drafting-commands tests                                                                   |
| OSNAP               | DDOSNAP, -OS, OS                                    | 객체 스냅 설정             | Object Snap settings tab; -OSNAP comma-separated modes, None/Off, aliases and headless tests                                            |
| OVERKILL            |                                                     | 중복 객체 삭제             | Not implemented; explicit message (Phase 07)                                                                                            |
| PAGESETUP           |                                                     | 페이지 설정 관리자         | Not implemented; explicit message (Phase 14)                                                                                            |
| PAN                 | -P, P                                               | 초점이동                   | Realtime left drag; -PAN base/second point or displacement, one navigation undo                                                         |
| PARAMETERS          | -PAR, PAR                                           | 매개변수 관리자            | Not implemented; explicit message (Phase 18)                                                                                            |
| PARTIALOPEN         | PARTIALOPEN                                         | 부분 열기                  | Not implemented; explicit message (Phase 09)                                                                                            |
| PASTEBLOCK          |                                                     | 블록으로 붙여넣기          | Not implemented; explicit message (Phase 05)                                                                                            |
| PASTECLIP           |                                                     | 붙여넣기                   | Not implemented; explicit message (Phase 05)                                                                                            |
| PASTEORIG           |                                                     | 원래 좌표로 붙여넣기       | Not implemented; explicit message (Phase 05)                                                                                            |
| PASTESPEC           | PA                                                  | 선택하여 붙여넣기          | Not implemented; explicit message (Phase 13)                                                                                            |
| PEDIT               | PE                                                  | 폴리선 편집                | Not implemented; explicit message (Phase 07)                                                                                            |
| PLAN                |                                                     | 평면도                     | Not implemented; explicit message (Phase 21)                                                                                            |
| PLINE               | PL                                                  | 폴리선                     | Partial / Straight vertices, Undo/Close; arc and width pending                                                                          |
| PLOT                | DWFOUT, PRINT                                       | 플롯                       | Not implemented; explicit message (Phase 14)                                                                                            |
| PLOTSTAMP           | DDPLOTSTAMP                                         | 플롯 스탬프                | Not implemented; explicit message (Phase 14)                                                                                            |
| POINT               | PO                                                  | 점                         | Not implemented; explicit message (Phase 06)                                                                                            |
| POINTCLOUD          | PC                                                  | 점 구름                    | Not implemented; explicit message (Phase 23)                                                                                            |
| POINTCLOUDATTACH    | PCATTACH                                            | 점 구름 부착               | Not implemented; explicit message (Phase 23)                                                                                            |
| POINTCLOUDINDEX     | PCINDEX                                             | 점 구름 색인               | Not implemented; explicit message (Phase 23)                                                                                            |
| POINTLIGHT          | FREEPOINT                                           | 점 조명                    | Not implemented; explicit message (Phase 23)                                                                                            |
| POLYGON             | POL                                                 | 폴리곤                     | Not implemented; explicit message (Phase 06)                                                                                            |
| POLYSOLID           | PSOLID                                              | 폴리솔리드                 | Not implemented; explicit message (Phase 22)                                                                                            |
| PREVIEW             | PRE                                                 | 플롯 미리보기              | Not implemented; explicit message (Phase 14)                                                                                            |
| PROPERTIES          | CH, DDCHPROP, DDMODIFY, MO, PR, PROPS               | 특성                       | Not implemented; explicit message (Phase 08)                                                                                            |
| PROPERTIESCLOSE     | PRCLOSE                                             | 특성 닫기                  | Not implemented; explicit message (Phase 08)                                                                                            |
| PSPACE              | PS                                                  | 도면 공간                  | Not implemented; explicit message (Phase 14)                                                                                            |
| PTYPE               |                                                     | 점 스타일                  | Not implemented; explicit message (Phase 06)                                                                                            |
| PUBLISH             |                                                     | 게시                       | Not implemented; explicit message (Phase 14)                                                                                            |
| PUBLISHTOWEB        | PTW                                                 | 웹에 게시                  | Not implemented; explicit message (Phase 23)                                                                                            |
| PURGE               | -PU, PU                                             | 소거                       | Not implemented; explicit message (Phase 15)                                                                                            |
| PYRAMID             | PYR                                                 | 피라미드                   | Not implemented; explicit message (Phase 22)                                                                                            |
| QDIM                |                                                     | 빠른 치수                  | Not implemented; explicit message (Phase 11)                                                                                            |
| QLEADER             | LE                                                  | 빠른 지시선                | Not implemented; explicit message (Phase 11)                                                                                            |
| QNEW                |                                                     | 새로 만들기                | Not implemented; explicit message (Phase 09)                                                                                            |
| QSAVE               |                                                     | 저장                       | Partial / Supported-entity DXF download                                                                                                 |
| QSELECT             |                                                     | 빠른 선택                  | Not implemented; explicit message (Phase 05)                                                                                            |
| QUICKCALC           | QC                                                  | 빠른 계산기                | Not implemented; explicit message (Phase 15)                                                                                            |
| QUICKCUI            | QCUI                                                | 빠른 CUI                   | Not implemented; explicit message (Phase 20)                                                                                            |
| QUICKPROPERTIES     | QP                                                  | 빠른 특성                  | Not implemented; explicit message (Phase 05)                                                                                            |
| QUIT                | EXIT                                                | 종료                       | Not implemented; explicit message (Phase 09)                                                                                            |
| QVDRAWING           | QVD                                                 | 빠른 뷰 도면               | Not implemented; explicit message (Phase 20)                                                                                            |
| QVDRAWINGCLOSE      | QVDC                                                | 빠른 뷰 도면 닫기          | Not implemented; explicit message (Phase 20)                                                                                            |
| QVLAYOUT            | QVL                                                 | 빠른 뷰 배치               | Not implemented; explicit message (Phase 20)                                                                                            |
| QVLAYOUTCLOSE       | QVLC                                                | 빠른 뷰 배치 닫기          | Not implemented; explicit message (Phase 20)                                                                                            |
| RAY                 |                                                     | 광선                       | Not implemented; explicit message (Phase 06)                                                                                            |
| RECOVER             |                                                     | 복구                       | Not implemented; explicit message (Phase 09)                                                                                            |
| RECTANG             | REC, RECTANGLE                                      | 직사각형                   | Partial / Two opposite corners                                                                                                          |
| REDEFINE            |                                                     | 재정의                     | Partial / Restore a command; argument form                                                                                              |
| REDO                |                                                     | 명령 복구                  | Partial / Restore last U/UNDO batch immediately; intervening command closes window                                                      |
| REDRAW              | R                                                   | 다시 그리기                | Refresh active viewport; retained geometry reused                                                                                       |
| REDRAWALL           | RA                                                  | 모두 다시 그리기           | Refresh the sole active viewport; multiple viewports belong to Phase 14                                                                 |
| REGEN               | RE                                                  | 재생성                     | Regenerate LOD, point symbols, fills and pick bounds                                                                                    |
| REGENALL            | REA                                                 | 모두 재생성                | Regenerate the sole active viewport                                                                                                     |
| REGION              | REG                                                 | 영역                       | Not implemented; explicit message (Phase 12)                                                                                            |
| REINIT              |                                                     | 재초기화                   | PGP file reload (also RE-INIT 16); digitizer options shown disabled                                                                     |
| RENAME              | -REN, REN                                           | 이름 바꾸기                | Not implemented; explicit message (Phase 15)                                                                                            |
| RENDER              | RR                                                  | 렌더                       | Not implemented; explicit message (Phase 23)                                                                                            |
| RENDERCROP          | RC                                                  | 자르기 렌더                | Not implemented; explicit message (Phase 23)                                                                                            |
| RENDERENVIRONMENT   | FOG                                                 | 렌더 환경 및 노출          | Not implemented; explicit message (Phase 23)                                                                                            |
| RENDERPRESETS       | RFILEOPT, RP                                        | 렌더 사전 설정             | Not implemented; explicit message (Phase 23)                                                                                            |
| RENDERWIN           | RENDSCR, RW                                         | 렌더 윈도우                | Not implemented; explicit message (Phase 23)                                                                                            |
| RESUME              |                                                     | 재개                       | Not implemented; explicit message (Phase 19)                                                                                            |
| REVCLOUD            |                                                     | 구름형 리비전              | Not implemented; explicit message (Phase 06)                                                                                            |
| REVOLVE             | REV                                                 | 회전                       | Not implemented; explicit message (Phase 22)                                                                                            |
| ROTATE              | RO                                                  | 회전                       | Not implemented; explicit message (Phase 07)                                                                                            |
| RPREF               | RPR                                                 | 고급 렌더 설정             | Not implemented; explicit message (Phase 23)                                                                                            |
| SAVE                | SAVEURL                                             | 저장                       | Not implemented; explicit message (Phase 09)                                                                                            |
| SAVEAS              | DXFOUT                                              | 다른 이름으로 저장         | Not implemented; explicit message (Phase 09)                                                                                            |
| SCALE               | SC                                                  | 축척                       | Not implemented; explicit message (Phase 07)                                                                                            |
| SCALELISTEDIT       |                                                     | 축척 리스트 편집           | Not implemented; explicit message (Phase 14)                                                                                            |
| SCRIPT              | SCR                                                 | 스크립트 실행              | Not implemented; explicit message (Phase 19)                                                                                            |
| SECTION             | SEC                                                 | 단면                       | Not implemented; explicit message (Phase 22)                                                                                            |
| SECTIONPLANE        | SPLANE                                              | 단면 평면                  | Not implemented; explicit message (Phase 23)                                                                                            |
| SECTIONPLANEJOG     | JOGSECTION                                          | 단면 꺾기 추가             | Not implemented; explicit message (Phase 23)                                                                                            |
| SECTIONPLANETOBLOCK | GENERATESECTION                                     | 단면 생성                  | Not implemented; explicit message (Phase 23)                                                                                            |
| SELECT              |                                                     | 선택                       | Visible unlocked picks, window/crossing drag, Shift removal, Ctrl+A                                                                     |
| SELECTSIMILAR       |                                                     | 유사 객체 선택             | Not implemented; explicit message (Phase 05)                                                                                            |
| SEQUENCEPLAY        | SPLAY                                               | 시퀀스 재생                | Not implemented; explicit message (Phase 23)                                                                                            |
| SETVAR              | SET                                                 | 시스템 변수 설정           | Partial / Typed/scoped validation; drawing values undoable; some ranges pending                                                         |
| SHADEMODE           | SHA, SHADE                                          | 음영 처리                  | Not implemented; explicit message (Phase 21)                                                                                            |
| SHEETSET            | SSM                                                 | 시트 세트 관리자           | Not implemented; explicit message (Phase 20)                                                                                            |
| SHOWPALETTES        | PON                                                 | 팔레트 표시                | Not implemented; explicit message (Phase 20)                                                                                            |
| SLICE               | SL                                                  | 슬라이스                   | Not implemented; explicit message (Phase 22)                                                                                            |
| SNAP                | SN                                                  | 스냅                       | Implemented / spacing, On/Off, Aspect, Legacy, Style and Type; drafting-commands tests                                                  |
| SOLID               | SO                                                  | 2D 솔리드                  | Not implemented; explicit message (Phase 06)                                                                                            |
| SPELL               | SP                                                  | 철자 검사                  | Not implemented; explicit message (Phase 10)                                                                                            |
| SPLINE              | SPL                                                 | 스플라인                   | Not implemented; explicit message (Phase 06)                                                                                            |
| SPLINEDIT           | SPE                                                 | 스플라인 편집              | Not implemented; explicit message (Phase 07)                                                                                            |
| STANDARDS           | STA                                                 | 표준 구성                  | Not implemented; explicit message (Phase 20)                                                                                            |
| STATUS              |                                                     | 상태                       | Not implemented; explicit message (Phase 15)                                                                                            |
| STRETCH             | S                                                   | 신축                       | Not implemented; explicit message (Phase 07)                                                                                            |
| STYLE               | DDSTYLE, ST                                         | 문자 스타일                | Not implemented; explicit message (Phase 10)                                                                                            |
| SUBTRACT            | SU                                                  | 차집합                     | Not implemented; explicit message (Phase 22)                                                                                            |
| SURFBLEND           | BLENDSRF                                            | 표면 혼합                  | Not implemented; explicit message (Phase 22)                                                                                            |
| SURFEXTEND          | EXTENDSRF                                           | 표면 연장                  | Not implemented; explicit message (Phase 22)                                                                                            |
| SURFFILLET          | FILLETSRF                                           | 표면 모깎기                | Not implemented; explicit message (Phase 22)                                                                                            |
| SURFNETWORK         | NETWORKSRF                                          | 네트워크 표면              | Not implemented; explicit message (Phase 22)                                                                                            |
| SURFOFFSET          | OFFSETSRF                                           | 표면 간격띄우기            | Not implemented; explicit message (Phase 22)                                                                                            |
| SURFPATCH           | PATCH                                               | 표면 패치                  | Not implemented; explicit message (Phase 22)                                                                                            |
| SURFSCULPT          | CREATESOLID                                         | 조각                       | Not implemented; explicit message (Phase 22)                                                                                            |
| TABLE               | TB                                                  | 테이블                     | Not implemented; explicit message (Phase 16)                                                                                            |
| TABLESTYLE          | TS                                                  | 테이블 스타일              | Not implemented; explicit message (Phase 16)                                                                                            |
| TABLET              | TA                                                  | 타블렛                     | Not implemented; explicit message (Phase 20)                                                                                            |
| TEXT                | DT, DTEXT                                           | 단일 행 문자               | Left-baseline point/height/rotation, inline Korean text and repeated independent lines                                                  |
| TEXTEDIT            | ED, TEDIT                                           | 문자 편집                  | Not implemented; explicit message (Phase 10)                                                                                            |
| TEXTSCR             |                                                     | 문자 윈도우                | Opens the text window with the drawing's command history (also Ctrl+F2)                                                                 |
| THICKNESS           | TH                                                  | 두께                       | Partial / System variable alias                                                                                                         |
| TILEMODE            | TI, TM                                              | 타일 모드                  | Partial / System variable alias                                                                                                         |
| TIME                |                                                     | 시간                       | Not implemented; explicit message (Phase 15)                                                                                            |
| TOLERANCE           | TOL                                                 | 공차                       | Not implemented; explicit message (Phase 11)                                                                                            |
| TOOLBAR             | TO                                                  | 도구막대                   | Not implemented; explicit message (Phase 20)                                                                                            |
| TOOLPALETTES        | TP                                                  | 도구 팔레트                | Not implemented; explicit message (Phase 20)                                                                                            |
| TORUS               | TOR                                                 | 토러스                     | Not implemented; explicit message (Phase 22)                                                                                            |
| TRIM                | TR                                                  | 자르기                     | LINE targets, Quick/Standard boundaries, Shift, fence, Edge and command-local Undo                                                      |
| U                   |                                                     | 명령 취소                  | Partial / Undo one group; LINE/PLINE local segment undo                                                                                 |
| UCS                 | DDUCS                                               | UCS                        | Not implemented; explicit message (Phase 21)                                                                                            |
| UCSICON             |                                                     | UCS 아이콘                 | ON/OFF/Noorigin/ORigin; Properties/Selectable/All pending                                                                               |
| UCSMAN              | DDUCSP, UC                                          | 명명된 UCS                 | Not implemented; explicit message (Phase 21)                                                                                            |
| UNDEFINE            |                                                     | 정의 해제                  | Partial / Disable a command; argument form                                                                                              |
| UNDO                |                                                     | 명령 취소                  | Partial / All options; Auto groups runner macros; zoom/pan steps combine; Layer UI P08                                                  |
| UNGROUP             |                                                     | 그룹 해제                  | Not implemented; explicit message (Phase 05)                                                                                            |
| UNION               | UNI                                                 | 합집합                     | Not implemented; explicit message (Phase 22)                                                                                            |
| UNISOLATEOBJECTS    | UNHIDE, UNISOLATE                                   | 객체 격리 끝               | Not implemented; explicit message (Phase 15)                                                                                            |
| UNITS               | DDUNITS, -UN, UN                                    | 단위                       | Not implemented; explicit message (Phase 15)                                                                                            |
| VIEW                | DDVIEW, -V, V                                       | 뷰 관리자                  | Not implemented; explicit message (Phase 21)                                                                                            |
| VIEWGO              | VGO                                                 | 뷰로 이동                  | Not implemented; explicit message (Phase 21)                                                                                            |
| VIEWPLAY            | VPLAY                                               | 뷰 재생                    | Not implemented; explicit message (Phase 23)                                                                                            |
| VISUALSTYLES        | -VSM, VSM                                           | 비주얼 스타일 관리자       | Not implemented; explicit message (Phase 21)                                                                                            |
| VPOINT              | -VP                                                 | 관측점                     | Not implemented; explicit message (Phase 21)                                                                                            |
| VPORTS              | VIEWPORTS                                           | 뷰포트                     | Not implemented; explicit message (Phase 14)                                                                                            |
| VSCURRENT           | VS                                                  | 비주얼 스타일              | Not implemented; explicit message (Phase 21)                                                                                            |
| WBLOCK              | ACADWBLOCKDIALOG, -W, W                             | 블록 쓰기                  | Not implemented; explicit message (Phase 13)                                                                                            |
| WEDGE               | WE                                                  | 쐐기                       | Not implemented; explicit message (Phase 22)                                                                                            |
| WIPEOUT             |                                                     | 가리기                     | Not implemented; explicit message (Phase 06)                                                                                            |
| WORKSPACE           |                                                     | 작업공간                   | Not implemented; explicit message (Phase 20)                                                                                            |
| XATTACH             | XA                                                  | 외부 참조 부착             | Not implemented; explicit message (Phase 13)                                                                                            |
| XBIND               | -XB, XB                                             | 외부 참조 결합             | Not implemented; explicit message (Phase 13)                                                                                            |
| XCLIP               | XC                                                  | 외부 참조 자르기           | Not implemented; explicit message (Phase 13)                                                                                            |
| XLINE               | XL                                                  | 구성선                     | Not implemented; explicit message (Phase 06)                                                                                            |
| XREF                | -XR, XR                                             | 외부 참조                  | Not implemented; explicit message (Phase 13)                                                                                            |
| ZOOM                | Z                                                   | 줌                         | All/Center/Dynamic/Extents/Previous/Scale/X/Window/Object/Realtime; XP host math, layout UI pending                                     |

## Phase 01 foundations

GETVAR, SETVAR and a registered variable name use the same declarative registry.
It contains 860 definitions with source links, scope, defaults, Korean descriptions
and available ranges/flags. 62 environment/document-dependent initial values
remain explicitly unavailable; some numeric ranges await reference verification.
Read-only values are rejected, drawing values enter the database journal and
profile values are shared across documents. docs/SYSVARS.md is generated from
this registry. Registering a variable does not implement its dependent command.

UNDO accepts a count or Auto, Control, BEgin, End, Mark and Back. Control includes
All, None, One, Combine and Layer. BEgin/End combine accepted transactions;
Mark/Back restore a checkpoint, with confirmation before Back without a mark.
MREDO accepts a count, All or Last. UNDOCTL reflects these journal settings.
Auto menu macros and navigation/layer UI category grouping remain pending.
REDO restores the last U/UNDO batch only immediately afterward; informational
commands and rejected input close that window. MREDO retains the remaining stack.
OOPS supports the latest erased set; BLOCK/WBLOCK/PURGE cases await those commands.

NEW opens another document tab. Switching tabs retains each native database,
undo journal and drawing variables while profile variables remain shared. OPEN
validates a full .hcd before activating a new document; DWG/DXF continue through
the supported-geometry adapter into a fresh native default graph. HANSAVE is
HanCAD's application-specific full .hcd save (zipped JSON plus binary blobs).
QSAVE DXF output still preserves only supported adapter geometry.
DocumentManager has a close API; tab-close UI and the CLOSE command remain pending.
The native graph includes opaque data, but persistent entity editing and canvas
display still use the transitional view adapter rather than all schema types.

Feature checks live in database history/schema/default tests, sysvar and headless
tests, document foundation tests and `database-foundations.spec.ts`. They include
1,000 deterministic generated create/modify/erase operations with full undo/redo,
identical native HCD graph/blob reload, tab history/OOPS and damaged-file recovery.
The four acceptance checks do not close the remaining full-build parity items.

Manual command sequences use a clean profile for default values. Press Enter
after each item and Esc after rejected input to return to the idle command prompt:

- `OSMODE`, `Enter` displays 4133 in a fresh document; `OSMODE`, `99999` is rejected.
- `SETVAR`, `LUPREC`, `2` changes inquiry precision; `U` restores the prior value.
- `UNDO`, `BE`, create two completed LINE commands, `UNDO`, `E`, `U`, `REDO`
  tests grouped removal/restoration.
- `UNDO`, `M`, create a completed LINE, `UNDO`, `B` restores the mark.
- `NEW`, draw a LINE, switch back to the first tab and use `U` to inspect isolated
  histories; use `ERASE`, then another edit and `OOPS` to restore only the erased set.
- `HANSAVE`, then `OPEN` the downloaded .hcd to reopen the native graph in a new tab.

## Browser workflow commands

These commands are registered by the application against the same command registry.
They are working slices, not complete AutoCAD parity claims.

OPEN progress and known importer errors/warnings follow the current locale,
including warnings restored from drawing recovery. Arbitrary external diagnostics
remain unchanged. Export command failures use the same app presenter as direct
UI errors, including language changes before an asynchronous image callback.
`diagnostic-i18n.spec.ts` covers those paths and protects drawing/history state.
Headless SETVAR point/string and UNDO/REDO count failures use typed bilingual
diagnostics; command/input validation tests verify failure leaves history intact.

| Command                         | Implemented options                                                            | Verification                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| EXPORTPDF                       | Visible supported geometry on A4 raster PDF                                    | Actual downloads, strict PDF parsing and independent render                             |
| EXPORTPNG / EXPORTJPG           | White background, maximum 2400 px                                              | Decoding and visual QA                                                                  |
| EXPORTSVG                       | Vector supported entities, readable fixed screen strokes                       | Actual Edge rendering and SVG geometry invariants                                       |
| HANPROGRESS                     | Current features, limitations and all 26 phase statuses                        | Browser progress dialog checks                                                          |
| LINE / CIRCLE / RECTANG / PLINE | Initial mouse and coordinate sessions                                          | Draft session feature tests; production browser drafting/undo/save/reload checks passed |
| ERASE / SELECT                  | Pick/preselection; locked/hidden objects protected                             | Feature tests; production browser drafting/undo/save/reload checks passed               |
| U / UNDO / REDO / MREDO / OOPS  | Shared per-document journal, options/groups/marks and latest erase restoration | Database/headless tests and Phase 01 browser integration                                |
| NEW / OPEN / HANSAVE            | Independent documents; full native HCD save/open plus supported DWG/DXF import | HCD graph/blob round-trip and document browser checks                                   |

Input uses WCS Y up (`x,y`, `@dx,dy`, `@distance<angle`); the transitional view
model converts Y exactly once. LINE/PLINE use Enter to finish, C to close and U to
remove the last accepted segment. Esc keeps accepted LINE/PLINE segments and
cancels the active preview. CIRCLE supports center/radius only; RECTANG supports
two corners only. PLINE arc/width options, lasso/grips, undo menu/category
integration, DWG saving and full plotting remain pending.

F8 Ortho and F3 running object snaps are connected. Supported snap modes are
endpoint, midpoint, center, quadrant, nearest and true intersection per OSMODE. Exact
snaps bypass grid/Ortho constraints. APERTURE and AUTOSNAP control search and feedback. Unsupported
modes are not substituted with another mode. Grid, polar/object tracking, dynamic
input and full lineweight display controls are visibly unavailable until implemented.

## Practical editing and inquiry subset

Left-to-right rectangular dragging selects completely enclosed objects; right-to-left
crossing selects objects whose geometry crosses the region. Shift removes selections;
hidden/locked layers cannot be edited. Drag a preselected object to move the selection,
or hold Ctrl to copy it. Release commits once; Escape cancels the gesture while retaining
selection, and a second Escape clears it. PICKADD/PICKFIRST are read; lasso, click-click,
grips and complete PICKAUTO/PICKDRAG behavior remain pending.

M/MOVE and CO/CP/COPY accept a selected set or ask for objects and Enter, then base and
second points. Coordinates, relative/polar input, direct distance, Ortho and exact
snaps share the drafting path. COPY permits repeated placement from the same base;
Enter/E/Exit/Escape finishes with one undo group, retaining accepted copies. Full
COPYMODE/Displacement/Array/Undo options remain pending. Existing dimension definitions
translate with selected objects but do not become associative with other source geometry.

DI/DIST takes two points and prints decimal distance, WCS X/Y deltas and XY angle,
reading LUPREC/AUPREC/ANGBASE/ANGDIR. Its temporary line/label creates no drawing objects
or undo group. Other unit formats, Multiple and transparent nesting remain pending.
Feature tests cover immutable translation/identities/selection and read-only measurement;
production Edge tests cover pointer gestures, exact snaps, cancel, undo and reload.

## Essential trim, offset and single-line text subset

TRIM/EXTEND edit LINE targets against visible lines, straight polylines, rectangles,
circles and arcs. Quick starts with all supported boundaries; Standard first selects
boundaries and Enter (empty Enter selects all). Click target portions or drag a
finite fence. Shift invokes the opposite operation, U reverses the latest local
operation, MO chooses Quick/Standard and E chooses implied edge extension. Enter
or Esc completes one command transaction, retaining accepted edits. COMMANDPREVIEW
controls replacement previews, including hiding the original when deletion is
previewed. Locked targets are protected; visible locked geometry can be boundaries.
Project/Crossing/Erase, hatch boundaries and non-LINE targets remain pending.

OFFSET accepts a positive distance, two-point distance or T/Through. Choose an
object then side/through point. Erase selects source deletion, Layer chooses
Source/Current, M repeatedly offsets from the last result, U reverses the last
offset and Exit/Enter/Esc ends the command. In Multiple, Enter returns to object
selection. Lines/circles/arcs and safe straight open/convex closed polylines with
OFFSETGAPTYPE 0 are supported. Other join modes, concave/curved polylines and
topology-changing results are rejected explicitly; full cavalier_contours support
is pending. OFFSETDIST is remembered only in the running application.

TEXT/DT/DTEXT accepts start point, TEXTSIZE height, rotation and inline Korean text.
Enter accepts each independent line; an empty line ends the command. Esc discards
current unaccepted text while preserving prior accepted lines in one undo group.
Accepted height is remembered even when no line is created. Left-baseline text is
the initial subset, capped by the transitional model at height 1000 and 2000 UTF-16
code units per line. Justification/styles, SHX/BigFont, control codes, editing existing
text and full MTEXT remain pending. T/MT still invokes MTEXT, not TEXT.

Feature/session tests and production pointer/keyboard tests cover immutable source
geometry, repeated operations, local/whole-command Undo, Korean composition-event
guards, reload defaults and actual editable Unicode DXF save/reopen. Native Windows
IME/Hanja and installed-AutoCAD visual/font parity still require reference QA.

## Usable dimension subset

The ribbon and command line use the same registered handlers. DIM is additionally
connected as a smart initial dimension tool: line/polyline edge produces a linear
dimension, circle produces diameter, and arc produces radius. Hover previews use
the same definitions as placement. This is a partial Phase 11 implementation.

| Command                            | Supported sequence                                                                                                              | Remaining options                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| DIMLINEAR / DLI                    | Two extension origins, placement; Enter at first prompt selects an object; H, V, R + rotation; T + free text; A + text rotation | Mtext editor, full placement/fit rules                                  |
| DIMALIGNED / DAL                   | Two origins or Enter then object; placement; T/A                                                                                | Full placement/fit rules                                                |
| DIMRADIUS / DRA, DIMDIAMETER / DDI | Select circle/arc, place dimension; T/A                                                                                         | Fit/multi-segment leader behavior, arrowhead families                   |
| DIMANGULAR / DAN                   | Select two lines, an arc or a circle; Enter for vertex/first-ray/second-ray; placement; T/A                                     | Explicit Quadrant option and full text fit                              |
| DIM                                | Hover/select line, circle or arc, then place; A selects three-point angular input                                               | Layer, baseline, continue, align, distribute and complete smart choices |
| DIMSTYLE / D / DST                 | Edit ten supported variables; optionally apply to selected editable dimensions                                                  | Complete manager, seven tabs, named-style management and compare        |

Example exact coordinate input: `DLI` → `0,0` → `100,0` → `50,20` makes a
100-unit linear dimension. `DAL` → `0,0` → `30,40` → `30,60` measures 50.
`DAN` → Enter → `0,0` → `20,0` → `0,20` → `20,20` measures 90 degrees.
At placement, `T` enters editable Korean text; `검사 <> mm` substitutes the current
formatted measurement for `<>`. Empty text restores the generated value.

The basic settings cover DIMTXT, DIMASZ, DIMDEC, DIMSCALE, DIMEXO, DIMEXE, DIMGAP,
DIMLFAC, DIMZIN and DIMPOST. DIMSCALE affects annotation sizes, not definition
points or measurements. DIMLFAC affects displayed linear/radial measurements,
not angular measurement. Current DIMZIN support is decimal leading/trailing zero
suppression. Changing defaults affects new dimensions; existing dimension styles
only change through explicit selected application. One placement or style application
is one undo group. Cancel preserves the existing drawing and creates no dimension.
Local reload and supported DXF output retain these definitions and style values.
Angular dimensions currently share DIMDEC precision; separate DIMADEC/DIMAZIN
controls are pending. Fixed-height text styles, negative DIMGAP boxes and full
annotation fit behavior are also pending.

DIMASSOC is registered but geometry associativity is not implemented. Dimensions
do not yet update from geometry edits. Leaders, tolerances, arc-length/ordinate/
jogged/baseline/continued dimensions and advanced Phase 11 commands remain pending.

## Phase 03 input-surface verification

`mouse-menus.spec.ts` checks configured Enter, command options, edit macros,
time-sensitive clicks and MBUTTONPAN. `snap-menu.spec.ts` checks one-shot modes,
failed acquisition, typed/cancelled input and transparent ZOOM. `status-help.spec.ts`
checks every status toggle, settings menus, profile visibility, coordinates and
context help. `keyboard-routing.spec.ts` and `ribbon-keytips.spec.ts` check focus
priority, key release and Alt tips. Later-phase menu targets (clipboard, advanced
selection/properties and calculator) remain explicit pending
commands in the catalog, and are not claimed as implemented features.

## Phase 02 display/navigation verification

UCSICON implements ON/OFF/Noorigin/ORigin through the registered UCSICON variable
and interactive options. Extended/3D options retain their later-phase owner.
DEVSTRESS is registered only in dev mode or with `?devtools=1`; count 0-1000000,
default 100000, generates nonpersistent renderer data (0 restores the drawing).

Navigation options run through `NavigationSession` with both queued text and
mouse input. Keyword buttons feed the same command input. Tests include
`navigation-session.test.ts`, `view-navigation.test.ts`, `realtime-navigation.test.ts`
and `view-navigation.spec.ts`, including Dynamic cancellation, Object selection,
Previous, animated undo interruption and wheel/middle-button regressions.
`pnpm test:render` checks 28 actual GPU scenes, translated precision, linetypes,
widths, colors and painter order; `pnpm test:render:stress` measures the 60 Hz
million-entity budget on the reference PC. Full editable POINT/XLINE/SPLINE
creation commands remain with Phase 06; their renderer display is implemented.

## Phase 04 dynamic input and drafting settings

DSETTINGS/DS/SE opens seven Korean tabs: Snap and Grid, Polar Tracking, Object
Snap, 3D Object Snap, Dynamic Input, Quick Properties and Selection Cycling.
Each control validates and writes its existing system variable. Cancel discards
form changes; OK groups drawing-scoped changes into one undo step. The last tab
is remembered by the document host. Status Settings entries choose the matching
tab and execute transparent DSETTINGS, preserving an active LINE prompt.
OSNAP/OS/-OS opens the Object Snap tab; -OSNAP/-OS accepts the command-line form.
The fourteen modes can be combined with commas (END,MID,CEN,GCE,NOD,QUA,INT,EXT,
INS,PER,TAN,NEA,APP,PAR). OFF preserves the saved mask with bit 16384; NONE clears
it. Invalid tokens keep the prompt active without partially changing the mask.

F12 changes the sign of DYNMODE, preserving the selected pointer/dimension mode.
Cursor fields use the physical-key command buffer: Tab moves between and locks
fields; comma selects the next Cartesian component; @/# chooses relative/absolute;
< chooses the angle inside an edit; Down opens the active prompt's keyword menu.
Locked fields constrain both keyboard submission and the next mouse pick. Tooltip
size/transparency honors DYNTOOLTIPS and stays within the drawing viewport.
DYNDIGRIP controls are retained for later grip-stretch editing, where that variable
applies; LINE always exposes its supported length and angle pair.

Focused coverage: dynamic-input-state.test.ts, drafting-settings-state.test.ts,
status-bar.test.ts, osnap-command.test.ts and phase04-dynamic.spec.ts. Current
browser acceptance covers physical IME-code input, Tab locks with mouse acceptance,
explicit absolute pointer input, comma fields, Down keywords, tab memory, SNAPANG
unit parsing, status-to-tab routing and tooltip appearance/bounds. Native Windows
IME behavior and installed-AutoCAD visual comparison remain user reference checks.
