import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages";
import {
  GUIDELINE_EXTRACTION_PROMPT,
  type ExtractionOutput,
} from "@/lib/guidelineExtractionPrompt";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function extractJsonObject(text: string): string | null {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock?.[1]) return codeBlock[1].trim();
  const objectMatch = text.match(/\{[\s\S]*\}/);
  return objectMatch?.[0] ?? null;
}

function normalizeExtractionOutput(parsed: Partial<ExtractionOutput>, fileName: string): ExtractionOutput {
  return {
    documentId: parsed.documentId ?? `doc-${Date.now()}`,
    documentName: parsed.documentName ?? fileName,
    projectName: parsed.projectName ?? fileName.replace(/\.pdf$/i, ""),
    totalArea: typeof parsed.totalArea === "number" ? parsed.totalArea : null,
    guidelineItems: Array.isArray(parsed.guidelineItems) ? parsed.guidelineItems : [],
    rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [],
    relations: Array.isArray(parsed.relations) ? parsed.relations : [],
  };
}

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
      text: GUIDELINE_EXTRACTION_PROMPT,
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

    const jsonText = extractJsonObject(text);
    if (!jsonText) {
      return NextResponse.json(
        { error: "공간 정보를 추출할 수 없습니다", raw: text },
        { status: 422 }
      );
    }

    const parsed = normalizeExtractionOutput(JSON.parse(jsonText), file.name);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("parse-pdf error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 오류" },
      { status: 500 }
    );
  }
}
