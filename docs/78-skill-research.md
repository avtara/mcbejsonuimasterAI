# 스킬·픽셀 제작·게임 UI 연구 참조

이 참조는 필요한 주제 하나를 읽고 구현·평가 기준을 정하는 데 사용한다. 새로운 연구를 기본 문맥에 자동 추가하지 않는다. 논문이나 공급자의 성능 수치는 이 저장소의 개선율이 아니다.

## 조회

```powershell
node tools/research-context.mjs topics --json
node tools/research-context.mjs context --topic context-selection --json
node tools/research-context.mjs context --topic game-ui-input --max-chars 5000 --json
```

| 주제 ID | 사용할 때 |
| --- | --- |
| `skill-evaluation` | 스킬 수정 전후의 과제 성공·실패·비용을 비교한다. |
| `context-selection` | 필요한 참조를 선택하고 문맥·검색 비용을 측정한다. |
| `pixel-craft` | 실루엣·색 덩어리·계단선·banding을 검토한다. |
| `asset-export` | 편집 원본과 PNG·atlas 출력의 계약을 정한다. |
| `game-ui-input` | 긴 한글·확대 글자·초점·모달을 검토한다. |

출력은 `--json` 유무와 관계없이 compact JSON이다. `topics`는 ID·이름·사용 조건만 반환한다. `context`는 한 주제의 규칙·검사·한계와 그 규칙이 참조한 출처만 반환한다. 기존 `design-library`의 스타일·방법·체스트 카드와 별개이며 서로 자동 로드하지 않는다. 색상·geometry·프로토콜·팩 생성 도구를 대체하지 않는다.

- 기본 한도는 최종 줄바꿈을 포함한 **5,000자**다. `context --max-chars`는 1,000~16,000의 십진 정수를 받는다.
- 근거·라이선스 범위·한계를 잘라내지 않는다. 한도보다 크면 stdout을 비우고 명시적으로 실패한다.
- 종료 코드: `0` 성공, `64` 인자·주제·문맥 예산 오류, `1` 로컬 데이터 읽기·형식 오류. 실패 진단은 stderr 1,000자 이하다.
- 네트워크·설치·외부 코드 실행·파일 쓰기는 없다. 현재 작업 폴더와 관계없이 도구와 함께 있는 데이터 파일을 읽는다.
- 저장소 도구가 없는 설치형 스킬에서는 연결된 필요한 참조만 직접 읽는다. 이 CLI가 없는 환경에서 자동 설치나 긴 원문 일괄 로드로 대체하지 않는다.

## 근거와 적용 범위

2026-09-28에 실제 본문을 읽은 1차 자료 8개다. 기존 디자인 소스 목록과 동일 URL을 추가하지 않았다. 공개 카탈로그는 직접 작성한 요약과 메타데이터만 보관한다.

| 출처 | 확인한 범위 | 그대로 옮길 수 없는 결론 |
| --- | --- | --- |
| [SkillsBench v1](https://arxiv.org/html/2602.12670v1), DOI `10.48550/arXiv.2602.12670` | §2.4, §3.3–3.5, §4.1.4, §4.2, §5.1. 스킬 유무·제작 방식 대조 및 반복 시행. | v1의 84/86 과제 표기와 요약·그림 수치가 일치하지 않는다. 길이·스킬 수 그룹은 보편적인 최적값을 입증하지 않는다. |
| [AgentSkillOS v1](https://arxiv.org/html/2603.02176v1), DOI `10.48550/arXiv.2603.02176` | §3.2, §4.1, Table 1. 30개 과제, 검색·실행 구분, 순서를 바꾼 A/B 모델 심사. | 생태계 안에서 정규화한 100점은 성공률 100%가 아니다. 모델 심사와 축소된 스크린샷은 픽셀 문제를 놓칠 수 있다. |
| [Lost in the Middle v3](https://arxiv.org/html/2307.03172v3), DOI `10.48550/arXiv.2307.03172` | §2–4, Appendix D. 정보 위치·문맥 길이를 바꾼 QA와 key-value 실험. | 이전 세대 모델 결과를 현재 Codex에 적용하려면 재측정해야 한다. 무조건 짧게 만드는 근거가 아니다. |
| [Anthropic advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use) | 2025-11-24 게시글의 tool search와 programmatic tool calling 절. | 공급자 내부 결과다. 작은 도구 목록에서는 조회 비용이 더 클 수 있고 Claude API 지원을 Codex 지원으로 추정할 수 없다. |
| [OpenAI skill-creator](https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431/skills/.system/skill-creator) | 고정 커밋의 `SKILL.md` 86–139행, `quick_validate.py` 15–91행, `LICENSE.txt`를 텍스트로 읽었다. | frontmatter 검사는 스킬 선택·산출물·실제 런타임 평가가 아니다. 소스 실행·설치·복제는 하지 않았다. |
| [Saint11 cluster](https://saint11.art/pixel_art_articles/article2/), [AA/banding](https://saint11.art/pixel_art_articles/article5/), [color](https://saint11.art/pixel_art_articles/article6/) | 원저자의 2021년 본문 설명. 큰 형태에서 세부로, 의도에 따른 픽셀·색 판단. | 고립 픽셀과 AA를 모두 실패로 판정하지 않는다. 작화 조언은 문자 대비 기준을 대체하지 않는다. |
| [Aseprite CLI](https://www.aseprite.org/docs/cli/), [files](https://www.aseprite.org/docs/files/), [FAQ](https://www.aseprite.org/faq/) | sheet·JSON export, 옵션 순서, 편집 원본에 보존되는 정보와 라이선스 구분. | 편집기를 설치·실행하지 않았다. Aseprite JSON을 Bedrock 전용 메타데이터로 간주하지 않는다. |
| [Xbox XAG 101](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/101), [112](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/112), [113](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/113) | 글자 표시·확대, 디지털 탐색, 가시적 초점과 모달 범위. | 물리 표시 픽셀은 JSON UI 논리 단위가 아니다. 지침 적용은 인증이나 실제 장치 검증이 아니다. |

출처 관찰은 `sources[].evidence`, 여기서 작성한 적용 규칙은 `topics[].rules`에 분리한다. 출력의 `decisionStatus`는 `authored-proposal`이고 `runtimeVerified` 및 `performanceImprovementMeasured`는 `false`다.

### 버전과 라이선스

- 논문은 arXiv 버전을 URL·DOI와 함께 맞춘다. SkillsBench와 AgentSkillOS의 논문 라이선스는 CC-BY-4.0이다. Lost in the Middle의 arXiv 배포 허가는 일반적인 재사용 허가로 해석하지 않는다.
- OpenAI skill-creator는 위 고정 커밋의 해당 폴더 라이선스 Apache-2.0을 확인했다. 이 카탈로그가 소스 재배포를 허가하는 것은 아니다.
- 웹 문서는 접근일을 기록한다. Xbox 페이지가 보고한 Git SHA도 별도로 남기지만 접근 URL 자체를 immutable URL이라고 하지 않는다.
- `observedSha256`은 접근한 응답의 식별자이며 매 조회 때 원격 해시를 재검증하지 않는다. 로컬 검증은 메타데이터의 형태·참조·버전 일관성만 검사한다.
- Saint11의 별도 GitHub 튜토리얼 저장소 라이선스를 2021년 블로그 본문에 적용하지 않는다. 명시적 재사용 범위를 확인하지 못한 글과 이미지에는 `NOASSERTION` 및 reference-only 경계를 둔다. 원문 그림·게임 스크린샷·바이너리는 포함하지 않는다.

## 다음 구현의 평가 설계

목표는 **필수 기능·출처·권한 경계를 지키는 결과를 늘리면서 과제당 문맥과 지연을 줄이는 설정**을 찾는 것이다. 최고 성능이나 자동 학습 완료를 주장하지 않는다.

현재 구현은 결정적 선택·형식·예산 계약을 검사했다. 아래 모델 행동 비교는 **제안이며 실행하지 않았다**.

1. A: 평가 시작 시 현재 저장소 커밋의 라우팅과 도구. B: 동일 조건에서 필요한 연구 카드 하나를 추가한 구성. 모델 버전·추론 설정·도구·입력·시간 제한을 고정한다.
2. 과제별 A/B 순서를 균형 있게 배치하고 각 3회 시행한다. 아래 12종의 탐색 평가라면 총 72회다. 원격 호출 비용과 장치 실행은 별도로 계획한다.
3. 일부 과제는 B와 실제 토큰 길이가 같은 검색 원문·무관 참조 C와도 비교한다. top-k 1/2/3과 근거 위치 앞·중간·끝은 별도 대조 조건으로 둔다.
4. 개발에 사용하지 않은 파일명·문구·순서·스타일·장치 변형을 보류한다. 개발 중 본 사례를 보류 세트라고 하지 않는다.

| 과제 | 판정할 결과 |
| --- | --- |
| 실제 아이템을 옮기는 27칸 체스트 | native-container 선택, ActionForm selection 혼용 없음 |
| 페이지형 상점 응답 | selection 0 정상, cancel·placeholder·stale 작업 거부 |
| Minato 탭·문자열 index | 정확한 위치 진단, 원본 해시 보존 |
| 비슷한 요구 이름·오타 | 잘못된 도구 실행 없이 명확한 실패 또는 unresolved |
| HUD actionbar 바인딩 | 불필요한 체스트·픽셀 연구 참조 자동 로드 없음 |
| Cozy16 긴 한글 인벤토리·구매 | 필요한 스타일·입력 근거만 선택, 문맥 예산 유지 |
| 버튼 4상태 | PNG 크기·알파·상태 수, 실루엣·정렬 유지 |
| 의도된 별빛과 픽셀 노이즈 | 일괄 삭제 대신 위치·이유·표현 의도 설명 |
| nine-slice 패널 확대 | corner와 stretch 영역, same-stem 메타데이터 일치 |
| sprite atlas | 프레임 순서·기간·alpha·trim·rotation 명세 유지 |
| 긴 한글과 모달 구매 확인 | 필수 정보 유지, 초점 가시성·범위·취소·복귀 |
| 불명확한 에셋 라이선스 | 분석과 재배포 구분, revision 유지, 자동 복사 없음 |

과제 성공률만 집계하지 않는다. 과제별 실패·중요 불변조건·거짓 런타임 주장·선택 정확도·도구 재시도·문맥 문자 수·실제 토큰·지연 중앙값과 p95를 함께 기록한다. 입력·출력·cached tokens를 구분하고 문자 수를 고정 배율로 토큰으로 환산하지 않는다.

시각 비교는 A/B 순서를 바꿔 보고 원본 크기와 정수 배율 이미지를 유지한다. 불일치는 무승부로 남기고 중요한 픽셀·초점 문제는 사람이 확인한다. 실제 요청 장치로 실행하지 않은 입력 검사는 런타임 미검증이다.

채택 조건은 중요 기존 사례의 새 실패가 없고, 출처·원본 보존·문맥 예산을 지키며, 보류 사례에서도 확인되는 것이다. 평균만 개선되고 특정 transport나 장치가 퇴행하면 별도 문제로 보고한다. 작은 표본은 탐색 결과이며 불확실성을 함께 제시한다.

## 유지보수

`data/agent-design-research.json`이 선택 카탈로그의 원본이다. 새 자료는 1차 출처 본문·버전·라이선스 범위·한계를 확인한 뒤 추가한다. 기존 source와 rule 참조 일관성, 변경된 카드의 5,000자 기본 예산을 검사한다.

```powershell
node tests/research-context.mjs
```

이 테스트는 frozen input, 정확한 선택 출처, provenance/version/DOI 불일치, 중복·알 수 없는 항목, 한도 경계, 독립 작업 폴더 실행, 긴 오류 인자를 확인한다. 연구 효과·이미지 제작 품질·Bedrock 런타임을 검증하지 않는다.
