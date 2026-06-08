/**
 * Guideline Extraction Prompt
 *
 * 설계공모 지침서(PDF 또는 텍스트)를 GuidelineItem, Room, Relation JSON으로 추출하는 프롬프트.
 *
 * 설계 원칙:
 * - AI 추출값은 항상 status: "ai_suggested"
 * - 확실하지 않은 값은 notes 또는 content에 "검토 필요: <이유>" 명시
 * - 모든 항목은 원문 인용(source.quote)을 포함
 * - source.confidence: 0.0~1.0 (1.0 = 지침서에 수치가 명확히 기재됨)
 */

// ── 출력 타입 (data-schema.md 기준) ────────────────────────────────────────

export type ZoneType = "public" | "private" | "service" | "circulation" | "core";
export type FloorType = "B1" | "1F" | "2F" | "3F";
export type ItemStatus = "ai_suggested" | "user_confirmed" | "edited" | "conflict";
export type Priority = "required" | "recommended" | "reference";
export type RelationType = "none" | "preferred" | "required" | "separated" | "forbidden";

export type GuidelineCategory =
  | "room_area"
  | "room_count"
  | "adjacency"
  | "separation"
  | "floor"
  | "site"
  | "law"
  | "parking"
  | "submission"
  | "evaluation"
  | "unknown";

export interface SourceReference {
  documentId?: string;
  documentName?: string;
  page?: number;
  section?: string;
  quote: string;         // 원문 인용 (필수)
  confidence: number;   // 0.0~1.0
}

export interface GuidelineItem {
  id: string;
  category: GuidelineCategory;
  title: string;
  content: string;                    // 검토 필요 시 내용에 명시
  appliesToRoomIds?: string[];
  appliesToRelationIds?: string[];
  priority: Priority;
  source: SourceReference;
  status: ItemStatus;
}

export interface ExtractedRoom {
  id: string;
  name: string;
  area: number;                       // 단위 공간 m²; 불명확 시 -1
  count: number;
  totalArea: number;                  // area × count; 불명확 시 -1
  zone: ZoneType;
  floor: FloorType | null;            // 층 불명확 시 null
  x: 0; y: 0; width: 0; height: 0;  // 추출 단계에서는 0 고정
  notes: string | null;              // "검토 필요: <이유>" 명시
  status: "ai_suggested";
  source: SourceReference[];
}

export interface ExtractedRelation {
  id: string;
  fromId: string;
  toId: string;
  type: RelationType;
  weight: number;                     // required=1.0, preferred=0.6, separated=0.4, forbidden=0.0
  reason: string;
  source: SourceReference[];
  status: "ai_suggested";
}

export interface ExtractionOutput {
  documentId: string;
  documentName: string;
  projectName: string;
  totalArea: number | null;
  guidelineItems: GuidelineItem[];
  rooms: ExtractedRoom[];
  relations: ExtractedRelation[];
}

// ── 프롬프트 본문 ───────────────────────────────────────────────────────────

export const GUIDELINE_EXTRACTION_PROMPT = `\
당신은 대한민국 건축설계공모 지침서를 분석하는 전문 건축사입니다.
주어진 지침서(PDF 또는 텍스트)를 읽고 아래 세 가지 JSON 배열을 추출하세요.

━━━ 추출 원칙 ━━━

1. 원문 근거 필수
   모든 항목에 source.quote(지침서 원문 발췌)를 포함하세요.
   인용이 불가한 경우(도표, 그림 등)는 quote에 "[표 X 참조]" 형태로 명시하세요.

2. 검토 필요 표시
   수치나 범주가 불명확한 경우, notes 또는 content에
   "검토 필요: <구체적 이유>"를 반드시 기재하세요.
   예시: "검토 필요: 면적 범위(100~150m²)로 기재됨, 설계자가 확정 필요"
         "검토 필요: 층 배정이 지침서에 명시되지 않아 유사 시설 기준 추정"
         "검토 필요: zone 분류 모호 (공용/전용 경계가 불명확)"

3. 신뢰도 점수
   source.confidence(0.0~1.0)를 기재하세요.
   - 1.0: 지침서에 수치가 명확히 기재됨
   - 0.8: 맥락상 명확히 추론 가능
   - 0.6: 유사 사례 기준 추정
   - 0.4 이하: 불확실 (반드시 검토 필요 표시)

4. status는 항상 "ai_suggested"

5. ID 규칙
   - GuidelineItem: "gl-001", "gl-002" …
   - Room:          "rm-001", "rm-002" …
   - Relation:      "rel-001", "rel-002" …
   ID는 문서 내에서 일관성 있게 유지하세요(appliesToRoomIds, fromId 등에서 동일 ID 사용).

━━━ 1. GuidelineItem 추출 ━━━

지침서에서 모든 요건을 추출합니다. category 기준:

- room_area      : 특정 실의 면적 기준 (예: "다목적실 300m² 이상")
- room_count     : 특정 실의 개수 기준 (예: "세미나실 3실 이상")
- adjacency      : 두 실 간 인접·연결 요건 (예: "로비는 안내데스크에 인접")
- separation     : 두 실 간 분리·격리 요건 (예: "기계실은 사무실과 분리")
- floor          : 층별 용도 배정 기준 (예: "지상 1층에 공개공지 접면 공간 배치")
- site           : 대지 조건·건폐율·용적률·후퇴선 등
- law            : 법적 요건 (장애인 편의, 소방, 건축법 등)
- parking        : 주차 요건
- submission     : 도서 제출 요건
- evaluation     : 심사 기준·배점
- unknown        : 위 분류에 해당하지 않는 사항

priority 기준:
- required     : "반드시", "필수", "이상", "이하" 등 강제 기준
- recommended  : "권장", "바람직", "가능한" 등 권고 사항
- reference    : 참고 정보, 심사 기준, 제출 안내 등

━━━ 2. Room 추출 ━━━

공간 프로그램(실 목록)에서 각 실을 추출합니다.

zone 분류:
- public      : 로비, 홀, 커뮤니티실, 다목적실, 전시, 카페 등 누구나 이용
- private     : 사무실, 행정실, 회의실, 강의실, 세미나실, 작업실 등 특정 이용자
- service     : 창고, 기계실, 전기실, 주차장, 하역장 등 지원 공간
- circulation : 복도, 계단, 경사로 등 주요 동선
- core        : 화장실, 장애인화장실, EV홀, 계단실, PS 등 코어

floor 배정:
- "B1": 지하 1층
- "1F": 지상 1층
- "2F": 지상 2층
- "3F": 지상 3층 이상 (3층을 초과하는 경우 "3F"로 통합)
- null: 지침서에 층 배정이 명시되지 않은 경우

면적 처리:
- 범위(예: 100~150m²)인 경우 → 중간값 사용, notes에 "검토 필요: 범위로 기재됨 (100~150m²)"
- "이상/이하" 조건인 경우 → 해당 수치 사용, notes에 "검토 필요: 최소값 기재, 실제 면적 확정 필요"
- 명시 없는 경우 → area: -1, notes에 "검토 필요: 면적 미기재"

x, y, width, height는 추출 단계에서 0으로 고정합니다.

━━━ 3. Relation 추출 ━━━

두 실 간 인접·분리 관계를 추출합니다.

type 기준:
- required  : "반드시 인접", "직접 연결", "필수 연접" 등 강제 인접
- preferred : "인접 권장", "근접 배치", "연계" 등 권고 인접
- separated : "분리", "격리", "이격" 등 분리 요건
- forbidden : "접촉 금지", "직접 연결 불가" 등 강제 비인접

weight:
- required: 1.0
- preferred: 0.6
- separated: 0.4
- forbidden: 0.0

reason에는 관계의 이유를 한 문장으로 서술하세요.
지침서에 이유가 명시된 경우 그대로 반영하고,
명시되지 않은 경우 건축적 판단을 reason에 서술하고
source.confidence를 0.6 이하로 기재하세요.

━━━ 출력 형식 ━━━

JSON만 출력하세요. 다른 텍스트는 쓰지 마세요.

{
  "documentId": "doc-001",
  "documentName": "설계공모지침서 파일명 또는 프로젝트명",
  "projectName": "프로젝트 전체 공식 이름",
  "totalArea": 연면적 숫자 또는 null,
  "guidelineItems": [
    {
      "id": "gl-001",
      "category": "room_area",
      "title": "다목적실 면적 기준",
      "content": "다목적실은 300m² 이상으로 계획한다",
      "appliesToRoomIds": ["rm-003"],
      "appliesToRelationIds": [],
      "priority": "required",
      "source": {
        "section": "3. 공간 프로그램",
        "page": 12,
        "quote": "다목적실은 300m² 이상으로 계획한다",
        "confidence": 1.0
      },
      "status": "ai_suggested"
    }
  ],
  "rooms": [
    {
      "id": "rm-001",
      "name": "로비",
      "area": 150,
      "count": 1,
      "totalArea": 150,
      "zone": "public",
      "floor": "1F",
      "x": 0, "y": 0, "width": 0, "height": 0,
      "notes": null,
      "status": "ai_suggested",
      "source": [
        {
          "section": "3.1 공간 목록",
          "quote": "로비 150m²",
          "confidence": 0.95
        }
      ]
    },
    {
      "id": "rm-002",
      "name": "다목적실",
      "area": 300,
      "count": 1,
      "totalArea": 300,
      "zone": "public",
      "floor": "1F",
      "x": 0, "y": 0, "width": 0, "height": 0,
      "notes": "검토 필요: 300m² 이상 조건, 실제 면적 설계자가 확정 필요",
      "status": "ai_suggested",
      "source": [
        {
          "section": "3. 공간 프로그램",
          "quote": "다목적실은 300m² 이상으로 계획한다",
          "confidence": 1.0
        }
      ]
    }
  ],
  "relations": [
    {
      "id": "rel-001",
      "fromId": "rm-001",
      "toId": "rm-002",
      "type": "required",
      "weight": 1.0,
      "reason": "주출입구와 연결된 로비에서 다목적실로 직접 접근 가능해야 함",
      "source": [
        {
          "section": "4. 동선 계획",
          "quote": "로비는 다목적실과 직접 연결되어야 한다",
          "confidence": 0.95
        }
      ],
      "status": "ai_suggested"
    }
  ]
}`;

// ── 현재 parse-pdf 라우트와 통합을 위한 호환 래퍼 ─────────────────────────

/**
 * 기존 /api/parse-pdf 라우트에서 사용하는 단순 프롬프트.
 * 점진적으로 GUIDELINE_EXTRACTION_PROMPT로 교체 예정.
 */
export const LEGACY_EXTRACT_PROMPT = GUIDELINE_EXTRACTION_PROMPT;
