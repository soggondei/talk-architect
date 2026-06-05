import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { BuildingParams } from "@/lib/buildingTypes";

const client = new Anthropic();

const SYSTEM_PROMPT = `당신은 자연어로 건축 설계를 도와주는 AI 건축가 어시스턴트입니다.
사용자의 요청을 분석하여 건축 설계 파라미터를 생성하고, 한국어로 친절하게 설명합니다.

반드시 다음 JSON 형식을 응답 끝에 \`\`\`json ... \`\`\` 블록으로 포함해야 합니다:

{
  "floors": <층수, 숫자>,
  "width": <건물 폭(m), 숫자>,
  "depth": <건물 깊이(m), 숫자>,
  "heightPerFloor": <층고(m), 기본 3.0>,
  "piloti": <필로티 여부, true/false>,
  "pilotiFloors": <필로티 층수, 숫자>,
  "roofType": <지붕 형태: "flat"(평지붕) | "gable"(박공) | "hip"(우진각)>,
  "roofAngle": <지붕 경사각도, 숫자, flat이면 0>,
  "windows": [
    { "wall": "front"|"back"|"left"|"right", "floor": <층번호 1부터>, "xOffset": <중심 오프셋 -1~1>, "width": <창 폭>, "height": <창 높이> }
  ],
  "balconies": [
    { "wall": "front"|"back"|"left"|"right", "floor": <층번호>, "width": <폭>, "depth": <돌출 깊이> }
  ],
  "hasCourt": <중정 여부, true/false>,
  "courtWidth": <중정 폭, 숫자, hasCourt가 true일 때>,
  "courtDepth": <중정 깊이, 숫자, hasCourt가 true일 때>,
  "wallColor": <외벽 색상 hex코드, 예: "#e8e0d5">,
  "roofColor": <지붕 색상 hex코드, 예: "#8b7355">,
  "description": <설계 요약 한 줄>
}

건축 규칙:
- 층수는 1~10층
- 폭과 깊이는 5~30m
- 필로티는 1층을 열린 필로티로 처리
- 창문 xOffset은 -0.5~0.5 사이 값으로 벽면 내 좌우 위치
- 한국 건축 용어를 이해함: 필로티, 박공지붕, 중정, 발코니, 테라스 등`;

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // JSON 블록 추출
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/);
    let buildingParams: BuildingParams | null = null;

    if (jsonMatch) {
      try {
        buildingParams = JSON.parse(jsonMatch[1]);
      } catch {
        // JSON 파싱 실패 시 무시
      }
    }

    // 사용자에게 보여줄 텍스트 (JSON 블록 제거)
    const displayText = text.replace(/```json[\s\S]*?```/g, "").trim();

    return NextResponse.json({ text: displayText, buildingParams });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
