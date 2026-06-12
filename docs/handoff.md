# Handoff

## Latest Worker

Codex (branch: codex/room-count-report-entry)

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

## 현재 파일 상태 (codex/guideline-data-flow 기준)

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
| `components/GuidelineReviewPanel.tsx` | PDF 지침서 추출 요건 검토/확정 패널 |
| `components/ValidationIssuesPanel.tsx` | 전체 검증 결과 drawer |
| `components/BuildingRenderer.ts` | 3D 건물 렌더링 유틸 |

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

### 린트 상태

`npm run lint` 통과.

### 스키마 갭

`Connection` 타입은 이제 Relation 스키마의 핵심 필드를 구현함:
- 구현됨: `reason`, `source: SourceReference[]`, `status`, `weight`
- 구현됨 타입: `required`, `preferred`, `separated`, `forbidden`

남은 갭:
- `GuidelineItem` 검토/확정 UI 미구현
- PDF 파싱 결과의 `relations[]`를 캔버스 `Connection[]`으로 직접 연결하는 흐름 미구현

### API 연동 상태

- `/api/parse-pdf/route.ts`는 `GUIDELINE_EXTRACTION_PROMPT` 사용 중
- 응답 파싱 목표 포맷: `{ guidelineItems[], rooms[], relations[], documentName, totalArea }`
- `FloorPlanCanvas.tsx`의 `handlePDFUpload`는 새 `relations[]` 포맷과 기존 `rooms[].adjacency` 포맷을 모두 지원
- 남은 작업: 추출된 `guidelineItems[]`를 사용자가 검토/확정하는 UI 연결

---

## Next Work For Codex

우선순위 순:

### 1. 타입 검사 캐시 정리

`.next/types/* 2.ts` 중복 생성 캐시 때문에 `npx tsc --noEmit`가 소스와 무관하게 실패함.
Next 개발 서버 캐시를 정리한 뒤 타입 검사 재실행 필요.

### 2. GuidelineItem 확정값을 실제 데이터 흐름에 반영

현재 `GuidelineReviewPanel`은 사용자 검토/확정 UI까지 구현됨.
다음 단계는 확정된 guideline item이 `rooms[]`, `relations[]`, validation/report/export 흐름에 어떻게 반영되는지 명확히 연결하는 것.

### 3. PDF 추출 결과 저장/내보내기 보강

현재 전체 플랜 JSON 내보내기에 지침서 추출 원문, 확정 상태, source quote가 충분히 포함되는지 확인하고,
DWG/Revit/Rhino 전 기본 셋팅 데이터로 재사용 가능한 형태로 보강.

---

## Latest Codex Changes (codex/validation-panel lint cleanup)

### 변경

**`components/BuildingRenderer.ts`**
- 사용하지 않는 `floorY` 파라미터 제거
- 사용하지 않는 `gap` 변수 제거

**`components/GuidelineReviewPanel.tsx`**
- side-effect 삼항식을 명시적인 `if/else`로 변경
- 카테고리 토글 로직도 명시적인 `if/else`로 변경

### Schema Changed

No.

### Verified

- `npm run lint` passed with no warnings.

---

## Latest Codex Changes (codex/validation-panel)

### 추가/변경

**`components/ValidationIssuesPanel.tsx` — 신규**
- 전체 `ValidationIssue` 목록을 볼 수 있는 우측 drawer
- 오류/주의/정보 카운트 요약
- 이슈 타입별 뱃지: 면적, 실 개수, 필수 인접, 금지 인접, 데이터
- 관련 실과 관련 관계 이름 표시
- 각 이슈별 수정 제안 표시

**`app/page.tsx`**
- `showValidationPanel` 상태 추가
- `ValidationIssuesPanel` 연결
- `SpaceChatPanel`에서 전체 검증 패널을 열 수 있도록 callback 전달

**`components/SpaceChatPanel.tsx`**
- 기존 검증 요약 카드의 우측 액션을 `전체 보기` 버튼으로 변경
- 버튼 클릭 시 전체 검증 drawer 오픈

### Schema Changed

No.

### Verified

- `npm run lint` passed with no warnings.
- Browser check on `http://localhost:3002/` passed.
- Sample input produced validation issues and `전체 보기` opened the full drawer.
- No browser console errors.
- `npx tsc --noEmit` remains blocked by duplicate generated `.next/types/* 2.ts` cache files, not source errors.

---

## Latest Codex Changes (codex/parse-pdf-guideline)

### 추가/변경

**`app/api/parse-pdf/route.ts`**
- 기존 긴 `EXTRACT_PROMPT` 제거
- `GUIDELINE_EXTRACTION_PROMPT` import 적용
- 코드블록/일반 JSON 응답 모두 파싱하는 `extractJsonObject()` 추가
- 누락 필드를 기본값으로 정리하는 `normalizeExtractionOutput()` 추가
- API 응답이 `guidelineItems`, `rooms`, `relations`, `documentName`, `totalArea`를 포함하도록 정규화

**`components/FloorPlanCanvas.tsx`**
- 현재 브랜치 기준 이미 새 `relations[]` 포맷과 기존 `rooms[].adjacency` fallback을 모두 지원
- 이번 Codex 커밋에서는 라우트 응답을 해당 프론트 포맷에 맞춰 정규화

### Schema Changed

No. Existing Relation schema was used.

### Verified

- `npm run lint` passed with warnings only.
- Browser reload on `http://localhost:3002/` passed with no console errors.
- `npx tsc --noEmit` was blocked by duplicate generated `.next/types/* 2.ts` cache files, not source errors.

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

## Latest Claude Code Changes (claude/guideline-review-panel)

### 추가

**`components/GuidelineReviewPanel.tsx` — 신규**
- 카테고리별 그룹핑(11종), 검토 필요 amber 강조, 확정 진행 바
- source.quote 원문 인용 블록 (section, page 포함)
- confidence 바 시각화 (0~100%, 색상으로 신뢰도 표현)
- ai_suggested → user_confirmed 확정 인터랙션 (개별 / 전체)
- 전체 / 검토 필요 / 확정됨 탭 필터

**`components/FloorPlanCanvas.tsx` — 업데이트**
- `guidelineItems`, `confirmedGuidelineIds`, `showGuidelinePanel` 상태 추가
- PDF 업로드 시 `data.guidelineItems` 자동 저장 + 패널 자동 오픈
- `📋 요건 검토` 버튼 (미확정 개수 뱃지 표시)
- 캔버스 우측에 GuidelineReviewPanel 슬라이드인

### Schema Changed

No

### Branch

`claude/guideline-review-panel` — main에 병합 완료

---

## Latest Claude Code Changes (claude/report-template)

### 추가/변경

**`lib/reportGenerator.ts` — 신규**
- `generateLayoutReport(rooms, connections, issues, satisfactionScore, projectName?)` 함수
- 출력: `LayoutReport` 타입 — grade(A/B/C/D), executiveSummary, sections[], priorityActions[], plainText
- 섹션 4종: "전체 배치 현황", "필수 인접 관계", "분리·금지 관계", "면적·수량 검증"
- 수정 우선순위: 금지 위반(1순위) → 필수 인접 미충족(2순위) → 면적 오류(3순위)
- `plainText`: 클립보드 복사용 전체 텍스트, 한국어 문장형 요약 포함

**`components/ValidationReportPanel.tsx` — 신규**
- 우측 drawer 형식 문서형 리포트 뷰어
- 등급 배지(A~D), 만족도 % 바, 종합 평가 요약문 표시
- 섹션별 펼침/접힘 (이슈 있는 섹션은 기본 펼침)
- 수정 우선순위 번호 목록
- "리포트 텍스트 복사" 버튼 (클립보드)

**`app/page.tsx` — 업데이트**
- `showReportPanel` 상태, `projectName` 상태 추가
- `layoutReport` useMemo 계산 (rooms/connections/issues 변경 시 자동 갱신)
- 하단 액션 바: "리포트 [A/B/C/D]" 버튼 (등급 뱃지 포함) + 매트릭스 토글을 같은 행에 배치
- `ValidationReportPanel` 마운트

**`components/GuidelineReviewPanel.tsx` — UX 문구 개선**
- 헤더 부제목: "AI 추출 요건을 확인하고 확정하세요"
- 신뢰도 바에 "신뢰도" 레이블 + title 속성 추가
- 확정 버튼 title 개선: "확정 취소 — 다시 검토 상태로 되돌립니다"
- 원문 인용 블록에 "지침서 원문" 레이블 추가
- 빈 상태 개선: 하위 설명 텍스트 추가 (탭별로 안내 문구 구체화)
- 하단 버튼에 "확정한 항목은 배치 검증 시 기준값으로 반영됩니다" 안내 추가

**`lib/guidelineExtractionPrompt.ts` — 프롬프트 보강**
- GuidelineItem: 복합 조건 분리 규칙 ("세미나실 3실 이상, 1실당 40m²" → 두 항목으로 분리)
- Room: 표 형식 면적 추출, "1실당 X㎡" 패턴, floor 모호 표현 처리 규칙 추가
- Relation: 인접 강도 판단 규칙 상세화 ("연접"→required, "동선 연계"→preferred 등)
- 법규 추출: 건축법 조항 직접 인용 처리, 친환경/외관 조건의 unknown 분류
- 제출물: 표 형식이면 통합 1항목, 개별 형식 조건만 분리

### Schema Changed

No. 신규 파일만 추가, 기존 타입 변경 없음.

### Branch

`claude/report-template` — PR 제출 예정

---

## Next Work For Codex

### 1. `room_count` 수정 입력 로직 보강

- 이번 Codex 작업에서 `room_count`의 "적용" 로직은 구현됨.
- 남은 작업: `GuidelineDiffPanel`의 "수정" 입력에서 개수 값을 넣었을 때도 동일한 room instance 증감 로직을 쓰도록 연결.

### 2. 리포트 진입점 UX 추가 검증

- SpaceChatPanel 검증 카드에 "리포트 보기" 버튼 연결 완료.
- 브라우저에서 장시간 AI 응답 대기 시 자동화가 timeout될 수 있어, 실제 사용자 조작으로 한 번 더 확인 권장.

---

## Latest Codex Changes (codex/room-count-report-entry)

### 사전 검증 및 병합

- `claude/diff-report-export` 브랜치(PR #1)를 검증하고 `main`에 fast-forward 병합.
- JSON import 시 `onGuidelineStateChange(importedGuidelineItems, restoredConfirmedIds)`가 호출되지 않던 문제 수정 후 병합.
- `handlePDFUpload`의 `useCallback` dependency에 `onGuidelineStateChange` 추가해 lint 경고 제거.

### 추가/변경

**`components/FloorPlanCanvas.tsx`**
- `handleDiffApply`에서 `room_count` diff 적용 로직 구현.
- `parsedValue > 현재 동일 이름 실 수`: 같은 name/zone/floor/source/status 기반 room instance 추가.
- `parsedValue < 현재 동일 이름 실 수`: 마지막 instance부터 제거.
- room_count 적용 후 `autoLayout` 또는 `layoutByFloor` 재실행.
- 제거된 room을 참조하는 connection과 pinned id 정리.

**`components/SpaceChatPanel.tsx`**
- `onOpenReportPanel?: () => void` prop 추가.
- 검증 요약 카드 우측에 "리포트 보기" 버튼 추가.
- 기존 "전체 보기" 버튼은 유지.

**`app/page.tsx`**
- `layoutReport`가 있을 때 `SpaceChatPanel`에 `onOpenReportPanel={() => setShowReportPanel(true)}` 연결.

### Schema Changed

No.

### Verified

- `npm run lint` passed with no warnings.
- `npx tsc --noEmit` passed.
- Test PDF was generated at `/private/tmp/talk-architect-test/guideline.pdf`.
- `POST /api/parse-pdf` with the test PDF returned guidelineItems/rooms/relations successfully.
- `GET http://127.0.0.1:3002/` returned HTTP 200.
- Browser file upload automation could not complete because Codex In-app Browser reports file uploads are not supported; actual manual PDF upload should be checked once in the UI.

---

## Latest Codex Changes (codex/guideline-data-flow)

### 추가/변경

**`lib/floorPlanTypes.ts`**
- `Room`에 `source?: SourceReference[]`, `status?: ItemStatus` 추가
- `docs/data-schema.md`의 Room 스키마와 구현 타입을 맞춤

**`components/FloorPlanCanvas.tsx`**
- GuidelineItem 확정/확정 취소 시 `guidelineItems[].status`를 함께 업데이트
- 확정된 GuidelineItem의 `appliesToRoomIds` 대상 room은 `status: "user_confirmed"`로 반영
- 확정된 GuidelineItem의 `appliesToRelationIds` 대상 connection은 `status: "user_confirmed"`로 반영
- PDF에서 추출된 room의 `source`, `status`를 보존
- 전체 플랜 JSON 내보내기에 `guidelineItems[]`, `confirmedGuidelineIds`, `pdfSummary` 포함
- JSON 불러오기(`📥 JSON`) 추가: rooms/connections, pinnedIds, multiFloor, GuidelineItem 확정 상태, PDF 요약 복원

**`components/GuidelineReviewPanel.tsx`**
- “목록 전체 확정”이 여러 항목을 한 번에 안정적으로 확정하도록 `onConfirmMany` 콜백 추가

**`components/BuildingRenderer.ts`, `lib/reportGenerator.ts`**
- 타입 검사/린트에서 발견된 소스 오류와 경고 정리

### Schema Changed

Yes. `Room` 구현 타입이 기존 `docs/data-schema.md`의 `status/source` 필드와 일치하도록 확장됨.

### Verified

- `npm run lint` passed with no warnings.
- `npx tsc --noEmit` passed after moving duplicate generated `.next/types/cache-life.d 2.ts` cache file to `/private/tmp/talk-architect-next-types-backup/`.
- Browser check on `http://localhost:3002/` passed.
- Sample input generated rooms, validation/report UI stayed visible, and both `💾 JSON` / `📥 JSON` controls appeared.

---

## Latest Claude Code Changes (claude/diff-report-export)

### 추가/변경

**`lib/guidelineDiff.ts` — 신규**
- `computeGuidelineDiffs(items, confirmedIds, rooms) → GuidelineDiff[]`
- 확정된 GuidelineItem과 현재 room 값을 비교해 불일치 목록 반환
- 감지 대상: room_area(면적 수치 비교), room_count(동일 이름 실 개수), floor(층 배정)
- 내부 파서: `parseArea()`, `parseCount()`, `parseFloor()` — content 텍스트에서 수치 추출

**`components/GuidelineDiffPanel.tsx` — 신규**
- 확정 항목 ↔ 현재 실 값 불일치를 보여주는 알림 패널
- "적용": 지침서 값으로 room 업데이트 (parsedValue/parsedFloor 기반)
- "무시": 현재 값 유지, diff 닫기
- "수정": 인라인 입력 (면적/개수=숫자입력, 층=드롭다운)
- Props에 `onApply`, `onIgnore`, `onEdit` 콜백 정의 — Codex가 실제 room 변경 로직 연결 필요
- 마운트 위치: FloorPlanCanvas 내 또는 app/page.tsx overlay (Codex가 배치 결정)

**`lib/reportGenerator.ts` — 업데이트**
- `SectionQuote` 타입 추가: `{ itemTitle, content, quote, sourceRef, confidence }`
- `ReportSection`에 `quotes?: SectionQuote[]` 필드 추가
- `generateLayoutReport`에 `confirmedGuidelineItems?: GuidelineItem[]` 파라미터 추가
- `extractQuotesForSection()` — 섹션별 관련 카테고리의 guidelineItem quote를 최대 4건 추출
  - adjacency 섹션 → adjacency 카테고리
  - separation 섹션 → separation 카테고리
  - area-check 섹션 → room_area, room_count 카테고리
  - layout-overview 섹션 → floor, site 카테고리

**`components/ValidationReportPanel.tsx` — 업데이트**
- `generatePrintHtml(report)` — A4 인쇄용 HTML 생성 (한국어 폰트, 섹션 구조 유지)
- `handleDownloadText()` — Blob으로 `.txt` 파일 다운로드
- `handlePrint()` — 새 창에서 인쇄 대화상자 → "PDF로 저장" 가능
- 하단 버튼 3종: "텍스트 복사", "TXT 저장", "인쇄 / PDF"
- `QuoteBlock` 컴포넌트 — 섹션 펼침 시 관련 guidelineItem quote를 접힘형으로 표시
- `SectionQuote` import from reportGenerator

### Schema Changed

No. 기존 필드 변경 없음. `ReportSection.quotes` 선택적 필드 추가만.

### Branch

`claude/diff-report-export` — PR 제출 예정

### 추가 구현 (이번 작업에서 완료)

**`components/FloorPlanCanvas.tsx`**
- `onGuidelineStateChange?(items, confirmedIds)` prop 추가
- `ignoredDiffKeys: Set<string>` 상태 (diff 무시 추적)
- `activeDiffs` useMemo: `computeGuidelineDiffs` + ignoredDiffKeys 필터
- `handleDiffApply` — room.totalArea/room.floor를 지침서 값으로 직접 업데이트
- `handleDiffIgnore` — ignoredDiffKeys에 추가 (패널에서 제거)
- `handleDiffEdit` — 사용자 입력값으로 room 업데이트
- `GuidelineDiffPanel` 마운트 (activeDiffs > 0 일 때만)
- PDF 업로드 후 `onGuidelineStateChange` 호출
- `applyGuidelineConfirmations` 에서도 `onGuidelineStateChange` 호출

**`app/page.tsx`**
- `confirmedGuidelineItems: GuidelineItem[]` 상태
- `handleGuidelineStateChange` — FloorPlanCanvas에서 confirmed 항목 받아 저장
- `generateLayoutReport`에 `confirmedGuidelineItems` 전달 → QuoteBlock 활성화

---

## Next Work For Claude Code (이후 계획)

### 배치 보고서 디테일 추가

- ValidationReportPanel에 층별 뷰 지원 (현재는 단일 층 기준 리포트)
- 리포트에서 특정 실 선택 시 캔버스 해당 실 하이라이트 연동

---

## Watch Out

- `git reset --hard` 등 파괴적 git 명령 금지.
- Claude Code 변경 파일 덮어쓰기 금지 (특히 `hooks/useForceSimulation.ts`, `lib/guidelineExtractionPrompt.ts`).
- `Room.id`는 안정적으로 유지. DWG/Revit/Rhino 연동을 위해 ID 재생성 금지.
- AI 추출값(`status: "ai_suggested"`)이 사용자 확정값(`user_confirmed`)을 덮어쓰지 않도록 주의.
- `lib/floorPlanTypes.ts` 변경 시 `docs/data-schema.md` 동기화 필수.
