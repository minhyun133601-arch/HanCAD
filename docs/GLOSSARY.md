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

## View navigation (Phase 02)
| English | 한국어 UI |
|---|---|
| Zoom / Pan | 줌 / 초점이동 |
| All / Center / Dynamic / Extents / Previous | 전체 / 중심 / 동적 / 범위 / 이전 |
| Scale / Window / Object / Realtime | 축척 / 윈도우 / 객체 / 실시간 |
| Specify center point: | 중심점 지정: |
| Specify height of view: | 뷰의 높이 지정: |
| Crosshair / Pickbox / UCS icon | 십자선 / 선택상자 / UCS 아이콘 |
| Regenerate / Redraw | 재생성 / 다시 그리기 |
| Model background color | 모형 배경색 |

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

## Command window and input search (Phase 03)
| English | 한국어 UI |
|---|---|
| Customize / Recent Commands / Input Settings | 사용자화 / 최근 명령 / 입력 설정 |
| AutoComplete / AutoCorrect | 자동 완성 / 자동 수정 |
| Search System Variables / Search Content / Mid-string Search / Delay Time | 시스템 변수 검색 / 컨텐츠 검색 / 중간 문자열 검색 / 지연 시간 |
| Input Search Options (dialog) | 검색 입력 옵션 |
| Enable AutoComplete / Enable Mid-string Search | 자동 완성 사용 / 중간 문자열 검색 사용 |
| According to frequency of usage / Alphabetically | 사용 빈도에 따름 / 알파벳순 |
| Enable AutoCorrect / Remember Corrections After n Mistypes | 자동 수정 사용 / n번 잘못 입력한 후에 수정 사항 저장 |
| Separate Commands and System Variables | 명령 및 시스템 변수 분리 |
| Suggestion List Delay Time / milliseconds | 제안 사항 리스트 지연 시간 / 밀리초 |
| Search Content at Command Line / Content Type | 명령행에서 컨텐츠 검색 / 컨텐츠 유형 |
| Block, Layer, Hatch, Visual Style, Text Style, Dim Style | 블록, 도면층, 해치, 비주얼 스타일, 문자 스타일, 치수 스타일 |
| Suggestion list | 제안 사항 리스트 |
| Copy History / Paste To CmdLine / Transparency / Lines of Prompt History | 기록 복사 / 명령행에 붙여넣기 / 투명도 / 프롬프트 기록 줄 |
| Text Window | 문자 윈도우 |
| Re-initialization / I/O Port Initialization / Device and File Initialization | 재초기화 / 입출력 포트 초기화 / 장치 및 파일 초기화 |
| Digitizer / PGP File | 디지타이저 / PGP 파일 |
| Edit Aliases: Command Aliases / External Commands / AutoCorrect List / Synonym List | 별칭 편집: 명령 별칭 / 외부 명령 / 자동 수정 리스트 / 동의어 리스트 |

The Phase 03 command catalog (`packages/commands/src/catalog/`, also shown in the
generated table of docs/COMMANDS.md) holds the Korean display name of every other
registered command; names not listed above are pending reference review in
docs/PARITY_CHECKLIST.md.
