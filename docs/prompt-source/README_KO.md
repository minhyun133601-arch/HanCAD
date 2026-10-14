# HanCAD 프롬프트 묶음

압축을 풀면 생기는 `HanCAD_prompts` 폴더를 그대로 프로젝트 폴더로 쓰면 된다(폴더 이름은 바꿔도 된다).

| 파일 | 내용 |
|---|---|
| AGENTS.md | 마스터 프롬프트(프로젝트 규칙). AI 코딩 도구가 매 세션 읽는다 |
| docs/GLOSSARY.md | Reference A — 한국어 AutoCAD UI 용어집 |
| docs/SHORTCUTS.md | Reference B — 단축키·별칭·마우스 기준표 |
| prompts/phase-00 ~ phase-25 | 단계별 프롬프트. 파일 하나 = 붙여넣기 한 번 |
| prompts/util-1 ~ util-5 | 이어하기, 버그 수정, 사용감 감사, 회귀 점검, 내 AutoCAD 설정 가져오기 |
| HanCAD_prompts_full.md | 위 내용을 설명과 함께 한 파일로 모은 원본 |

## 쓰는 순서

1. `HanCAD_prompts` 폴더에서 AI 코딩 도구(Claude Code, Cursor, Codex 등)를 연다. AGENTS.md와 docs 폴더가 맨 위에 있어야 한다.
2. `prompts/phase-00-...md` 내용을 붙여넣고, 맨 끝에 아래 한 줄을 덧붙인다.
   `AGENTS.md, docs/GLOSSARY.md, and docs/SHORTCUTS.md are already in this folder. Use them as they are instead of creating them.`
3. Phase가 끝날 때마다 앱을 실행해 그 Phase의 Acceptance 항목을 직접 확인하고, 다음 phase 파일을 붙여넣는다. 순서는 건너뛰지 않는다.
4. 세션이 끊기면 `util-1-continue.md`, 버그가 나오면 `util-2-bug-fix.md`를 쓴다.
