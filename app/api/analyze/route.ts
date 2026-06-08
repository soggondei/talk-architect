import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

const SYSTEM_PROMPT = `당신은 건축 공간 배치를 분석하는 AI 건축가 어시스턴트입니다.
사용자가 현재 배치한 공간 목록과 인접 관계를 바탕으로 동선, 조닝, 기능적 문제점을 분석하고 개선안을 제안합니다.

분석 기준:
1. 동선 효율성: 자주 이동하는 공간이 가까이 있는지
2. 조닝 분리: 공용/전용/서비스 존이 적절히 분리되어 있는지
3. 필수 인접 충족: 반드시 붙어야 하는 공간이 가까이 배치되어 있는지
4. 서비스 접근성: 화장실·계단 등 코어의 접근 균등성
5. 면적 균형: 각 존의 면적 비율이 프로그램 목적에 부합하는지

응답 형식:
- 간결하게 3~5개 핵심 포인트로 정리
- 각 포인트: 문제 → 원인 → 개선 제안
- 마지막에 "개선 우선순위" 한 줄로 요약
- JSON 블록 없이 텍스트만 응답`;

export async function POST(req: NextRequest) {
  try {
    const { messages, layoutContext } = await req.json();

    const systemWithContext = layoutContext
      ? `${SYSTEM_PROMPT}\n\n[현재 배치 정보]\n${layoutContext}`
      : SYSTEM_PROMPT;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: systemWithContext,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    return NextResponse.json({ text });
  } catch (error) {
    console.error("Analyze API error:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
