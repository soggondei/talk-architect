import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

const SYSTEM_PROMPT = `당신은 건축 공모전 요강을 분석해 공간 프로그램(Space Program)을 추출하는 AI 건축 어시스턴트입니다.
사용자가 입력한 공모전 요강, 실 목록, 면적표 등을 분석해 구조화된 공간 데이터를 생성합니다.

[절대 규칙] 반드시 응답 마지막에 \`\`\`json 블록을 포함해야 합니다. 없으면 화면이 업데이트되지 않습니다.
설명은 2~3줄로 간결하게, JSON은 항상 응답 맨 끝에 포함하세요.

존(zone) 분류 기준:
- public(공용): 로비, 홀, 전시, 강당, 회의실, 열람실, 카페 등 누구나 이용
- private(전용): 사무실, 연구실, 개인 작업실, 숙소 등 제한적 이용
- service(서비스): 창고, 기계실, 주방, 세탁실, 청소실 등
- circulation(동선): 복도, 계단, 엘리베이터, 로비 동선
- core(코어): 화장실, 계단실, EV실, 설비실

관계(connections) 추론 기준:
- required(필수 인접): 기능상 반드시 인접해야 하는 공간 (예: 주방-식당, 로비-안내데스크)
- preferred(권장 인접): 동선상 가까우면 좋은 공간 (예: 회의실-사무실)

응답 형식:
\`\`\`json
{
  "rooms": [
    {
      "id": "r1",
      "name": "공간 이름",
      "area": 면적숫자,
      "count": 개수,
      "totalArea": 면적×개수,
      "zone": "public|private|service|circulation|core",
      "x": 0,
      "y": 0,
      "width": 0,
      "height": 0,
      "notes": "특이사항(선택)"
    }
  ],
  "connections": [
    { "id": "c1", "fromId": "r1", "toId": "r2", "type": "required|preferred" }
  ],
  "totalArea": 합계숫자,
  "targetArea": 요구면적(없으면 null),
  "notes": "프로그램 요약"
}
\`\`\`

규칙:
- x, y, width, height는 모두 0으로 설정 (클라이언트에서 계산)
- area는 단위 공간의 순수 면적(m²), count는 개수, totalArea = area × count
- 면적 정보 없으면 프로그램 규모에 맞게 합리적으로 추정
- connections는 기능 관계를 논리적으로 추론해서 생성`;

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/);
    let spaceProgram = null;

    if (jsonMatch) {
      try {
        spaceProgram = JSON.parse(jsonMatch[1]);
      } catch {
        // 파싱 실패 무시
      }
    }

    const displayText = text.replace(/```json[\s\S]*?```/g, "").trim();
    return NextResponse.json({ text: displayText, spaceProgram });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
