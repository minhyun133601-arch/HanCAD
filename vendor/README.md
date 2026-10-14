# 오프라인 DWG / DXF 엔진

`cad-offline.js`는 브라우저에서 바로 실행하는 classic script입니다. DXF 해석 코드, DWG 변환 worker 소스와 LibreDWG WASM 바이트가 함께 들어 있어, 빌드된 HTML을 `file://`로 열어도 인터넷이나 서버 없이 작동합니다. 사용자가 선택한 도면은 해당 브라우저 안에서 처리합니다.

## 원본과 라이선스

| 구성 | 정확한 버전 / 원본 | 라이선스 / 포함 파일 |
| --- | --- | --- |
| DXF 파서 / ACI 색상 | [`@cadview/core` 0.5.0](https://www.npmjs.com/package/@cadview/core/v/0.5.0) | MIT, `cadview-core/package/LICENSE`, npm 원본 `cadview-core-0.5.0.tgz` |
| DWG → DXF 변환 | [`@cadview/dwg` 0.2.0](https://www.npmjs.com/package/@cadview/dwg/v/0.2.0) | GPL-3.0-only, `cadview-dwg/package/LICENSE`, npm 원본 `cadview-dwg-0.2.0.tgz` |
| LibreDWG | [커밋 `3ca092780e6303da0c0a36a99d8425f08e658ffc`](https://github.com/LibreDWG/libredwg/tree/3ca092780e6303da0c0a36a99d8425f08e658ffc) | GPL-3.0-or-later, 전체 원본 `source/libredwg-3ca0927.zip` |
| Cadview wrapper / 빌드 / TS 원본 | [커밋 `b81f32d35423fcc3255588c27e72ac577bf05fcf`](https://github.com/wiscaksono/cadview/tree/b81f32d35423fcc3255588c27e72ac577bf05fcf) | 해당 DWG npm 발행의 gitHead, 전체 원본 `source/cadview-b81f32d.zip` |

GPL v3 전체 라이선스는 `GPL-3.0.txt`에 포함했습니다. DWG 엔진을 사용하는 결합 프로그램을 배포할 때에는 GPL v3 조건과 대응 소스 제공 의무가 적용됩니다. 이 폴더에는 라이브러리 원본, wrapper, WASM 빌드 명령, 수정·재생성 스크립트가 함께 들어 있습니다.

다운로드한 npm 원본은 다음 주소의 패키지입니다.

- [DWG npm tarball](https://registry.npmjs.org/@cadview/dwg/-/dwg-0.2.0.tgz)
- [Core npm tarball](https://registry.npmjs.org/@cadview/core/-/core-0.5.0.tgz)

## 재생성

프로젝트 폴더에서 Node.js로 다음을 실행합니다.

```powershell
node vendor/prepare-offline.mjs
pnpm build:web
node --test test/importers.test.mjs
```

`prepare-offline.mjs`는 포함된 npm 원본 JS와 WASM으로 `cad-dxf.js`, `cad-dwg-worker.js`, `cad-offline.js`를 다시 만듭니다. 빌드 시 `cad-offline.js`를 `packages/legacy-bridge/runtime/cad-importers.js`보다 먼저 HTML에 넣습니다. 별도 fetch / import / CDN 다운로드는 필요하지 않습니다.

원본에 적용한 변경 사항:

- DXF 파서가 배치 공간 플래그와 지원하지 않는 객체를 유지하도록 수정했습니다. 생략할 객체를 가져오기 보고서에 표시하기 위해서입니다.
- SOLID / TRACE / 3DFACE 정점을 보존해 윤곽선으로 가져옵니다.
- 렌더러의 미사용 RBush import와 ESM export를 제거하고 DXF 파서와 색상 함수만 `CadDxf`로 공개합니다. 해당 렌더러는 실행하지 않습니다.
- DWG loader에 `wasmBinary`를 전달해 포함된 바이트를 사용합니다. DWG 작업은 매번 새 worker로 실행하며 완료 / 실패 / 시간 초과 / 취소 시 worker와 Blob URL을 폐기합니다.
- DWG 변환 결과의 음수 레이어 색상을 강제로 양수로 바꾸던 upstream 처리를 제거했습니다. 꺼진 레이어를 보존하기 위해서입니다.

## LibreDWG WASM 직접 빌드

`source/cadview-b81f32d.zip`을 풀고, 포함된 `source/libredwg-3ca0927.zip`의 LibreDWG 원본을 `packages/dwg/wasm/libredwg/`에 놓습니다. [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html), CMake와 make가 있는 셸에서 원본 `packages/dwg/wasm/build.sh`를 실행합니다. 동일한 빌드 스크립트와 C wrapper를 이 폴더의 `build-libredwg.sh`, `libredwg-wrapper.c`에도 보관했습니다.

```bash
cd packages/dwg
bash wasm/build.sh
```

스크립트는 LibreDWG 정적 라이브러리를 만들고 `wrapper.c`와 연결해 `dist/libredwg.js`, `dist/libredwg.wasm`을 생성합니다. 현재 배포 파일은 npm 0.2.0에 포함된 원본 WASM을 사용합니다. 직접 빌드한 WASM으로 교체하려면 `vendor/cadview-dwg/package/dist/libredwg.wasm`을 바꾼 다음 재생성 / 앱 빌드 / 테스트를 실행합니다.

## 실제 DWG 검증 파일

`example_2000.dwg`는 [LibreDWG 공식 저장소의 test/test-data/example_2000.dwg](https://github.com/LibreDWG/libredwg/blob/master/test/test-data/example_2000.dwg)에서 받은 582,572 바이트의 AutoCAD R2000 (`AC1015`) 테스트 도면입니다. 다운로드 원본은 [raw 파일](https://raw.githubusercontent.com/LibreDWG/libredwg/master/test/test-data/example_2000.dwg)입니다. 일반 선, 원호, 문자, 폴리선, 치수뿐 아니라 3D / 전문 객체와 배치 공간 객체도 들어 있어 생략 보고를 검증할 수 있습니다.

`test/importers.test.mjs`는 이 DWG를 포함된 WASM으로 실제 변환한 후 편집 객체로 가져옵니다. 네트워크를 사용하지 않는 worker 실행과 worker 정리까지 검증합니다. 여섯 가지 치수는 CAD DIMENSION / DIMSTYLE로 DXF를 내보낸 후 다시 가져와 종류, 치수 값, 문자 크기, 화살표 크기와 배율이 유지되는지도 확인합니다.

## 가져오기 범위

R13 ~ R2018 DWG와 ASCII DXF를 읽습니다. 선, 원, 원호, 폴리선, 문자, 중첩 블록, 배열 삽입, 일반 치수, 타원, 스플라인과 해치 경계를 편집 객체로 가져옵니다. 블록은 분해하고 타원 / 스플라인 / 곡선 폴리선은 폴리선으로 근사합니다. 기존 DIMENSION은 지원하는 여섯 종류를 편집 가능한 치수로 가져오며, 그 외 치수는 표시 블록이 있으면 개별 표시 객체로 가져옵니다.

해치 / 솔리드의 채움, CAD 전용 글꼴·서식, 기울어진 3D / 전문 프록시 객체는 완전하게 재현되지 않습니다. 배치 공간과 숨김 객체는 생략합니다. 보고서에 생략 종류와 근사 이유를 표시합니다. LibreDWG가 DWG 변환 단계에서 누락한 전문 객체는 개별 집계가 불가능해 DWG 가져오기 보고서에 해당 한계를 함께 표시합니다. 정상적으로 가져올 2D 객체가 없거나 파일이 손상된 경우에는 가져오기를 실패 처리하고 기존 도면을 유지하도록 호출 측에 오류를 반환합니다.
