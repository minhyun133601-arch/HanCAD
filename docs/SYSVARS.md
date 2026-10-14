# System variables

Generated from `packages/sysvars/src/registry.ts`. Only implemented definitions are listed; full header/500+ parity is pending.

The basic-workflow follow-up reads APERTURE for snap search, AUTOSNAP bits 1/2
for markers/tooltips, OSMODE including intersection bit 32, ORTHOMODE for unsnapped
mouse constraints, PICKADD/PICKFIRST for selection/edit entry and live
ZOOMFACTOR/ZOOMWHEEL/MBUTTONPAN for navigation. DIST reads LUPREC/AUPREC/ANGBASE/ANGDIR.
Registration alone does not implement the other selection/snap/unit-format controls;
full PICKAUTO/PICKDRAG/lasso and COPYMODE remain pending.

TRIMEXTENDMODE (profile, default 1) selects Quick/Standard editing. EDGEMODE
(profile, default 0) enables implied boundary extension. Browser profile values
persist separately after validation. OFFSETDIST is corrected to session-only
(default -1/Through), survives NEW in the same app and resets on reload. TEXTSIZE
is drawing-scoped; accepted TEXT heights and standalone changes survive recovery,
with command edits and their height stored atomically for Undo/Redo.

| Name                 | Type    | Default      | Scope   | Read-only | Korean description              |
| -------------------- | ------- | ------------ | ------- | --------- | ------------------------------- |
| OSMODE               | integer | 4133         | profile | No        | 실행 중인 객체 스냅 설정        |
| LUNITS               | integer | 2            | drawing | No        | 선형 단위 형식                  |
| LUPREC               | integer | 4            | drawing | No        | 선형 단위 표시 정밀도           |
| AUNITS               | integer | 0            | drawing | No        | 각도 단위 형식                  |
| AUPREC               | integer | 0            | drawing | No        | 각도 단위 표시 정밀도           |
| ANGBASE              | real    | 0            | drawing | No        | 기준 각도                       |
| ANGDIR               | integer | 0            | drawing | No        | 각도 측정 방향                  |
| MEASUREMENT          | integer | 1            | drawing | No        | 영국식 또는 미터법 리소스       |
| INSUNITS             | integer | 4            | drawing | No        | 삽입 단위                       |
| LIMMIN               | point2  | [0,0]        | drawing | No        | 도면 한계의 왼쪽 아래 점        |
| LIMMAX               | point2  | [420,297]    | drawing | No        | 도면 한계의 오른쪽 위 점        |
| GRIDUNIT             | point2  | [10,10]      | drawing | No        | 그리드 간격                     |
| SNAPUNIT             | point2  | [10,10]      | drawing | No        | 스냅 간격                       |
| GRIDMODE             | integer | 1            | drawing | No        | 그리드 표시                     |
| SNAPMODE             | integer | 0            | drawing | No        | 스냅 모드                       |
| SNAPTYPE             | integer | 0            | drawing | No        | 그리드 또는 극좌표 스냅         |
| SNAPSTYL             | integer | 0            | drawing | No        | 표준 또는 등각 스냅             |
| SNAPISOPAIR          | integer | 0            | drawing | No        | 현재 등각 평면                  |
| ORTHOMODE            | integer | 0            | drawing | No        | 직교 모드                       |
| AUTOSNAP             | integer | 63           | profile | No        | 객체 스냅 표시 및 추적          |
| POLARMODE            | integer | 0            | profile | No        | 극좌표 추적 모드                |
| POLARANG             | real    | 90           | profile | No        | 극좌표 추적 각도                |
| DYNMODE              | integer | 3            | profile | No        | 동적 입력 모드                  |
| DYNPICOORDS          | integer | 0            | profile | No        | 동적 포인터 상대 또는 절대 좌표 |
| DYNINFOTIPS          | integer | 1            | profile | No        | 동적 입력 툴팁                  |
| UCSDETECT            | integer | 1            | profile | No        | 동적 UCS                        |
| 3DOSMODE             | integer | 0            | profile | No        | 3D 객체 스냅 모드               |
| LWDISPLAY            | integer | 0            | drawing | No        | 선가중치 표시                   |
| COORDS               | integer | 1            | profile | No        | 좌표 표시 방식                  |
| SELECTIONCYCLING     | integer | 2            | profile | No        | 선택 순환                       |
| PICKSTYLE            | integer | 1            | profile | No        | 그룹 및 연관 해치 선택          |
| PICKFIRST            | integer | 1            | profile | No        | 명령 전 객체 선택               |
| PICKAUTO             | integer | 5            | profile | No        | 자동 윈도우 및 올가미 선택      |
| PICKADD              | integer | 2            | profile | No        | 선택 세트 추가 방식             |
| PICKBOX              | integer | 3            | profile | No        | 선택 상자 크기                  |
| APERTURE             | integer | 10           | profile | No        | 객체 스냅 조준 상자 크기        |
| GRIPS                | integer | 1            | profile | No        | 그립 표시                       |
| GRIPSIZE             | integer | 5            | profile | No        | 그립 크기                       |
| GRIPCOLOR            | integer | 150          | profile | No        | 일반 그립 색상                  |
| GRIPHOT              | integer | 12           | profile | No        | 활성 그립 색상                  |
| GRIPHOVER            | integer | 1            | profile | No        | 호버 그립 색상                  |
| SELECTIONPREVIEW     | integer | 3            | profile | No        | 선택 미리보기                   |
| COMMANDPREVIEW       | integer | 1            | profile | No        | 명령 미리보기                   |
| TEMPOVERRIDES        | integer | 1            | profile | No        | 임시 재지정 키                  |
| SHORTCUTMENU         | integer | 11           | profile | No        | 바로 가기 메뉴 모드             |
| SHORTCUTMENUDURATION | integer | 250          | profile | No        | 시간 구분 오른쪽 클릭 지연      |
| MBUTTONPAN           | integer | 1            | profile | No        | 중간 버튼 초점이동              |
| ZOOMFACTOR           | integer | 60           | profile | No        | 휠 줌 증가량                    |
| ZOOMWHEEL            | integer | 0            | profile | No        | 휠 줌 방향                      |
| DBLCLKEDIT           | integer | 1            | profile | No        | 두 번 클릭 편집                 |
| INPUTSEARCHOPTIONS   | integer | 15           | profile | No        | 명령 자동 완성 검색 옵션        |
| INPUTSEARCHDELAY     | integer | 300          | profile | No        | 명령 검색 지연                  |
| FILEDIA              | integer | 1            | profile | No        | 파일 대화상자                   |
| CMDDIA               | integer | 1            | profile | No        | 명령 대화상자                   |
| EXPERT               | integer | 0            | profile | No        | 명령 메시지 생략 수준           |
| SAVETIME             | integer | 10           | profile | No        | 자동 저장 간격(분)              |
| ISAVEPERCENT         | integer | 50           | profile | No        | 증분 저장 비율                  |
| ISAVEBACK            | integer | 1            | profile | No        | 저장 백업 파일                  |
| SAVEFILEPATH         | string  | ""           | profile | No        | 자동 저장 경로                  |
| FONTALT              | string  | "sans-serif" | profile | No        | 대체 글꼴                       |
| FONTMAP              | string  | ""           | profile | No        | 글꼴 매핑 파일                  |
| MODEMACRO            | string  | ""           | session | No        | 상태 표시줄 DIESEL 문자열       |
| CLAYER               | string  | "0"          | drawing | No        | 현재 도면층                     |
| CELTYPE              | string  | "BYLAYER"    | drawing | No        | 현재 선종류                     |
| CECOLOR              | string  | "BYLAYER"    | drawing | No        | 현재 객체 색상                  |
| CELTSCALE            | real    | 1            | drawing | No        | 현재 객체 선종류 축척           |
| LTSCALE              | real    | 1            | drawing | No        | 전역 선종류 축척                |
| PSLTSCALE            | integer | 1            | drawing | No        | 배치 뷰포트 선종류 축척         |
| MSLTSCALE            | integer | 1            | drawing | No        | 모형 공간 선종류 축척           |
| CELWEIGHT            | integer | -1           | drawing | No        | 현재 선가중치                   |
| THICKNESS            | real    | 0            | drawing | No        | 현재 객체 두께                  |
| ELEVATION            | real    | 0            | drawing | No        | 현재 고도                       |
| FILLETRAD            | real    | 0            | drawing | No        | 모깎기 반지름                   |
| CHAMFERA             | real    | 0            | drawing | No        | 첫 번째 모따기 거리             |
| CHAMFERB             | real    | 0            | drawing | No        | 두 번째 모따기 거리             |
| CHAMFERC             | real    | 0            | drawing | No        | 모따기 길이                     |
| CHAMFERD             | real    | 0            | drawing | No        | 모따기 각도                     |
| OFFSETDIST           | real    | -1           | session | No        | 간격띄우기 거리                 |
| TRIMEXTENDMODE       | integer | 1            | profile | No        | 자르기 및 연장 빠른 모드        |
| EDGEMODE             | integer | 0            | profile | No        | 가상 경계 연장 사용             |
| OFFSETGAPTYPE        | integer | 0            | profile | No        | 간격띄우기 모서리 처리          |
| CIRCLERAD            | real    | 0            | drawing | No        | 마지막 원 반지름                |
| PLINEWID             | real    | 0            | drawing | No        | 새 폴리선 폭                    |
| PLINETYPE            | integer | 2            | profile | No        | 폴리선 형식                     |
| TEXTSIZE             | real    | 2.5          | drawing | No        | 기본 문자 높이                  |
| TEXTSTYLE            | string  | "Standard"   | drawing | No        | 현재 문자 스타일                |
| DIMSTYLE             | string  | "ISO-25"     | drawing | No        | 현재 치수 스타일                |
| DIMSCALE             | real    | 1            | drawing | No        | 전체 치수 축척                  |
| DIMTXT               | real    | 2.5          | drawing | No        | 치수 문자 높이                  |
| DIMASZ               | real    | 2.5          | drawing | No        | 치수 화살표 크기                |
| DIMDLI               | real    | 3.75         | drawing | No        | 기준선 치수 간격                |
| DIMDEC               | integer | 2            | drawing | No        | 치수 소수 자릿수                |
| DIMASSOC             | integer | 2            | drawing | No        | 치수 연관성                     |
| DIMLFAC              | real    | 1            | drawing | No        | 선형 치수 측정 배율             |
| DIMGAP               | real    | 0.625        | drawing | No        | 치수 문자 주변 간격             |
| DIMEXO               | real    | 0.625        | drawing | No        | 치수보조선 원점 간격            |
| DIMEXE               | real    | 1.25         | drawing | No        | 치수보조선 연장                 |
| DIMZIN               | integer | 8            | drawing | No        | 치수 선행·후행 0 억제           |
| DIMPOST              | string  | ""           | drawing | No        | 치수 측정값 접두·접미 문자      |
| TILEMODE             | integer | 1            | drawing | No        | 모형 공간 활성                  |
| CTAB                 | string  | "Model"      | drawing | No        | 현재 배치                       |
| OSNAPCOORD           | integer | 2            | profile | No        | 좌표 입력과 객체 스냅 우선순위  |
| INSUNITSDEFSOURCE    | integer | 4            | profile | No        | 단위 없는 원본 삽입 단위        |
| INSUNITSDEFTARGET    | integer | 4            | profile | No        | 단위 없는 대상 삽입 단위        |
| UNDOCTL              | integer | 53           | session | Yes       | 실행 취소 제어                  |
| CMDACTIVE            | integer | 0            | session | Yes       | 활성 명령 상태                  |
| CMDNAMES             | string  | ""           | session | Yes       | 활성 명령 이름                  |

The basic dimension UI uses DIMTXT, DIMASZ, DIMDEC, DIMSCALE, DIMEXO, DIMEXE, DIMGAP, DIMLFAC, DIMZIN and DIMPOST. Registration of DIMASSOC does not implement associative geometry references. Current dimensions are independent definitions.
