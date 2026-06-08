# Handoff

## Latest Worker

Codex

---

## 협업 구조

| 역할 | 담당 |
|---|---|
| 추출 프롬프트, UX 흐름 설계, 리포트 문구, AI 관련 기능 제안 | **Claude Code** |
| 스키마 구현, 검증 로직, UI 상태 일관성, 테스트, 안정적 구현 | **Codex** |

작업 전 반드시 이 파일을 읽고, 작업 후 반드시 이 파일을 업데이트할 것.
data-schema.md의 핵심 필드를 변경할 경우 data-schema.md도 함께 업데이트.

---

## 현재 앱 기능 요약 (localhost:3002)

**현재 작동하는 기능 (Claude Code 누적 작업):**

- **채팅 → 공간 프로그램 추출**: 좌측 채팅창에 요강 텍스트 입력 → Claude API가 실 목록 JSON 추출 → 캔버스에 자동 배치
- **PDF 지침서 파싱**: 설계공모 지침서 PDF 업로드 → Claude API가 실 목록 + 층별 구성 추출 → 층별뷰로 자동 전환
- **SVG 캔버스 + 드래그**: 920×620 SVG, 방을 면적 비례 사각형으로 표현, 8px 스냅 드래그
- **D3 force simulation 최적화**: 인접 관계를 링크 포스로 구현, 실들이 요건에 맞게 자동 정렬
- **Pin 모드**: 시뮬레이션 중 특정 방 고정 (D3 fx/fy)
- **연결 모드**: 방 간 required/preferred 인접 관계 설정, 만족도 점수 계산
- **층별뷰 (2×2)**: B1/1F/2F/3F 사분면 뷰, 각 층 독립 force simulation
- **코어 동기화**: core/circulation zone 중 이름이 같은 방은 층 경계를 넘어 같은 상대 위치로 수렴
- **Zone 그룹 시각화**: 공용/전용/서비스/동선/코어 영역별 배경 표시
- **검증 사이드바**: 필수 인접 미충족, 면적 불일치 등 ValidationIssue 상위 3개 표시
- **CSV / JSON 내보내기**: 실 CSV, 인접 매트릭스 CSV, 전체 플랜 JSON 다운로드

---

## 현재 파일 상태 (git 미커밋, 전체 작동 확인됨)

### 핵심 타입 및 유틸

| 파일 | 내용 |
|---|---|
| `lib/floorPlanTypes.ts` | Room, Connection, SpaceProgram, ZoneType, FloorType, FLOOR_INFO, FLOORS |
| `lib/floorPlanUtils.ts` | CANVAS_W/H, QUAD_W/H, FLOOR_QUADS, layoutByFloor, autoLayout, calcSatisfactionScore |
| `lib/csvParser.ts` | parseRoomCSV, parsedRoomsToLayout, parseMatrixCSV |
| `lib/programValidation.ts` | validateSpaceProgram, validateLayoutIssues, ValidationIssue, ValidationResult |
| `lib/guidelineExtractionPrompt.ts` | GUIDELINE_EXTRACTION_PROMPT (GuidelineItem + Room + Relation 추출용) + TypeScript 타입 정의 |

### 컴포넌트

| 파일 | 내용 |
|---|---|
| `components/FloorPlanCanvas.tsx` | 메인 SVG 캔버스, 모든 인터랙션 (select/connect/pin/delete 모드) |
| `components/SpaceChatPanel.tsx` | 좌측 채팅 사이드바, 검증 이슈 패널 |
| `components/AdjacencyMatrix.tsx` | 인접 매트릭스 테이블 뷰 |
| `components/BuildingRenderer.ts` | (미사용 변수 경고 있음) |

### hooks

| 파일 | 내용 |
|---|---|
| `hooks/useForceSimulation.ts` | D3 simulation 커스텀 훅. run(rooms, connections, shake, pinnedIds, multiFloor) |

### API 라우트

| 파일 | 내용 |
|---|---|
| `app/api/chat/route.ts` | 채팅 → 공간 프로그램 추출 (claude-sonnet-4-6) |
| `app/api/parse-pdf/route.ts` | PDF → 실 목록 추출 (구 EXTRACT_PROMPT 사용 중, 교체 예정) |
| `app/api/analyze/` | (내용 미확인) |
| `app/api/floorplan/` | (내용 미확인) |

---

## Latest Claude Code Changes (이번 세션)

### 추가

**`hooks/useForceSimulation.ts` — 다중 층 최적화 + 코어 동기화**
- `run()` 파라미터에 `multiFloor: boolean` 추가
- 층별 모드: 각 room의 floor에 따라 FLOOR_QUADS 사분면 내 bounds force 적용
- 코어 동기화 포스: core/circulation zone 중 이름이 같은 방 쌍을 자동 탐지, 사분면 내 상대 위치(0~1) 일치시키는 force 추가
- 층별 흔들기: shake 시 각 방이 자신의 사분면 내에서만 랜덤 배치

**`components/FloorPlanCanvas.tsx` — 층별뷰 최적화 UI**
- `useMemo`로 `syncPairs` 계산 (core/circulation 동명 방 쌍)
- 층별뷰에서도 `▶ 층별 최적화`, `🔀 층내 흔들기` 버튼 노출
- `sim.run(..., multiFloor)` 호출
- SVG에 보라색 점선(stroke #6366f1, opacity 0.28)으로 동기화 쌍 시각화
- 상태바에 `🔗 코어 N쌍 동기화 연동` 표시

**`lib/guidelineExtractionPrompt.ts` — 신규 추출 프롬프트**
- `GUIDELINE_EXTRACTION_PROMPT`: 지침서 → GuidelineItem + Room + Relation 3종 JSON
- 추출 원칙: source.quote 필수, 불확실값 "검토 필요" 명시, confidence 0.0~1.0, status "ai_suggested" 고정
- GuidelineItem 11개 카테고리, Relation 5가지 타입(required/preferred/separated/forbidden/none) 정의
- data-schema.md 전체 타입을 TypeScript로 구현

**`docs/handoff.md`** — 이 파일 전면 재작성

### Schema Changed

No

---

## Known Issues

### 린트 경고

```
components/BuildingRenderer.ts
  - 미사용 변수 경고
```

### 스키마 갭

`Connection` 타입은 이제 Relation 스키마의 핵심 필드를 구현함:
- 구현됨: `reason`, `source: SourceReference[]`, `status`, `weight`
- 구현됨 타입: `required`, `preferred`, `separated`, `forbidden`

남은 갭:
- `GuidelineItem` 검토/확정 UI 미구현
- PDF 파싱 결과의 `relations[]`를 캔버스 `Connection[]`으로 직접 연결하는 흐름 미구현

### API 연동 미완 (Codex 담당)

- `/api/parse-pdf/route.ts`가 아직 구 `EXTRACT_PROMPT` 사용 중
- 새 `GUIDELINE_EXTRACTION_PROMPT`로 교체 시 응답 파싱 로직도 변경 필요:
  - 현재: `{ rooms[], floorComposition, projectName, totalArea }`
  - 목표: `{ guidelineItems[], rooms[], relations[], documentName, totalArea }`
- `FloorPlanCanvas.tsx`의 `handlePDFUpload`도 새 포맷에 맞게 업데이트 필요

---

## Next Work For Codex

우선순위 순:

### 1. /api/parse-pdf 라우트를 새 프롬프트로 교체

`lib/guidelineExtractionPrompt.ts`의 `GUIDELINE_EXTRACTION_PROMPT`를 import하여
기존 `EXTRACT_PROMPT`를 대체. 응답 파싱 로직을 3종 JSON에 맞게 업데이트.

### 2. 전체 검증 패널 (drawer 또는 전용 뷰)

현재 사이드바에 상위 3개만 표시 중. 전체 ValidationIssue 목록을 볼 수 있는
패널/드로어 추가. `lib/programValidation.ts`의 `validateSpaceProgram` 결과 활용.

### 3. 남은 린트 경고 정리

`components/BuildingRenderer.ts` 미사용 변수 제거.

---

## Latest Codex Changes (codex/relation-schema)

### 추가/변경

**`lib/floorPlanTypes.ts` — Connection 스키마 확장**
- `ItemStatus` 추가
- `SourceReference` 추가
- `RelationType` 추가: `required | preferred | separated | forbidden`
- `Connection`에 `weight`, `reason`, `source`, `status` 필드 추가

**`lib/floorPlanUtils.ts` — 관계 유틸 확장**
- UI-only `none` 상태 포함 Relation cycle 정의
- `RELATION_LABELS` 추가
- `relationWeight()` 추가
- `setRelation()`이 weight/status를 함께 저장
- `calcSatisfactionScore()`가 분리/금지 관계는 “인접하지 않음”을 만족으로 계산
- `programToText()`가 relation reason을 분석 컨텍스트에 포함

**`components/AdjacencyMatrix.tsx`**
- 관계 매트릭스에 `분리`, `금지` 상태 추가
- 클릭 순서: 없음 → 권장 → 필수 → 분리 → 금지

**`components/FloorPlanCanvas.tsx`**
- 연결선 클릭도 동일한 관계 cycle 사용
- `separated`, `forbidden` 시각화 색상/라벨 추가
- 금지 인접 미충족 시 경고 라벨 표시
- PDF/CSV 생성 관계에 status 부여

**`hooks/useForceSimulation.ts`**
- `separated`, `forbidden` 관계는 D3 link attraction에서 제외
- 기존 lint 오류였던 ref render access와 `any` link callbacks 수정

**`lib/programValidation.ts`**
- `forbidden` 관계가 실제 인접할 경우 `forbidden_adjacency_detected` 이슈 생성

### Schema Changed

Yes. `docs/data-schema.md` updated.

### Verified

- `npx tsc --noEmit` passed.
- `npm run lint` passed with warnings only.

---

## Next Work For Claude Code

### 1. GuidelineItem 검토 패널 UX 설계

PDF 파싱 후 추출된 GuidelineItem 목록을 사용자가 검토·확정하는 UI 흐름.
- ai_suggested → user_confirmed 전환 인터랙션
- 검토 필요 항목 우선 표시
- source.quote 원문 표시

### 2. 레이아웃 검증 리포트 템플릿

다음 항목을 포함한 리포트 텍스트 형식 설계:
- 전체 만족도 점수
- 필수 인접 미충족 목록
- Zoning 충돌
- 동선 문제
- 수정 우선순위 제안

---

## Watch Out

- `git reset --hard` 등 파괴적 git 명령 금지.
- Claude Code 변경 파일 덮어쓰기 금지 (특히 `hooks/useForceSimulation.ts`, `lib/guidelineExtractionPrompt.ts`).
- `Room.id`는 안정적으로 유지. DWG/Revit/Rhino 연동을 위해 ID 재생성 금지.
- AI 추출값(`status: "ai_suggested"`)이 사용자 확정값(`user_confirmed`)을 덮어쓰지 않도록 주의.
- `lib/floorPlanTypes.ts` 변경 시 `docs/data-schema.md` 동기화 필수.
