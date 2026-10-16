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

## Current repository workflow (2026-10-16)

Status as of 2026-10-17: Phase 03 implementation and browser acceptance are
complete. Phase 04 is next only after a user request. Actual Windows IME,
installed-AutoCAD comparison and deferred Phase 00 native acceptance remain
unverified; see `../PROGRESS.md` for the exact results and boundaries.

The user requested the validation schedule below. Feature requirements and every
phase's Acceptance scope remain unchanged.

- Work from the actual project root. Read its `AGENTS.md`, `docs/PROGRESS.md` and
  `docs/ARCHITECTURE.md` first, then the relevant individual phase prompt under
  `docs/prompt-source/prompts/`. The active progress handoff determines where to
  resume; historical prompt examples do not establish completion.
- Implement the remaining milestones of the current phase in sequence. Do not
  rerun full test suites at phase start, session resume or every milestone. During
  implementation, run type checking and briefly check the changed feature's core
  behavior. Record deferred validation and repair failures that block further work.
- After the current phase's implementation is complete, run all required checks,
  review every Acceptance item and existing-feature regressions, update the docs
  and commit. A phase is accepted only when the required checks pass; report
  anything unverified explicitly.
- Start the next phase only when the user explicitly requests it. A continuation
  request completes the current phase, including final validation, then stops.

### Copy-and-paste requests

Continue the current phase:

```text
Read the project root AGENTS.md, docs/PROGRESS.md and docs/ARCHITECTURE.md, then the active phase prompt under docs/prompt-source/prompts/. Resume at the recorded next step and complete the current phase through accepted completion. Follow the batched validation schedule: type checking and brief changed-feature checks during implementation, then all required checks, Acceptance review, documentation and a commit at phase end. Do not rerun full suites merely because a session or milestone starts. Report the result and any unverified items in Korean, and stop before the next phase.
```

Start a specified phase (replace `NN` with its phase number):

```text
Read the project root AGENTS.md, docs/PROGRESS.md and docs/ARCHITECTURE.md. After confirming the preceding phase's acceptance from the recorded evidence, start Phase NN using its individual prompt under docs/prompt-source/prompts/. Complete only Phase NN through accepted completion, following the batched validation schedule and preserving every feature and Acceptance requirement. Update the docs, commit and report in Korean. Do not advance to another phase without my explicit request.
```

Pause with a plan only:

```text
Pause implementation. Update docs/PROGRESS.md and docs/prompt-source/NEXT_STEPS.md with the actual current status, deferred validation and the exact next step. Make planning-only documentation changes; do not develop features, run tests or mark unverified work complete. Report in Korean.
```
