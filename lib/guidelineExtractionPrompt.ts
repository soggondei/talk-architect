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
         "검토 필요: 동선 연계 표현이 인접(required) 또는 근접(preferred) 중 어느 것인지 불명확"

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
- law            : 법적 요건 (장애인 편의, 소방, 건축법 조항 인용 등)
- parking        : 주차 요건 (대수, 위치, 장애인 주차 포함)
- submission     : 도서 제출 요건 (제출 목록, 축척, 파일 형식 등)
- evaluation     : 심사 기준·배점 항목 (설계 완성도, 창의성 등 배점표)
- unknown        : 외관·재료·구조·친환경 등 위 분류에 해당하지 않는 사항

priority 기준:
- required     : "반드시", "필수", "이상", "이하", "하여야 한다" 등 강제 기준
- recommended  : "권장", "바람직", "가능한", "고려한다" 등 권고 사항
- reference    : 참고 정보, 심사 기준·배점 안내, 제출 목록 등

중요: 하나의 문장이 면적 기준과 개수 기준을 동시에 포함하면 GuidelineItem을 두 개로 분리하세요.
예: "세미나실 3실 이상, 1실당 40m² 이상" → room_count("세미나실 3실 이상") + room_area("세미나실 40m²/실 이상") 두 항목

━━━ 2. Room 추출 ━━━

공간 프로그램(실 목록)에서 각 실을 추출합니다.

zone 분류:
- public      : 로비, 홀, 커뮤니티실, 다목적실, 전시, 카페, 식당 등 누구나 이용하는 공용 공간
- private     : 사무실, 행정실, 회의실, 강의실, 세미나실, 작업실, 연구실 등 특정 이용자 전용
- service     : 창고, 기계실, 전기실, 주차장, 하역장, 방재실 등 지원·설비 공간
- circulation : 주요 복도, 경사로, 보행동선 공간 (계단 자체는 core)
- core        : 화장실, 장애인화장실, EV홀, 계단실, PS, 공조실 등 코어 및 설비 수직동선

floor 배정:
- "B1": 지하 1층 (지하 2층 이하도 B1으로 통합, notes에 실제 층수 기재)
- "1F": 지상 1층
- "2F": 지상 2층
- "3F": 지상 3층 이상 (3층을 초과하는 경우 "3F"로 통합, notes에 실제 층수 기재)
- null: 지침서에 층 배정이 명시되지 않은 경우

floor 판단 규칙:
- "저층부" → "1F" 또는 "2F" 중 문맥에 맞는 값, notes에 "검토 필요: 저층부 표현, 1~2층으로 추정"
- "A 또는 B층" → 더 낮은 층 배정, notes에 "검토 필요: 복수 층 기재됨 (X층 또는 Y층)"
- "주출입 층" → "1F"로 추정
- 층이 완전히 불명확하면 null

면적 처리:
- 표(table) 형식으로 면적이 제시된 경우 → 각 행을 Room 1개로 추출
- "1실당 X㎡" 형식 → area: X (단위 면적), totalArea: X × count
- 범위(예: 100~150m²)인 경우 → 중간값 사용, notes에 "검토 필요: 범위로 기재됨 (100~150m²)"
- "이상/이하" 조건인 경우 → 해당 수치 사용, notes에 "검토 필요: 최소/최대값 기재, 실제 면적 확정 필요"
- 명시 없는 경우 → area: -1, totalArea: -1, notes에 "검토 필요: 면적 미기재"

x, y, width, height는 추출 단계에서 0으로 고정합니다.

━━━ 3. Relation 추출 ━━━

두 실 간 인접·분리 관계를 추출합니다.

type 판단 기준:
- required  : "반드시 인접", "직접 연결", "필수 연접", "직접 접속", "바로 옆에 배치" 등 강제 인접
- preferred : "인접 권장", "근접 배치", "연계", "접근 용이", "가까이 배치" 등 권고 인접
- separated : "분리", "격리", "이격", "독립 배치" 등 물리적 분리 요건 (직접 인접 금지까지는 아닌 경우)
- forbidden : "접촉 금지", "직접 연결 불가", "인접 불가" 등 강제 비인접

인접 관계 판단 어려운 경우:
- "동선 연계" → preferred (물리적 인접보다 유연함), confidence 0.7
- "연접(連接)" → required (직접 붙여야 함), confidence 0.9
- "인접(隣接)" 단독 표현 → required, confidence 0.8
- "연결" 단독 표현 → preferred, confidence 0.7, notes에 "검토 필요: 연결의 강도 불명확 (직접 연결 vs 동선 연계)"
- 보행 동선 연계(복도 경유 가능) → preferred

weight:
- required: 1.0
- preferred: 0.6
- separated: 0.4
- forbidden: 0.0

reason에는 관계의 이유를 한 문장으로 서술하세요.
지침서에 이유가 명시된 경우 그대로 반영하고,
명시되지 않은 경우 건축적 판단을 reason에 서술하고
source.confidence를 0.6 이하로 기재하세요.

━━━ 법규·지침 추출 주의사항 ━━━

- 건축법, 소방법, 장애인편의법 등 법령 조항이 직접 인용되면 category: "law"
- "건축법 제00조" 등 조문 인용 시 quote에 조문 번호와 내용 포함
- 법규에서 파생되는 실(장애인화장실, 비상계단 등)은 Room으로도 추출하고,
  해당 GuidelineItem의 appliesToRoomIds에 연결
- 친환경 인증(그린빌딩, LEED 등), 에너지 성능 기준 → category: "unknown"
- 외관 디자인 가이드라인, 재료 지정 → category: "unknown"

━━━ 제출물 목록 추출 주의사항 ━━━

- 제출물 목록이 표 형식이면 항목별로 GuidelineItem을 생성하지 않고,
  "제출 도서 목록" 1개 GuidelineItem으로 통합하여 content에 목록 나열
- 단, 특정 도면의 축척/형식 조건이 별도로 명시된 경우에만 개별 항목으로 분리

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
