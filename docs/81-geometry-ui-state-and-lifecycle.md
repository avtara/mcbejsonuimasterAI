# Geometry UI 상태와 수명

Attachable 또는 GeoUI의 **표시는 바뀌지만 값·재접속·다른 플레이어 관측이 틀릴 때** 읽는다. 프로젝트 복원 오류는 GeoUI project inspector, 모델 연결은 attachable inspector가 담당한다. 검토 기준: 2026-09-28, MicrosoftDocs `1dfc5c4fa1cd75cabe558b08adee3420264ff0b5`.

## 먼저 정할 세 가지

1. **대상 entity**: 장착 아이템, 플레이어, 별도 entity 중 어느 렌더 문맥에서 Molang을 평가하는가? 이름이 같은 `variable.*`라도 다른 문맥에 자동 공유된다고 가정하지 않는다.
2. **상태 소유자**: 서버의 실제 게임 상태, 현재 열린 UI 세션, 보는 사람별 표시 중 무엇인가?
3. **입력 소유자**: item use, 서버 폼 응답, 명령, 별도 커서 시스템 중 실제 이벤트를 발생시키는 경로는 무엇인가? geometry 사각형의 좌표만으로 클릭 이벤트가 생기지 않는다.

| 필요 | 선택할 경로 | 확인할 경계 |
| --- | --- | --- |
| 공개 장착 상태·진행도 | BP Entity Property → RP `q.property(...)` | 해당 entity 정의, 타입·범위, `client_sync`, 생산자 |
| 보는 사람별 표시 상태 | 지원 버전의 `Player.setPropertyOverrideForEntity` | viewer/target 구분, 기존 속성, 명시적 해제, 실제 renderer 적용 |
| 영구 퀘스트·권한·보상 | BP의 실제 게임 데이터 | 표시 override를 서버 판정에 사용하지 않음 |
| 일시적인 애니메이션 값 | 버전을 확인한 animation/`playAnimation` 경로 | 재생 종료, 재장착, 재로드 시 값 복원 |
| scoreboard를 GeoUI에 표시 | score 읽기 → 변환 → 선언된 속성 쓰기 | objective/참여자/기본값/배율/갱신주기 |

## Entity Property를 쓸 때

BP의 `description.properties`가 선언하고 `client_sync: true`인 속성을 RP가 읽는다. 일반 속성 값은 저장·로드를 거치므로, 임시 메뉴를 닫을 때는 앱이 직접 상태를 되돌려야 한다. 속성 이름 변경은 이전 값의 마이그레이션이 아니다. 타입 변경·범위 축소·enum 항목 삭제도 저장 값에 영향을 준다. 속성은 entity type당 32개이며 enum은 최대 16항목이다. 여러 팩의 기존 정의와 합산해 검토한다. [공식 속성 문서](https://learn.microsoft.com/en-us/minecraft/creator/documents/introductiontoentityproperties?view=minecraft-bedrock-stable)

다음은 **기존 정의에 병합할 필드**이다. `minecraft:player` 정의 전체를 이 조각으로 덮어쓰지 않는다.

```json
"properties": {
  "example:ui_scene": {
    "type": "int", "range": [-1, 3], "default": -1, "client_sync": true
  }
}
```

소비자는 필요하면 `q.has_property('example:ui_scene')`를 먼저 확인한다. 미선언 속성을 0으로 대체해 UI가 열리게 만드는 기본값은 피한다. `setProperty`를 호출한 tick 안의 `getProperty`는 이전 값을 반환할 수 있다. 같은 tick의 버튼 처리에는 서버가 검증한 새 값을 직접 사용하고, 다음 tick 이후 저장된 값을 별도로 확인한다. 동기화 완료나 화면 갱신을 한 tick 보장으로 표현하지 않는다. [공식 Entity API](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entity?view=minecraft-bedrock-stable)

## 보는 사람별 표시

`viewer.setPropertyOverrideForEntity(target, key, value)`는 해당 viewer가 보는 client-synced 속성에 적용되고 다음 tick부터 반영된다. 서버의 권한·보상 상태를 바꾸는 API로 사용하지 않는다. 타입·범위·entity 유효성을 검사한다. 종료 시 앱이 소유한 key만 `removePropertyOverrideForEntity`로 해제한다. `clearPropertyOverridesForEntity`는 그 target의 모든 override를 제거하므로 다른 기능과 공유하면 범위가 너무 넓다. [공식 Player API](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/player?view=minecraft-bedrock-stable)

아래는 선언과 유효한 객체가 준비된 후의 호출 형태이다. 자동 구독·설치되는 스크립트가 아니다.

```js
// Open: target may be viewer only when the actual renderer uses that entity.
viewer.setPropertyOverrideForEntity(target, "example:ui_scene", 2);
// Close while target is valid: release only the property owned by this UI.
viewer.removePropertyOverrideForEntity(target, "example:ui_scene");
```

이 API 세 개는 `@minecraft/server` **1.19.0** 변경 이력에 추가되어 있다. 현재 stable 문서에 이름이 있다는 이유로 모든 구버전 manifest에 사용할 수 있다고 판단하지 않는다. 대상 클라이언트가 제공하는 module version과 선언 파일을 확인한다. [고정된 변경 이력](https://github.com/MicrosoftDocs/minecraft-creator/blob/1dfc5c4fa1cd75cabe558b08adee3420264ff0b5/creator/ScriptAPI/minecraft/server/changelog.md#1190)

**아직 실행 검증이 필요한 추론:** self-target override가 특정 `live_player_renderer`에 원하는 방식으로 반영되는지는 그 renderer의 entity 문맥에서 확인해야 한다. 이는 GeouiStudio 생성기가 현재 사용한다는 뜻이 아니다. 기존 생성기의 일반 `setProperty` 경로를 승인 없이 이 방식으로 바꾸지 않는다.

## 닫기·재접속·비동기 응답

다음은 이 저장소의 통합 설계 권고이다. 서버 스크립트는 플레이어별 데이터를 관리하고 입장·리스폰·퇴장 이벤트를 구분할 수 있다. [공식 멀티플레이 스크립트 가이드](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/multiplayer-scripts?view=minecraft-bedrock-stable)

| 상황 | 구현할 정리 | 실패 재현 |
| --- | --- | --- |
| A를 열고 곧바로 B를 엶 | player ID별 세션 revision 증가; 응답 시 revision 확인 | 늦은 A 응답이 B 장면을 바꾸지 않음 |
| 취소·아이템 교체·화면 종료 | 앱 소유 표시 상태 해제; 진행 중 callback 무효화 | 빠르게 열고 닫아도 잔상·재개방 없음 |
| 사망·리스폰 | 새 entity 유효성을 확인하고 종료/복원 정책 적용 | 이전 세션이 새 플레이어 상태에 쓰지 않음 |
| 퇴장·재접속 | 메모리 세션 제거; 새 spawn에서 명시적 초기화 | 저장된 게임 진행과 임시 UI 상태를 혼동하지 않음 |
| 팩/스크립트 재로드 | 진행 데이터에서 표시 값을 다시 계산 | 임시 JS Map이나 animation 변수만으로 복원을 기대하지 않음 |
| 외부 이벤트·잘못된 값 | 서버에서 발신자·권한·범위 검증 후 표시 | 값 clamp만으로 무단 행동이 승인되지 않음 |

`q.is_in_ui`는 UI에서 렌더된다는 조건이다. GeoUI만의 화면 ID가 아니므로 인벤토리·paper doll에 같은 레이어가 나타나는지 확인한다. `q.is_first_person`도 렌더 문맥의 시점 조건이며 attachable의 `context.is_first_person`과 무조건 치환하지 않는다. [공식 UI 문맥](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/molangreference/examples/molangconcepts/queryfunctions/query_is_in_ui?view=minecraft-bedrock-stable), [공식 시점 문맥](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/molangreference/examples/molangconcepts/queryfunctions/query_is_first_person?view=minecraft-bedrock-stable)

## 실제 수용 검증

두 클라이언트 A/B로 같은 target을 관측한다. A만 UI를 열고 장면 전환·닫기·재접속을 수행한다. A의 HUD/인벤토리와 B의 월드/인벤토리에서 의도한 표시 범위를 각각 기록한다. 서버 상태는 표시 상태와 별도로 읽어 검증한다. 터치·마우스·게임패드 입력은 실제 지원하는 경로마다 확인한다. 문서·정적 그래프·스크립트 mock 성공은 이 기록을 대신하지 않는다.
