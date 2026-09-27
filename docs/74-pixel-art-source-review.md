# 픽셀 아트 제작 자료 비교와 반영

검토일: **2026-09-27**. 사용자 지정 저장소와 유사 후보 7개를 비교해 **5개 자료의 25개 파일, 378,518바이트**를 채택했다. 코드·문서·라이선스만 읽었으며 외부 프로그램 설치, 원본 실행, 예제 그림 생성은 하지 않았다. 아래 commit은 검토한 HEAD이며 안정 릴리스나 Bedrock 호환 인증을 뜻하지 않는다.

## 선택한 자료

| 자료·고정 버전 | 채택할 부분 | 적용 한계 |
| --- | --- | --- |
| [Claude Fairy Pixel Art](https://github.com/dbinky/claude-fairy-pixel-art/tree/4de3ba0be118ebbc158afb0983d642e6c2818e48), 2026-04-02 | 에셋 명세, 역할명 팔레트, 상태 공통 기하, RGBA 출력 | 해당 게임 전용 생성기. 일반 생성 도구나 완성된 PNG 편집기로 등록하지 않았다. MIT |
| [Pixel Art Studio](https://github.com/Gamezxz/pixel-art-studio/tree/f8c246635c4621a6c2b427833149afdc3dc3c719), 2026-07-11 | 실루엣·픽셀 덩어리·팔레트·프레임 경계 검토 | 이미지 도구 선택을 덮어쓰는 규칙, 고정 반복 횟수, 자동 alpha 정리를 제외했다. 검토 파일 MIT; 예제 팬아트는 수집하지 않았다. |
| [Pixelorama](https://github.com/Orama-Interactive/Pixelorama/tree/da7b68f97806c461abde615d1d847af91921c37b), 2026-09-15 | 편집 가능한 레이어·프레임, 명시적 시트 내보내기 | 프로젝트 JSON과 exporter는 Bedrock UI·nine-slice 출력 계약이 아니다. 검토 파일 MIT |
| [pxlkit](https://github.com/Joangeldelarosa/pxlkit/tree/8e735fa3404a2b4a067e6904a4759a50b1af5bb7), 2026-08-09 | 크기·격자·팔레트·투명 셀·프레임 데이터의 분리 | 코드/문서 MIT와 기존 아이콘의 별도 Asset License를 구분했다. 아이콘 자산을 가져오지 않았다. |
| [Vollkorn Aseprite MCP](https://github.com/Vollkorn-Games/aseprite-mcp/tree/28900e757d7e5c18515ad0a95558acde1865aad2), 2026-09-02 | 요청별 도구 선택, 작은 수정 후 PNG 확인, 출력·padding의 분리 | 별도 Aseprite 환경이 필요하다. 서버 MIT가 Aseprite 실행파일 라이선스나 설치를 포함하지 않는다. |

스타일·미적 품질 우열은 실행 결과 없이 단정하지 않았다. 비교 기준은 필요한 작업의 명확성, 편집 원본 보존, 시각 검토, 내보내기 계약, 라이선스 확인과 기존 도구와의 중복이다.

## 사용자 지정 저장소에서 확인한 문제

- `generate-art.py`의 2108·2474행은 문자열 `hash(fname)`를 seed에 쓴다. Python의 프로세스별 hash salt 때문에 전체 생성 결과의 재실행 결정성을 보장하지 않는다. 명시 seed 또는 안정된 digest와 독립 실행 비교가 필요하다. [Python hash 계약](https://docs.python.org/3/reference/datamodel.html#object.__hash__)
- `generate-art.py` 2629–2643행은 설명 문장에서 크기를 추론한다. `poof` 명세의 `(128x32 sheet)`는 정규식과 맞지 않아 32×32 입력이 남으며, 프레임 함수가 기대하는 폭과 다르다. 크기·프레임 수를 구조화된 필드로 분리한다.
- 같은 파서의 `9-slice` 분기는 48×48 크기를 정할 뿐이다. 저장 함수 2604–2607행은 PNG만 쓰며 보호 폭이나 Bedrock sidecar를 만들지 않는다.
- `pixel-editor.jsx` 86–124행의 이력은 grid만 저장한다. resize 이후 Undo 때 rows/cols와 grid 크기가 달라질 수 있다. PNG import와 편집 프로젝트 저장 경로도 없어 생성물 전체를 그대로 수정하는 도구라고 볼 수 없다.
- 명세의 실제 PNG 행은 167개이고 요약은 163개다. 또한 `?`를 사용하는 아이콘이 있지만 자체 글꼴에 해당 글리프가 없다. 개수·상태·빈 결과·폰트 지원을 별도로 검사해야 한다.

이는 원본 파일과 데이터 흐름을 검토한 결과다. 외부 생성기·React 편집기를 실행해 재현한 결과로 표현하지 않는다. 원본 경로 고정, 미지원 이름의 빈 그림, 실패 후 종료 코드 등 추가 근거는 선택 출처 카드와 로컬 조사 보고서에 남겼다.

## 스킬과 도구에 반영한 내용

`data/pixel-art-methods.json`에 직접 작성한 네 제작 방식을 추가했다.

| ID | 사용 목적 |
| --- | --- |
| `ui-kit-spec-first` | 역할·크기·상태·파일 명세와 대표 에셋부터 UI 세트 구성 |
| `palette-and-clusters` | 1배 실루엣, 픽셀 덩어리, 명도·의미 색상 검토 |
| `sprite-animation` | 편집 원본·기준점·duration·프레임 순서와 정지 대안 보존 |
| `atlas-nine-slice` | 셀 좌표·원점·padding과 Bedrock 보호 테두리·sidecar 인계 |

```text
node tools/design-library.mjs methods
node tools/design-library.mjs method --method ui-kit-spec-first --style cozy16
node tools/design-library.mjs method --method sprite-animation --max-chars 7500
node tools/skill-context.mjs mcbe-json-ui-texture-design --needs pixel-art-method --compact --json
node tools/design-library.mjs sources --source dbinky-claude-fairy-pixel-art
node tools/design-source-sync.mjs --source dbinky-claude-fairy-pixel-art --verify
```

목록은 이름과 사용 시점만 반환한다. 선택 명령은 한 제작 방식과 해당 출처만 반환하며 스타일은 선택 사항이다. 기존 스타일 조회·기본 스킬 컨텍스트에 원문이나 외부 도구 목록을 추가하지 않았다. 글자 수 상한을 넘으면 깨진 JSON이나 출처 누락 대신 명시적으로 실패한다.

Bedrock nine-slice는 **기존 로컬 `asset-brief-contract.md`와 최종 RP 검증**을 따른다. 조사한 편집기의 atlas 기능을 Bedrock 지원으로 확대 해석하지 않는다. 코드 생성은 명시적으로 그런 제작 방식을 요청했을 때 선택하며, 이미지 생성·편집 요청에는 환경에서 제공하는 이미지 도구를 사용한다.

## 이번에 포함하지 않은 후보

- [Dizzd/aseprite_mcp](https://github.com/Dizzd/aseprite_mcp/tree/21bfadb08401da3fae76df36d16a8a0737e68638): slice 구현은 있으나 검토한 tree에서 README의 MIT 표기를 뒷받침하는 LICENSE 전문을 찾지 못해 채택을 보류했다.
- [mattt/aseprite-mcp](https://github.com/mattt/aseprite-mcp/tree/0cd6aac4420a603ec10d19c9fe49a1bb5f6bff8b): Apache-2.0 확인. 임의 Lua 중심 인터페이스와 별도 Aseprite 환경이 필요하며 선정 자료와 겹쳐 생략했다.
- [LibreSprite](https://github.com/LibreSprite/LibreSprite/tree/eb34acdf27805504fe6637093685944877b51fe5): GPL-2.0 확인. Pixelorama와 편집·프레임 작업이 겹쳐 이번 선택에서 제외했다. 품질이나 유지 실패를 의미하지 않는다.

## 재현과 검증 범위

`data/design-sources.json`은 선택·권리·근거 줄을, `config/design-research-lock.json`은 commit·파일별 SHA-256·크기를 보존한다. 원본은 `workspace/design-library/upstreams/<source-id>/`에 있으며 자동 실행되지 않는다. 전체 출처는 21개·438파일이고, 기존 디자인 스킬 자료 4개와 픽셀 제작 자료 5개는 별도 조회 경로를 갖는다.

정적 검증은 조회·출처 일치·경로·출력 크기와 기존 도구 계약을 확인한다. 독립 스킬 검토에서는 이미지 제작 계획 요청이 실제 이미지 생성·원본 변경·프로그램 설치로 확대되지 않는지 확인했다. 외부 도구 실행 품질과 Bedrock 런타임 호환성은 미검증이다.
