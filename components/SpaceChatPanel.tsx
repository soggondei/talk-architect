"use client";

import { useState, useRef, useEffect } from "react";
import { SpaceProgram, Room, Connection } from "@/lib/floorPlanTypes";
import { programToText } from "@/lib/floorPlanUtils";
import { ValidationIssue } from "@/lib/programValidation";

interface Message {
  role: "user" | "assistant";
  content: string;
  spaceProgram?: SpaceProgram;
  isAnalysis?: boolean;
}

const SUGGESTIONS = [
  "로비 100m², 대회의실 80m², 소회의실 40m²×2, 사무실 200m², 화장실 30m², 계단실 20m²",
  "주민센터: 민원실 150m², 상담실 20m²×4, 사무공간 120m², 회의실 60m², 창고 30m², 화장실 40m²",
  "복합문화센터 2000m²: 전시실, 강의실, 카페, 사무실, 서비스 공간 구성해줘",
  "도서관: 열람실 300m², 자료실 150m², 어린이실 80m², 사무실 60m², 화장실 40m², 계단 20m²",
];

interface Props {
  onProgramUpdate: (p: SpaceProgram) => void;
  rooms: Room[];
  connections: Connection[];
  validationIssues?: ValidationIssue[];
  onOpenValidationPanel?: () => void;
  onOpenReportPanel?: () => void;
}

export default function SpaceChatPanel({
  onProgramUpdate,
  rooms,
  connections,
  validationIssues = [],
  onOpenValidationPanel,
  onOpenReportPanel,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "안녕하세요! 공간 프로그램 분석 어시스턴트입니다.\n\n공모전 요강이나 실 목록을 입력하면 공간별 면적을 시각화하고, 공간 간 관계를 분석해 드립니다.\n\n배치가 완료되면 아래 '배치 분석' 버튼으로 AI 피드백을 받을 수 있습니다.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"program" | "analyze">("program");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendProgram = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/floorplan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const assistantMsg: Message = {
        role: "assistant",
        content: data.text || "응답을 받지 못했습니다.",
        spaceProgram: data.spaceProgram,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      if (data.spaceProgram) onProgramUpdate(data.spaceProgram);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "오류가 발생했습니다. 다시 시도해 주세요." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const sendAnalysis = async (userText?: string) => {
    if (rooms.length === 0) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "먼저 공간 프로그램을 입력해 배치를 완성해 주세요." },
      ]);
      return;
    }
    const layoutContext = programToText(rooms, connections);
    const msg = userText || "현재 배치를 분석하고 개선 제안을 해줘";
    const userMsg: Message = { role: "user", content: msg, isAnalysis: true };
    const analysisHistory = [...messages, userMsg];
    setMessages(analysisHistory);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: analysisHistory.map((m) => ({ role: m.role, content: m.content })),
          layoutContext,
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.text || "분석 오류", isAnalysis: true },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "분석 중 오류가 발생했습니다." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => {
    if (!input.trim()) return;
    if (mode === "analyze") sendAnalysis(input);
    else sendProgram(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 헤더 */}
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">📐</span>
          <div>
            <h1 className="font-bold text-gray-900 text-sm">공간 프로그램 분석</h1>
            <p className="text-xs text-gray-400">말(로)하는 건축가 · Space Program MVP</p>
          </div>
        </div>
        {/* 모드 탭 */}
        <div className="flex gap-1">
          <button
            onClick={() => setMode("program")}
            className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-colors ${
              mode === "program"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            공간 입력
          </button>
          <button
            onClick={() => setMode("analyze")}
            className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-colors ${
              mode === "analyze"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            배치 분석 {rooms.length > 0 && `(${rooms.length}개)`}
          </button>
        </div>
      </div>

      {/* 메시지 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs mr-2 mt-0.5 flex-shrink-0 ${msg.isAnalysis ? "bg-blue-600" : "bg-gray-900"}`}>
                {msg.isAnalysis ? "AI" : "AI"}
              </div>
            )}
            <div
              className={`max-w-[84%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? msg.isAnalysis
                    ? "bg-blue-600 text-white rounded-tr-sm"
                    : "bg-gray-900 text-white rounded-tr-sm"
                  : "bg-gray-100 text-gray-800 rounded-tl-sm"
              }`}
            >
              {msg.content}
              {msg.spaceProgram && (
                <div className="mt-2 pt-2 border-t border-gray-300/50 text-xs text-gray-500 space-y-0.5">
                  <div className="flex items-center gap-1 font-medium text-gray-700">
                    <span>📊</span>
                    <span>공간 {msg.spaceProgram.rooms.length}개 · {msg.spaceProgram.totalArea}m²</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs mr-2 flex-shrink-0 ${mode === "analyze" ? "bg-blue-600" : "bg-gray-900"}`}>
              AI
            </div>
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1 items-center h-9">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 빠른 시작 (공간 입력 모드, 첫 화면) */}
      {mode === "program" && messages.length <= 1 && (
        <div className="px-4 pb-2 flex-shrink-0">
          <p className="text-xs text-gray-400 mb-1.5">예시 입력</p>
          <div className="flex flex-col gap-1.5">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => sendProgram(s)}
                className="text-left text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors leading-relaxed"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 배치 분석 모드 — 빠른 분석 버튼 */}
      {mode === "analyze" && (
        <div className="px-4 pb-2 flex-shrink-0">
          <div className="flex flex-col gap-1.5">
            {[
              "현재 배치의 동선 효율성 분석해줘",
              "공용/전용 조닝이 잘 분리되어 있나?",
              "필수 인접 조건 중 빠진 부분 알려줘",
              "전체 배치 종합 평가해줘",
            ].map((s, i) => (
              <button
                key={i}
                onClick={() => sendAnalysis(s)}
                disabled={loading}
                className="text-left text-xs px-3 py-1.5 rounded-lg border border-blue-100 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {validationIssues.length > 0 && (
        <div className="px-4 pb-2 flex-shrink-0">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-semibold text-amber-900">검증 필요 {validationIssues.length}건</p>
              <div className="flex items-center gap-2">
                {onOpenReportPanel && (
                  <button
                    type="button"
                    onClick={onOpenReportPanel}
                    className="text-[10px] font-semibold text-indigo-700 hover:text-indigo-900 underline"
                  >
                    리포트 보기
                  </button>
                )}
                <button
                  type="button"
                  onClick={onOpenValidationPanel}
                  className="text-[10px] font-semibold text-amber-700 hover:text-amber-900 underline"
                >
                  전체 보기
                </button>
              </div>
            </div>
            <div className="space-y-1">
              {validationIssues.slice(0, 3).map((issue) => (
                <div key={issue.id} className="text-[11px] leading-relaxed text-amber-900">
                  <span className="font-medium">{issue.title}</span>
                  <span className="text-amber-800"> · {issue.description}</span>
                </div>
              ))}
              {validationIssues.length > 3 && (
                <p className="text-[11px] text-amber-700">
                  외 {validationIssues.length - 3}건은 배치 분석에서 이어서 확인하세요.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 입력창 */}
      <div className="px-4 pb-4 pt-2 border-t border-gray-100 flex-shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === "analyze"
                ? "배치에 대해 질문하세요... (Enter 전송)"
                : "공모전 요강이나 실 목록을 입력하세요... (Enter 전송)"
            }
            rows={2}
            className="flex-1 resize-none text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent placeholder-gray-300"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className={`w-10 h-10 rounded-xl text-white flex items-center justify-center disabled:opacity-30 transition-colors flex-shrink-0 ${
              mode === "analyze"
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-gray-900 hover:bg-gray-700"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
