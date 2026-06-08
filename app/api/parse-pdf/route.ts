import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACT_PROMPT = `당신은 건축 설계공모 지침서를 분석하는 전문 건축사입니다.

주어진 설계공모 지침서 PDF를 꼼꼼히 읽고, 아래 두 가지를 함께 추출하세요.

━━━ 1. 층별 구성 계획 ━━━
지침서에 명시된 층별 배치 원칙, 각 층의 용도와 성격, 동선 계획을 분석하세요.
- 지침서에 "1층에는 ~", "지하에는 ~" 같은 표현이 있으면 그대로 반영
- 접근성 요건(장애인, 노약자 등), 공개공지/필로티 요건 등도 포함
- 지침서에 층 구성이 전혀 없으면 floorComposition을 null로

━━━ 2. 공간 프로그램 (실 목록) ━━━
각 실의 면적, 개수, 성격을 추출하되, 지침서의 층별 구성 계획을 근거로 각 실에 floor를 배정하세요.

zone 분류 기준:
- "public"      : 로비, 홀, 커뮤니티실, 다목적실, 전시공간, 카페, 북카페 등 누구나 이용하는 공간
- "private"     : 사무실, 행정실, 회의실, 강의실, 세미나실, 작업실 등 특정 이용자 공간
- "service"     : 창고, 기계실, 전기실, 주차장, 하역장 등 서비스 지원 공간
- "circulation" : 복도, 로비 연결복도, 계단, 경사로 등 주요 동선
- "core"        : 화장실, 장애인화장실, EV홀, 계단실, 파이프샤프트 등 코어

floor 배정 기준:
- "B1" : 지하 1층 (주차, 기계실, 창고, 지하 커뮤니티 등)
- "1F" : 지상 1층 (주출입구, 로비, 공개공지 접면 공간 등)
- "2F" : 지상 2층
- "3F" : 지상 3층 이상 (여러 층이면 가장 높은 층을 3F로 통합)
- floor를 알 수 없거나 지침서에 층 구성이 없으면 null

adjacency(인접 필요 공간) 규칙:
- 지침서에 "인접", "연접", "직접 연결", "근접" 등 명시된 경우만 포함
- 동선 연결이 중요한 코어 공간(화장실, 계단실)은 인접 공간을 명시
- required(필수 인접): 지침서에 "반드시", "직접 연결", "필수" 등 강조된 경우

━━━ 출력 형식 ━━━
JSON만 반환하고 다른 텍스트는 일절 쓰지 마세요:
{
  "projectName": "프로젝트 전체 이름",
  "totalArea": 연면적숫자,
  "floorComposition": {
    "summary": "지침서가 제안하는 층별 구성 원칙 요약 (지침서 표현 그대로, 2-4문장)",
    "floors": {
      "B1": "지하층 주요 용도 및 계획 방향 (없으면 null)",
      "1F": "1층 주요 용도 및 계획 방향",
      "2F": "2층 주요 용도 및 계획 방향 (없으면 null)",
      "3F": "3층 주요 용도 및 계획 방향 (없으면 null)"
    },
    "circulationNotes": "층간 동선·연계 관련 특이사항 (없으면 null)"
  },
  "rooms": [
    {
      "id": "고유코드(영문+숫자)",
      "name": "공간 이름 (지침서 표현 그대로)",
      "area": 면적숫자,
      "count": 개수,
      "zone": "public|private|service|circulation|core",
      "floor": "B1|1F|2F|3F|null",
      "adjacency": ["인접이 필요한 공간 이름"],
      "required": ["필수 인접 공간 이름"]
    }
  ]
}`;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("pdf") as File | null;
    if (!file) {
      return NextResponse.json({ error: "PDF 파일이 없습니다" }, { status: 400 });
    }
    if (file.size > 32 * 1024 * 1024) {
      return NextResponse.json({ error: "파일 크기는 32MB 이하여야 합니다" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const docBlock: ContentBlockParam = {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: base64,
      },
    } as ContentBlockParam;

    const textBlock: ContentBlockParam = {
      type: "text",
      text: EXTRACT_PROMPT,
    };

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8096,
      messages: [
        {
          role: "user",
          content: [docBlock, textBlock],
        },
      ],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "공간 정보를 추출할 수 없습니다", raw: text },
        { status: 422 }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("parse-pdf error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 오류" },
      { status: 500 }
    );
  }
}
