# 선택형 UI·게임 UI 디자인 자료

체스트 GUI는 `node tools/design-library.mjs chest-topics`에서 7개 주제 중 하나를 선택한다. `chest --topic ID`로 실제 컨테이너 또는 ActionForm 자료만 읽는다. [체스트 도구](75-chest-gui.md), [소스 검토](76-chest-source-review.md)를 참고한다.

검토일: **2026-09-27**. 기존 `visual-design`, `texture-design`, `research`, `samples` 스킬에 연결했다. 외부 스킬 원문을 기본 프롬프트에 합치거나 실행하지 않는다. 필요한 스타일·화면·입력 체크만 조회한다.

## 스타일과 사용

| ID | 방향 |
| --- | --- |
| `cartoony-pixel` | 카툰 / 애니메이션 픽셀, 단순한 실루엣과 짧은 피드백 |
| `fantasy-rpg` | 판타지 RPG / 어드벤처, 양피지·나무·금속·리본 |
| `clean-pixel` | 클린 GUI / 미니멀 픽셀, 여백과 정보 계층 |
| `cozy-vanilla-16` | 바닐라 16×16 아이콘 감성, 화사한 크림·목재·잎색 |
| `dark-fantasy` | 어두운 패널, 얇은 문양, 읽기 쉬운 퀘스트 |
| `arcade-pixel` | 점수·보상 강조, 밝은 포인트 |

```text
node tools/design-library.mjs styles
node tools/design-library.mjs context --style cozy-vanilla-16 --role inventory,shop --input mixed
node tools/design-library.mjs context --style fantasy-rpg --role quest --input gamepad --limit 0
node tools/design-library.mjs skills
node tools/design-library.mjs sources --source kenney-ui-pack-pixel-adventure
node tools/design-library.mjs verify
```

역할은 `menu`, `inventory`, `shop`, `quest`, `settings`, `hud`, `reward`, `character`이며 쉼표로 최대 3개를 합칠 수 있다. 입력은 `mixed`, `keyboard`, `gamepad`, `touch`. `mixed`는 개별 장치 체크를 모두 포함한다. 기본 응답 상한은 **7,500자**, 패턴 카드는 최대 **2개**다. `--max-chars 1500..16000`, `--limit 0..3`으로 조절한다. 원문을 잘라 깨진 JSON을 출력하지 않으며, 필수 출처·권리·한계가 예산에 들어가지 않으면 명시적으로 실패한다. 글자 수 상한은 정확한 모델 토큰 수가 아니다.

색상·두께·프레임 수는 **새 디자인 제안**이다. 실측 치수와 구별한다. 불투명 sRGB 본문/배경 대비도만 계산하며 실제 텍스처·알파·글리프·기기 대비는 별도로 검사한다. 16×16은 모든 패널·버튼·한글 영역을 16단위로 만들라는 뜻이 아니다.

## 조사한 스킬과 자료

### 픽셀 아트 제작 방식 선택

```text
node tools/design-library.mjs methods
node tools/design-library.mjs method --method ui-kit-spec-first --style cozy16
node tools/design-library.mjs method --method sprite-animation
```

명세부터 만드는 UI 세트, 팔레트·픽셀 덩어리 검토, 프레임 애니메이션, atlas·nine-slice 인계의 네 방식을 선택한다. 한 번에 한 카드와 그 출처만 반환하며 `--style`은 선택 사항이다. 기존 스타일 조회와 기본 스킬 컨텍스트에는 새 자료 원문을 넣지 않는다. [조사 결과와 채택·제외 이유](74-pixel-art-source-review.md), [설치형 스킬의 제작 지침](../skills/mcbe-json-ui-texture-design/references/pixel-art-production.md)을 참고한다.

### 디자인 비교 보드

```text
node tools/design-board.mjs --styles cozy16,fantasy-rpg,clean-pixel --out workspace/style-review
node tools/skill-context.mjs mcbe-json-ui-visual-design --needs design-board --compact --json
```

`index.html`과 `design-board.json`을 생성한다. HTML에는 외부 폰트·이미지·스크립트 의존성이 없다. 같은 인벤토리·상점 예시로 팔레트, 기본·초점·눌림·잠김 상태, 긴 한글, 좁은 카드, 사용자 문구를 비교한다. `--role`은 검토 기준을 선택하며 다른 화면의 구조를 생성하지 않는다. 출처와 권리 정보는 접힌 상세 영역에서 확인한다.

기본값은 6개 스타일이며 `--styles`로 1~6개를 고른다. 기존 파일은 보존하고 실패하며 재생성은 `--overwrite`로 명시한다. 콘솔에는 작은 결과와 경로만 출력해 HTML 전체가 컨텍스트에 들어가지 않는다. 실제 Bedrock 폰트·에셋·렌더링·입력 증거는 별도로 확보한다. 스타일 차이를 검토할 때만 `design.board`를 불러온다.

두 파일은 임시 영역에서 모두 작성한 뒤 교체한다. 실패하면 기존 파일 쌍을 복원하며, 복원까지 실패한 경우 `.design-board-output.lock/old/`의 백업과 오류에 표시한 복구 경로를 남긴다. 이 상태에서는 자동 재시도를 차단하므로 백업을 확인한 뒤 복구한다. 브라우저가 로컬 파일을 차단하면 화면 검증은 미완료로 기록한다.

### 검토한 외부 자료

| 자료 | 적용 범위 |
| --- | --- |
| [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 스타일·색상·밀도를 나눠 검색. MIT |
| [Game UI/UX](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) | safe area, 입력·초점·화면 복귀. Apache-2.0/NOTICE |
| [Game UI Design](https://github.com/jeremylongworth-source/AgentSkills) | 플레이어 행동, HUD/메뉴 정보량, 상태 설계. MIT |
| [Frontend Design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) | 참조에 맞는 구성·디자인 비평만 선택 참고. 해당 스킬 Apache-2.0 |
| [Kenney Pixel Adventure](https://kenney.nl/assets/ui-pack-pixel-adventure), [Adventure](https://kenney.nl/assets/ui-pack-adventure), [UI Pack](https://kenney.nl/assets/ui-pack) | 픽셀 패널 및 일반 GUI 구성·상태 참고. 각 다운로드 License.txt CC0 |
| [Kenney Tiny Town](https://kenney.nl/assets/tiny-town), [Fantasy UI Borders](https://kenney.nl/assets/fantasy-ui-borders) | 16×16 색감·밀도, 절제된 판타지 테두리. CC0 |

웹 CSS·Godot·Unity 구현과 임의 폰트, 벡터 전용 규칙, CSS px 숫자를 Bedrock 속성으로 옮기지 않는다. 상세한 채택/제외 기준은 [스킬 어댑터](../skills/mcbe-json-ui-visual-design/references/design-skill-adapters.md)에 있다. Tiny Town은 월드 타일이고, 일반 UI Pack과 Adventure의 부드러운 아트는 네이티브 픽셀 UI가 아니다. 5개 Kenney Sample.png를 직접 열어 확인했다.

공식 Mojang samples/schemas와 Chest-UI, Chest-GUI, CustomServerUI, core-ui, Bedrock Wiki의 실제 파일 분석은 [별도 보고서](73-bedrock-source-review.md)를 본다. 모두 런타임 상태는 `unverified`이며 자료 연도가 오래된 사례를 최신 호환으로 표시하지 않는다.

## 원본 다운로드와 권리

```text
node tools/design-source-sync.mjs --source kenney-tiny-town
node tools/design-source-sync.mjs --source kenney-tiny-town --download
node tools/design-source-sync.mjs --source kenney-tiny-town --verify
```

첫 명령은 계획만 출력한다. 명시적 다운로드는 `workspace/design-library/upstreams/<source-id>/`에 고정 SHA-256·크기 검증 후 저장한다. ZIP은 자동 실행·설치·압축 해제하지 않는다. 기존 해시가 다르면 보존하고 실패한다. 이 작업에서 조사한 원본은 캐시에 준비했다. 전체 원문을 매번 읽을 필요가 없다.

- CC0 아트는 선택 재사용 가능하지만 실제 크기·투명도·상태·nine-slice를 확인한 뒤 대상 RP에 명시적으로 넣는다.
- Mojang 자료는 EULA, 라이선스 미확인 팩은 분석 전용이다.
- GPL/MIT/Apache 코드는 해당 조건과 별도 에셋 권리를 확인한다. 이번 통합은 출처·해시·직접 작성한 요약과 어댑터다.
- 새 버전은 lock을 자동 덮어쓰지 않는다. 새 revision의 파일·라이선스·차이를 검토한 뒤 갱신하고 `verify`와 관련 테스트를 실행한다.

## 소스 파일

`data/design-styles.json`(스타일 제안), `data/game-ui-design.json`(역할·입력 기준), `data/design-skill-sources.json`(외부 스킬), `data/design-sources.json`(작은 출처 목록), `data/bedrock-source-patterns.json`(패턴), `config/design-research-lock.json`(파일별 원본 해시)이 원본이다. 신규 스타일/자료는 이 데이터를 편집하며 기본 SKILL 본문에 원문을 쌓지 않는다. 스킬만 설치한 환경은 포함된 `style-selection.md`의 간단한 표와 절차를 사용하고 도구 부재를 명시한다.
