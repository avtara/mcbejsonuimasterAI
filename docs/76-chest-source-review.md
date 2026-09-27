# Chest GUI 소스 검토 — 2026-09-27

## 출처와 사용 범위

| 자료 | 고정 리비전 | 채택 범위 |
| --- | --- | --- |
| [Minato Chest UI Editor](https://github.com/Minato-mba/web-apps/tree/dcc7932fceea828131053fb067e1f91503e36b21/chest-ui-editor) | `dcc7932fceea828131053fb067e1f91503e36b21` | 실제 chest 편집·왕복·슬롯/탭 검사. 검토한 루트/하위 폴더에 라이선스 없음: 분석 전용 |
| [Herobrine Chest-UI](https://github.com/Herobrine643928/Chest-UI/tree/115d95c8239a0ee2f578a9a7710699a8f6627f26) | `115d95c8239a0ee2f578a9a7710699a8f6627f26` | 기존 CC-BY-4.0 스냅샷 재사용. 고정 버튼 배열·아이템 상태 프로토콜 |
| [IsLocal Chest-GUI](https://github.com/IsLocal/Chest-GUI/tree/daa618405f49207c2b47630bd171d50f85ca5f0b) | `daa618405f49207c2b47630bd171d50f85ca5f0b` | 2023 beta API의 실제 컨테이너 방식 비교. 라이선스 미확인, 구현 채택 제외 |
| [Microsoft Creator docs](https://github.com/MicrosoftDocs/minecraft-creator/tree/1dfc5c4fa1cd75cabe558b08adee3420264ff0b5) | `1dfc5c4fa1cd75cabe558b08adee3420264ff0b5` | 공식 응답·취소·스케줄러 계약. 문서 CC-BY-4.0, 코드 예제 MIT |

새로 고정한 파일은 Minato 20개와 공식 문서/라이선스 7개다. 기존 Chest-UI/Chest-GUI 캐시를 재사용했다. `config/design-research-lock.json`에 파일 해시·바이트·리비전을 기록하고 원본은 무시되는 `workspace/design-library/upstreams`에만 보관한다. 공개 결과에는 직접 작성한 규칙·검사기·예제와 출처 메타데이터를 넣었다. 원본 JavaScript 실행이나 에셋/템플릿 재배포는 수행하지 않았다.

## 핵심 구분

Minato는 `container_items`와 컨테이너 이벤트를 사용하는 RP를 만든다. `preview.js:349–363`의 버튼은 실제 슬롯과 입력 이벤트를 연결하고, `862–898`은 `small_chest_screen`과 정확한 제목 조건을 생성한다. ActionForm 버튼 목록 생성기가 아니다.

진행바/토글의 브라우저 value/active와 RP 데이터 경로도 다르다. RP는 아이템 `#hover_text`에서 접두 부분을 제거한 값을 읽는다. 이 자료의 6문자 규약을 새 프로젝트의 표준으로 복사하지 않는다.

## 원본에서 확인한 결함과 보강

아래는 고정 코드의 정적 증거다. 브라우저/Bedrock에서 사용자 동작 전체를 재현했다는 뜻은 아니다.

| 문제 | 코드 근거 | 보강 방향 |
| --- | --- | --- |
| 숫자 입력이 문자열로 남아 다음 슬롯이 `5 → 51`로 계산됨 | `properties.js:186–219`, `components.js:917–952` | 정수·실제 capacity 검사 |
| 탭 복제 시 새 ID와 자식 부모 참조가 분리됨 | `editor.js:1305–1360` | 전체 ID 매핑, 고아·순환 검사 |
| ZIP 이미지 복원 키 변경으로 기존 참조가 깨짐 | 실제 로드되는 `components.js` imageManager와 `export.js` import | 안정된 키와 왕복 참조 대조 |
| 비활성 UI의 업로드 이미지가 ZIP 수집에서 누락 가능 | `export.js`, `preview.js`의 active/all UI 분기 | 모든 화면/settings에서 의존성 수집 |
| 업로드 JPEG 바이트를 PNG 이름으로 내보낼 수 있음 | `components.js`, `export.js` | 바이트 형식·확장자·alpha 별도 검사 |
| 얕은 검사 후 기존 상태 삭제; fallback 로더의 크기/속성 유실 | `project-format.js:65–156`, `components.js:931–955` | 적용 전 전체 형태 검사·원본 보존 |
| UI 전환과 undo 이력의 소유자가 분리되지 않음 | `app.js`, `editor.js` 전환/history | 화면별 이력 또는 전체 프로젝트 스냅샷 |
| 복수 최상위 label이 같은 출력 이름을 사용함 | `preview.js` label 생성 | 출력 이름 충돌 검사 |
| 누락 텍스처를 placeholder로 바꾸고 내보내기 계속 | `export.js` texture fallback | 누락 진단·최종 의존성 검사 |

검사기는 저장 JSON에서 증명할 수 있는 부분만 검사한다. JPEG 바이트, ZIP 내부 파일, undo 이력과 실제 RP 출력은 별도 확인 항목이다. 사용되지 않는 `scripts/imageManager.js`의 기능을 실제 페이지 기능으로 판단하지 않는다.

## 다른 소스에서 확인한 경계

- Herobrine BP 기본은 27칸이지만 검토한 RP 설정은 27칸 경로가 비활성화되어 있다. 표식·enabled route·grid·버튼 배열·fallback을 함께 확인한다.
- ActionForm의 빈 버튼을 생략하면 응답 순서가 달라진다. 인벤토리 부록이 빈 슬롯을 압축하면 원본 inventory index를 별도 보존한다.
- 텍스처 경로와 숫자 AUX는 다른 렌더링 경로다. ID 표와 플래그를 다른 클라이언트 버전에 무검증 이식하지 않는다.
- IsLocal은 역사적 비교 자료다. 오래된 beta API, 넓은 clear/kill 처리와 닫힌 이후 실행 흐름 때문에 새 구현 템플릿으로 채택하지 않았다.
- 공식 `selection`은 optional이고 취소에는 `UserBusy`/`UserClosed`가 있다. 재시도 제한·페이지 스냅샷·거래 재검증은 앱 정책이다. [ActionFormResponse](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-ui/actionformresponse?view=minecraft-bedrock-stable), [취소 이유](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-ui/formcancelationreason?view=minecraft-bedrock-stable).

## 확인 수준

공개 배포 페이지의 v2.0.0 화면과 Dynamic Grid의 Preview Only 구분은 브라우저에서 확인했다. 저장 동작 후 제어가 타임아웃되어 저장/불러오기 왕복과 위 결함의 UI 재현은 완료하지 못했다. Bedrock 런타임은 실행하지 않았다.

[Chest GUI 도구](75-chest-gui.md)는 이 분석을 반영한 독립 구현이다. 원본 편집기를 수정한 포크는 아니다.
