# Bedrock 공개 소스 검토: 폼 전송, 입력, 재사용 경계

검토일: 2026-09-27. **소스와 정적 연결을 확인했다. Bedrock에서 실행하거나 모바일 입력을 검증하지 않았다.**

## 결론

새 서버 폼은 현재 Mojang `server_form.json`의 화면·취소·컬렉션 연결을 출발점으로 삼는다. 고정 슬롯 메뉴에는 Chest-UI의 인덱스 유지 방식, 미리 컴파일한 복합 화면에는 bedrock-core의 화면 ID와 데이터 분리 방식을 참고할 수 있다. IsLocal의 실제 컨테이너 방식은 별도 서버 상태·아이템 회수 설계가 필요하다. 과거 팩의 전체 화면 복사와 현재 스키마의 타입만으로 최신 호환성을 판정하지 않는다.

재사용 가능한 요약 카드는 [bedrock-source-patterns.json](../data/bedrock-source-patterns.json)에 있다. 원본 코드나 텍스처를 이 카드에 복제하지 않았다. 디자인 검색과 제작 절차는 [72-design-library.md](72-design-library.md)에서 별도로 다룬다.

## 1. 범위와 재현 가능한 근거

입력은 `workspace/design-research-20260927/sources/<sourceId>/`의 선택 취득본이다. 원격 저장소 전체를 검사한 결과가 아니다. 기본 389개 파일은 취득 메타데이터의 SHA-256과 전부 일치했다. bedrock-core의 전송·계약·컴파일러 3개 파일을 같은 커밋에서 추가로 읽었다. 상세 검토 범위는 총 392개 파일이다. 다운로드한 스크립트와 패키지는 실행하지 않았다.

| sourceId | 고정 리비전 | 커밋 시각(UTC) | 확인한 이용 조건과 범위 |
| --- | --- | --- | --- |
| `mojang-bedrock-samples` | [46ba6ea985fb](https://github.com/Mojang/bedrock-samples/tree/46ba6ea985fb5a92d79a9419198f10dda14c199d) | 2026-09-16 04:27:23 | `LICENSE.md`: Mojang 권리 고지와 Minecraft EULA. 자유 에셋 라이선스로 분류하지 않음 |
| `mojang-bedrock-schemas` | [2b842801ce08](https://github.com/Mojang/bedrock-schemas/tree/2b842801ce08f42f21d9782543c8dfb868b84eee) | 2026-09-21 18:10:57 | `LICENSE`: MIT. 스키마 배포 조건과 게임 에셋 이용 조건은 별개 |
| `herobrine643928-chest-ui` | [115d95c8239a](https://github.com/Herobrine643928/Chest-UI/tree/115d95c8239a0ee2f578a9a7710699a8f6627f26) | 2026-08-14 14:07:02 | `License`: CC-BY-4.0. 원본·변경 사항의 출처 관리 필요 |
| `islocal-chest-gui` | [daa618405f49](https://github.com/IsLocal/Chest-GUI/tree/daa618405f49207c2b47630bd171d50f85ca5f0b) | 2023-01-27 14:44:46 | 취득본과 트리에서 명확한 배포 라이선스를 확인하지 못함. 분석 메타데이터만 사용 |
| `dryanfth-customserverui` | [0b6a60aef841](https://github.com/DryanFTH/CustomServerUI/tree/0b6a60aef8413cb71b3388c601a5d666c4c96c0b) | 2023-04-02 01:05:16 | `LICENSE`: GPL-3.0. UI 파일에는 Mojang/Microsoft 고지도 있어 제3자 에셋 권리를 일괄 추정하지 않음 |
| `bedrock-core-ui` | [6977e257cb87](https://github.com/bedrock-core/ui/tree/6977e257cb874087b22cfc506ae9db3440d17bda) | 2026-09-21 17:44:55 | `LICENSE`: MIT. README는 1.0 이전 변경 가능성과 정확한 버전 고정을 요구 |
| `bedrock-oss-bedrock-wiki` | [73d2c4116fad](https://github.com/Bedrock-OSS/bedrock-wiki/tree/73d2c4116fad3865a14f63367c038c2f6aba78a9) | 2026-09-25 12:00:11 | MIT/CC-BY 문서가 있으나 읽은 JSON UI 페이지에는 `license` frontmatter가 없음. 페이지별 적용 조건 미확정 |

라이선스 표는 저장소의 표시를 기록한 것이며 제3자 코드·텍스처의 권리까지 확인한 결과가 아니다. Wiki의 [기여 문서](https://wiki.bedrock.dev/contribute-style)는 페이지 `license`와 본문/코드별 조건을 구분한다. 라이선스 문서가 있다는 이유만으로 모든 페이지를 MIT로 취급하지 않는다.

### 정량 스캔

`/ui/` 아래 JSON 중 최상위 `namespace`가 있는 파일을 Bedrock JSON 파서로 읽었다. 아래 선언 수는 최상위 키 수이며 템플릿·애니메이션도 포함한다. 실제 화면에 생성되는 컨트롤 수나 성능 수치가 아니다. 바인딩은 리터럴 배열 항목, factory는 `factory` 속성 또는 `type: factory`, modifications는 리터럴 수정 항목을 센다.

| 출처 | 파일 | namespace UI | 최상위 선언 | 바인딩 | factory | 수정 항목 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Mojang samples | 224 | 205 | 6,592 | 4,566 | 130 | 0 |
| Mojang schemas | 13 | 0 | 0 | 0 | 0 | 0 |
| Herobrine Chest-UI | 23 | 4 | 32 | 42 | 0 | 0 |
| IsLocal Chest-GUI | 22 | 2 | 30 | 3 | 0 | 0 |
| DryanFTH CustomServerUI | 67 | 3 | 83 | 44 | 9 | 0 |
| bedrock-core-ui | 30 | 22 | 102 | 137 | 3 | 8 |
| Bedrock Wiki | 13 | 0 | 0 | 0 | 0 | 0 |
| 합계 | **392** | **236** | **6,839** | **4,792** | **142** | **8** |

236개 UI는 문법 파싱에 성공했다. 변수로 공급하는 배열과 Markdown 코드 예제는 집계에서 제외했다. 스키마 타입 일치, 참조의 전체 해소, Bedrock 콘텐츠 로그는 이 검사에 포함되지 않는다.

추가 core 파일의 SHA-256:

| 경로 | SHA-256 |
| --- | --- |
| `packages/ui-runtime/src/hosts/form/runtime.ts` | `c8d4e713128789c675be570ea4e08ec1612aad2b14974554c27526dfbbd0f315` |
| `packages/ui-runtime/src/hosts/form/contract.ts` | `5b9a2fd2b1a30da251462f3335835cc96a2a4a41068af3dfb077641d992d3977` |
| `packages/ui-compiler/src/hosts/form/emit.ts` | `748bd04ecec08bef83a72ca1b151015038d241e7b83eccf4623f6e835d981896` |

이하 경로는 각 sourceId의 루트를 기준으로 한다. `/...` 표기는 JSON pointer이며 JS/TS는 함수명을 식별자로 쓴다.

## 2. Mojang: 현재 폼의 연결 기준

근거: [resource_pack/ui/server_form.json](https://github.com/Mojang/bedrock-samples/blob/46ba6ea985fb5a92d79a9419198f10dda14c199d/resource_pack/ui/server_form.json).

- 진입: `/third_party_server_screen@common.base_screen`의 `$screen_content` → `/main_screen_content/controls/0/server_form_factory/control_ids` → `long_form` 또는 `custom_form`.
- Action Form: `/long_form_dynamic_buttons_panel/factory`가 버튼·라벨·헤더·구분선을 선택한다. `/long_form_dynamic_buttons_panel/collection_name`은 `form_buttons`; 바인딩은 `#form_button_contents`를 `#collection_length`로 연결한다.
- 버튼: `/dynamic_button/controls/1/form_button@common_buttons.light_text_button`에 `button.form_button_click`과 `collection_details`가 함께 있다. 텍스트와 이미지에는 해당 컬렉션 바인딩을 쓴다. 버튼 순서와 응답 인덱스의 대응을 BP에서 유지해야 한다.
- Modal Form: `/generated_contents/factory/control_ids`는 toggle·slider·dropdown·input·multiselect 등을 분기하고 컬렉션은 `custom_form`이다. `/custom_form_scrolling_content/controls/1/submit_button@common_buttons.light_text_button`은 `button.submit_custom_form`을 사용한다.
- 취소: 화면의 `button.menu_cancel` → `button.menu_exit` 연결을 유지한다. BP는 응답의 `canceled`를 먼저 확인한 뒤 `selection` 또는 `formValues`를 읽는다. 선택/취소 계약은 [공식 DDUI 가이드의 기존 폼 비교](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/intro-to-ddui?view=minecraft-bedrock-stable#button-callbacks-vs-selection-indices)에서도 확인된다.

**적용:** 바깥 화면과 종료 경로를 유지하고 안쪽 표현을 전용 네임스페이스로 분리한다. 실제 호출 BP를 함께 검사해야 구매·보상·권한 판단까지 연결됐다고 할 수 있다. 이 공식 RP 파일 자체에는 사용자 애드온의 BP 로직이 없다.

**버전:** 취득 `resource_pack/manifest.json#/header/min_engine_version`은 `[1,26,50]`이다. samples의 기준과 26.52 클라이언트 검증을 같은 것으로 기록하지 않는다.

## 3. Herobrine Chest-UI: 폼 버튼을 고정 슬롯으로 사용

근거: `BP/scripts/extensions/forms.js`의 `ChestFormData.constructor/button/show`, `BP/scripts/index.js`의 `primaryMenu/furnaceMenu`, `RP/ui/server_form.json`, `RP/ui/chest_server_form.json`.

흐름은 다음과 같다.

1. BP는 크기별 제목 표식을 먼저 넣고 정해진 수의 빈 버튼 항목을 만든다. `button(slot, ...)`은 항목을 교체한다. `show()`는 빈칸도 포함해 모든 항목을 `ActionFormData.button()`에 보낸다.
2. 버튼 텍스트 앞에 수량·내구도용 고정 폭 필드를 붙인다. RP는 `#form_button_text`의 앞부분을 잘라 수량·내구도·이름으로 나눈다. 송수신 폭이 한쪽에서 바뀌면 세 값이 함께 틀어진다.
3. `RP/ui/server_form.json`은 `#title_text`의 표식으로 바닐라 폼·상자·화로의 가시성을 나눈다. `chest_server_form.json#/grid_items`는 `form_buttons`, `chest_ui.inventory_item_panel`, 크기별 `grid_dimensions`를 사용한다.
4. `/inventory_item@common.button`은 `button.form_button_click`과 `collection_details`를 가진다. 예제 BP는 `response.canceled`면 반환하고, `selection`을 슬롯 번호로 처리한다.

**재사용:** 빈 슬롯을 생략하지 않는 고정 인덱스 계약, 하나의 셀 템플릿, 상태별 버튼 자식, 전송 폭을 한 곳에서 정의하는 설계를 채택한다. 자체 제목 표식과 텍스처를 사용한다.

**제한:**

- BP manifest는 `@minecraft/server` 1.18.0, `@minecraft/server-ui` 1.3.0, 최소 엔진 1.21.0이다. 최근 커밋이라는 사실만으로 26.52 API 호환성을 증명하지 않는다.
- 기본 생성자는 27칸을 선택하지만 취득 `_global_variables.json`은 54칸 이외 레이아웃을 비활성화한다. 호출 크기와 RP 활성화 설정을 함께 맞춰야 한다.
- inventory 확장 시 `show()`는 빈 인벤토리 슬롯을 건너뛴다. 추가 응답 인덱스를 실제 인벤토리 슬롯으로 바로 취급할 수 없다. BP의 `inventory_enabled`와 RP의 `$show_inventory`도 일치해야 한다.
- raw ID/AUX 표는 버전에 민감하다. README도 직접 텍스처 경로를 권한다. 직접 이미지와 아이템 렌더러의 인챈트·내구도 표현은 동일하지 않다.
- 18×18 셀과 hover 설명은 소스에서 확인했다. 터치 목표 크기, 화면 잘림, 게임패드 이동, 열린 상태 데이터 갱신은 확인하지 않았다.

## 4. IsLocal Chest-GUI: 실제 아이템과 서버 수명주기

근거: `Behavior/scripts/chestGUI.js`의 `summon/validate/initPage/close`, `Behavior/entities/chest_gui.json`, `Resource/ui/chest_screen.json`.

`summon()`이 GUI 엔티티와 플레이어를 연결하고, `initPage()`가 엔티티 `nameTag`에 제목을 넣고 인벤토리를 채운다. RP의 `container_items` 컬렉션은 실제 컨테이너 슬롯을 그린다. BP는 매 틱 `validate()`에서 슬롯 변화와 플레이어 인벤토리를 검사해 button/input/output 역할의 이벤트를 발생시킨다. 종료 조건은 태그·체력·선택 슬롯·사용자 조건이다. `close()`는 input 아이템을 반환하고 엔티티를 제거한다. **이 경로에는 ActionFormData의 `response.selection/canceled`가 없다.**

**재사용:** 슬롯의 역할과 서버 상태 소유권을 명확히 나누는 모델만 참고한다. 실제 아이템을 이용하는 메뉴는 세션별 엔티티 식별, 인벤토리 가득 참, 접속 종료, 동시 사용자까지 별도 설계해야 한다.

**현재 소스의 위험:**

- `summon()`은 `entityCreate` 콜백에서 대상 엔티티 여부 확인 전에 구독을 해제한다. 관련 없는 생성 이벤트가 먼저 오면 초기화를 놓칠 가능성이 코드에 있다.
- `initPage()`의 반복 콜백은 `close()` 뒤에도 `validate()`와 teleport를 계속 수행한다. 종료 뒤 접근이 안전한지는 확인되지 않았다.
- `close()`는 `container.addItem()` 결과를 처리하지 않는다. 반환 공간 부족 경로가 누락돼 있다. `validate()`의 같은 아이템 타입 제거·주변 드롭 제거 역시 실제 아이템 보존 검증이 필요하다.
- manifest는 1.19.50 및 오래된 beta Script API를 사용한다. README는 모바일 UI를 지원 대상으로 삼지 않는다. 라이선스도 미확정이므로 현행 코드로 가져오지 않는다.

## 5. DryanFTH CustomServerUI: 표현 변경과 유지보수 비용

근거: `resource_packs/CustomUIRSP/ui/server_form.json`, `CustomUIRSP-text-black/ui/server_form.json`, `CustomUIRSP-text-purple/ui/server_form.json`.

기본 `server_form_factory`의 long/custom 분기, `form_buttons` 클릭, `custom_form` 제출 경로를 유지하고 프레임·제목·버튼을 바꾼다. `/close_button`은 default/hover/pressed를 별도로 지정하고, 두 입력 매핑이 `button.menu_exit`로 연결된다. BP는 포함하지 않아 서버 응답 처리와 취소 후 상태는 여기서 확인할 수 없다.

**재사용:** 세 가지 상태 표면과 명시적 닫기 버튼을 갖춘 디자인 구조를 참고한다. 원본 UI를 통째로 복사하는 방법은 업데이트에 따라 검토할 부분이 커진다. 세 팔레트는 독립 입력 아키텍처가 아니다. 2023년 커밋이며 README도 유지보수를 기대하지 말라고 안내한다. GPL 표시와 제3자 고지 때문에 새 독자 텍스처·구현으로 적용하는 편이 분명하다.

## 6. bedrock-core: 컴파일한 화면과 전송 데이터를 분리

근거: `packages/ui-runtime/src/hosts/form/runtime.ts`, `contract.ts`, `packages/ui-compiler/src/hosts/form/emit.ts`; RP는 `packages/resource-pack/packs/RP/ui/server_form.json`, `ui/core-ui/hosts/form/action_container.json`, `mount.json`, `state.json`.

- `contract.ts`의 `titleFor/keyFrom`은 프로토콜 헤더·인코딩·화면 키를 분리한다. 취득본의 제목은 `corev0009core1:<key>` 형태다. 자체 구현에서는 자체 식별자를 사용한다.
- `runtime.ts`의 `compiledValuesOf/entryValue`는 텍스트·텍스처·가시성·개수·상태를 순서 있는 항목으로 배치한다. `presentCompiledForm()`이 모든 항목을 `.button(value)`로 전송하므로 컴파일된 `collection_index`와 선택 응답이 대응한다.
- RP `server_form.json`은 헤더가 있는 폼에서 기존 화면을 숨기고 자체 factory와 컨테이너를 선택한다. `mount.json#/claimed`에서 제목을 검사하고 `/compiled_root` 아래 미리 배치한 화면을 표시한다.
- 취소 응답은 `cleanup`, 클릭은 `entries.find(entry.entry === response.selection)`로 콜백을 찾아 처리한다. 외부 호출용 `showCompiledTitle()`은 취소를 `undefined`로 반환한다. 다시 표시하는 정책은 이 파일 밖의 세션 계층이 담당하므로 열린 화면의 실시간 갱신을 확인한 것으로 해석하지 않는다.
- `contract.ts`의 `DETAILS_BINDING`과 `emit.ts` 주석은 클릭 컨트롤 자체에 `collection_details`가 없을 때 취소로 보이는 문제를 기록한다. Mojang의 현재 버튼 선언에서도 해당 바인딩을 확인했다. 커뮤니티가 설명한 정확한 실패 재현은 이번 작업에서 실행하지 않았다.

**재사용:** 화면 구조를 RP에 미리 두고 BP는 화면 키와 값만 보내는 구조, 인코딩 범위 검사, 빌드와 실행에서 같은 항목 배치를 사용하는 계약이 유효하다. 복잡한 메뉴라도 서버 권한과 거래 검증은 BP에 둔다.

**수정 경계:** `mount.json` 주석은 modifications가 네임스페이스보다 파일 경로에 결합하고 상속만 한 배열 수정이 가릴 수 있다고 보고한다. 이는 해당 저자의 관찰이며 공식 엔진 명세 또는 이번 런타임 검증이 아니다. 이 저장소의 정적 렌더러는 같은 파일 경로의 직접 배열 수정만 합성하며, 다른 파일 간 수정과 상속만 한 배열 수정은 `unresolved_modification`의 blocking 진단으로 처리한다. 나머지 엔진 동작까지 구현했다고 주장하지 않는다.

**제한:** beta 라이브러리이며 정확한 커밋·RP 프로토콜·컴파일러를 함께 고정해야 한다. 3개 TS와 선택 RP 파일을 읽었을 뿐 전체 컴파일러·세션·모달 필드 경로를 실행 검증하지 않았다. `gamepad_cursor` 선언도 게임패드·모바일 사용성의 증거가 되지 않는다.

## 7. 스키마와 Wiki: 교차 확인에 사용

`mojang-bedrock-schemas/schemas/rp/ui/index.schema.json`은 화면 객체의 `namespace`만 정의한다. 이 파일의 통과로 하위 컨트롤 속성까지 검증됐다고 할 수 없다. `types/rp/ui/UiElement.d.ts`에는 `factory?: string`(140행), `font_scale_factor?: boolean`(182행), `grid_item_template?: number`(212행)가 있다. 같은 시점 Mojang `server_form.json`의 factory 객체, Chest-UI의 문자열 grid template 등과 일치하지 않는다. 스키마를 자동으로 로컬 규칙에 덮어쓰지 말고 충돌을 기록하고 실제 샘플·공식 속성 문서를 함께 확인한다.

Wiki의 [best-practices.md](https://github.com/Bedrock-OSS/bedrock-wiki/blob/73d2c4116fad3865a14f63367c038c2f6aba78a9/docs/json-ui/best-practices.md)는 변경 속성을 좁히고 바닐라 전체 복사를 피하도록 설명한다. `preserve-title-texts.md`의 `preserved_title_display/data_control` 예제는 컨트롤별 `property_bag`에 받은 값을 저장하고 표식이 맞는 HUD 제목만 갱신한다. 이것은 HUD `#hud_title_text_string`의 보존 패턴이며 서버 폼 `#title_text` 라우팅과 별개다. `visibility_changed` 타이밍과 중복·누락 제목 처리는 실제 클라이언트 검증이 필요하다.

## 8. 26.52와 DDUI를 구분

2026-09-27 확인한 공식 최신 핫픽스는 26.52이며 공지는 9월 25일 게시되었다. 플랫폼별 승인 후 배포된다는 설명이 있으므로 실제 기기 버전도 기록한다. 이 공지는 개별 커뮤니티 팩 호환성을 보증하지 않는다. [공식 26.52 변경 기록](https://feedback.minecraft.net/hc/en-us/articles/49175370527501-Minecraft-Bedrock-Edition-26-52-Hotfix-Changelog)

26.30에서 `CustomForm`, `MessageBox`와 지원 API가 `@minecraft/server-ui` 2.1.0 정식 API가 되었다. 현재 명칭은 `ObservableString/Number/UIRawMessage/Boolean`이며 예전 `Observable` 예제를 그대로 사용하지 않는다. [공식 26.30 변경 기록](https://www.minecraft.net/en-us/article/minecraft-26-30-bedrock-changelog)

| 선택 기준 | 기존 ActionFormData/ModalFormData와 JSON UI RP | DDUI CustomForm/MessageBox |
| --- | --- | --- |
| 데이터 | 표시할 때 전송한 텍스트·컬렉션과 응답 | Observable 값을 갱신하고 callback 처리 |
| 응답 | `selection`, `formValues`, `canceled` 계약 | 컨트롤 callback, Observable, 화면 종료 계약 |
| 갱신 | 다시 표시하는 생명주기를 별도 설계 | 열린 상태의 값 변경과 반복 동작 지원 |
| 이번 소스 패턴 | 제목 표식·factory·고정 컬렉션 인덱스 | 동일 RP 덮어쓰기 경로를 검증하지 않음 |

DDUI의 열린 화면 갱신은 [공식 가이드](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/intro-to-ddui?view=minecraft-bedrock-stable)에서 확인된다. 이 사실을 기존 폼의 라이브 갱신 또는 임의 RP 레이아웃 호환성으로 확대하지 않는다. 가이드의 일부 예제 import에는 이전 `Observable` 표기가 남아 있어 해당 API 버전의 타입과 변경 기록을 같이 확인한다.

## 9. 적용 전 확인할 증거

1. 대상 기기의 실제 버전, Script API 버전, RP 순서와 프로토콜 버전을 기록한다.
2. BP 송신 순서와 RP 컬렉션 인덱스를 같은 fixture로 검사한다. 빈 슬롯, 비활성 버튼, 마지막 인덱스, 긴 한국어 이름을 포함한다.
3. 실제 클라이언트에서 클릭 선택·X/뒤로 취소·폼 거절과 BP 결과를 함께 기록한다. 모바일은 hover 설명 없이도 필요한 정보를 읽을 수 있어야 한다.
4. 실제 아이템 컨테이너 방식에는 가득 찬 인벤토리, 동시 사용자, 접속 종료와 재접속, 반환 실패를 추가한다.
5. 최신 콘텐츠 로그와 실제 화면·입력 증거를 남긴다. 출처의 스크린샷, 파싱 성공, 정적 렌더러 결과만으로 runtime 검증 등급을 올리지 않는다.
