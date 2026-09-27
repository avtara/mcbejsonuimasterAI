# Chest GUI 설계와 검사

`mcbe-json-ui-chest-gui`는 실제 컨테이너, 체스트 모양 ActionForm, Minato 저장 프로젝트를 구분하고 필요한 참고 문서 하나만 읽는다.

| 방식 | 실제 동작 | 검사 대상 |
| --- | --- | --- |
| Native container | 아이템 이동·스택 분할·드롭 | `chest_screen`, 컬렉션·원본 슬롯, 서버 상태 |
| Chest-style ActionForm | 메뉴 버튼 선택과 BP 작업 | `server_form`, 고정 버튼 배열, 페이지·응답 스냅샷 |
| Minato project | 브라우저 편집 상태 | formatVersion 2 JSON, 화면·탭·이미지 참조 |

Minato의 검토한 출력은 `small_chest_screen`을 변경한다. Double Chest 템플릿의 모양만으로 큰 상자 경로 지원을 판단하지 않는다. [소스 검토](76-chest-source-review.md)에 근거와 알려진 결함이 있다.

## 주제 하나만 조회

```powershell
node tools/design-library.mjs chest-topics
node tools/design-library.mjs chest --topic native-slots --max-chars 6000
node tools/design-library.mjs chest --topic action-grid --max-chars 6000
```

방식 선택, 실제 슬롯, 상태 프로토콜, 탭/스크롤, 프로젝트 왕복, ActionForm 고정 슬롯, 인벤토리/아이콘의 7개 주제가 있다. 카드마다 선택한 출처·커밋·라이선스·해시·줄 범위만 포함한다. 기존 스타일/픽셀 제작 기본 출력은 늘리지 않는다.

## Minato 저장 JSON 검사

```powershell
node tools/chest-project.mjs --input examples/chest/minato-v2-audit.json --capacity 27 --json
node tools/chest-project.mjs --input workspace/project.json --capacity 54 --report workspace/chest-project-report.json --json
```

`--capacity`는 대상 컨테이너의 실제 크기다. Preview Only 슬롯 수로 추측하지 않는다. 검사기는 숫자형 슬롯 범위, 화면/컴포넌트 ID, 활성 화면, 탭 부모와 순환·실제 토글 이름 충돌, 트리거, 저장본 불일치, 업로드 이미지 참조와 그리드 설정을 검사한다. 원본이 정상 처리하는 그리드 숫자 문자열은 허용하고, 슬롯 번호의 문자열 산술 위험은 별도 진단한다. 원본을 보정하지 않는다.

stdout 기본 예산은 6,000자다. 생략 진단 수와 전체 오류 수를 남기며 `--report`로 전체 진단을 새 파일에 저장할 수 있다. 기존 파일은 덮어쓰지 않는다. 종료 코드 0은 구조 검사 통과(경고 가능), 1은 진단 오류, 2는 인자·JSON·I/O 오류다.

ZIP 복구, 이미지 내용 판독, RP 생성, 외부 JavaScript 실행이나 Bedrock 입력 검증은 수행하지 않는다.

## 독립적인 슬롯 계약

```powershell
node tools/chest-contract.mjs --contract examples/chest/action-form-27.json --json
node tools/chest-contract.mjs --contract examples/chest/native-container-54.json --json
```

`schemas/chest-contract.schema.json`과 두 예제는 직접 작성한 선언 형식이다. `transport`를 정하고 grid/pages/slots를 기록한다. `--page ID`는 한 페이지의 전체 슬롯 맵을, `--report NEW_FILE`은 전체 계획을 출력한다. 54칸 상세 맵은 `--max-chars 16000`을 사용한다.

- ActionForm: 빈 셀 보존, selection 순서, semantic ID, 잠금/장식 슬롯, 페이지 이동, close/cancel과 응답 스냅샷.
- Native: 선언한 컬렉션의 크기와 실제 source index. 컨트롤은 조작 대상 슬롯을 `targetSource`로 명시할 수 있고, 표시 중인 슬롯을 대상으로 삼아도 된다. 이벤트별 필수 대상은 실제 RP에서 확인한다. ActionForm callback/selection 필드를 섞으면 실패한다.
- 공통: 중복 ID·슬롯, 범위, 아이콘/수량 선언, 출력 예산, 원본 보존.

`resolveChestResponse`는 계획의 구조와 슬롯 규칙을 다시 검사한 뒤 캡처된 페이지와 현재 스냅샷을 대조하는 순수 함수다. selection 0은 정상 선택이며 canceled·장식·잠금·오래된 응답은 작업으로 승격하지 않는다. 실제 폼 표시나 거래/보상은 수행하지 않는다. 종료 코드 0/9/64/1은 각각 성공/명세 오류/인자·출력 예산 오류/I/O 오류다.

명세와 실제 RP/BP의 일치는 별도 추적해야 한다. 도구의 크기 제한은 자원 사용 제한이며 Minecraft 엔진 한계가 아니다.

## 디자인과 인게임 검증

스타일을 선택한 뒤 셀·프레임·인벤토리·핫바·닫기를 포함한 전체 외곽을 IR과 대상 GUI 스케일로 정한다. touch에서도 hover 없이 이름·수량·잠금 상태를 알 수 있어야 하고, controller로 모든 셀과 탭/닫기에 도달해야 한다.

증거는 프로젝트 구조 → 선언한 슬롯 맵 → 실제 RP 참조/바인딩 → 정적 렌더 → Bedrock 입력/데이터 순으로 기록한다. 첫·중간·마지막·빈 슬롯, 작은/큰 상자와 일반 fallback, 탭/스크롤 끝, 취소/재열기, 인벤토리 갱신, 요청한 입력 장치를 포함한다. 거래·보상은 서버에서 현재 상태와 권한을 다시 검증한다.

모든 신규 도구는 `runtimeVerified: false`다. 브라우저 미리보기나 도구 통과를 인게임 동작으로 표현하지 않는다.
