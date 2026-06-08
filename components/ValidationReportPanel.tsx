"use client";

import { useState } from "react";
import { LayoutReport, ReportGrade, SectionSeverity } from "@/lib/reportGenerator";

// ── 메타데이터 ──────────────────────────────────────────────────────────────

const GRADE_META: Record<ReportGrade, { label: string; color: string; bg: string; border: string }> = {
  A: { label: "양호",  color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC" },
  B: { label: "보통",  color: "#2563EB", bg: "#EFF6FF", border: "#93C5FD" },
  C: { label: "미흡",  color: "#D97706", bg: "#FFFBEB", border: "#FCD34D" },
  D: { label: "불량",  color: "#DC2626", bg: "#FEF2F2", border: "#FCA5A5" },
};

const SEVERITY_META: Record<SectionSeverity, { icon: string; color: string; bg: string }> = {
  ok:       { icon: "✓", color: "#16A34A", bg: "#F0FDF4" },
  caution:  { icon: "△", color: "#D97706", bg: "#FFFBEB" },
  critical: { icon: "✕", color: "#DC2626", bg: "#FEF2F2" },
};

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  report: LayoutReport;
  onClose: () => void;
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function ValidationReportPanel({ report, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(report.sections.filter((s) => s.severity !== "ok").map((s) => s.id))
  );

  const grade = GRADE_META[report.grade];

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(report.plainText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const generatedTime = new Date(report.generatedAt).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <aside
        className="h-full w-[400px] max-w-[94vw] bg-white shadow-2xl border-l border-gray-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex-shrink-0 px-5 py-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-gray-900">배치 검증 리포트</h2>
                {/* 등급 배지 */}
                <span
                  className="text-sm font-black px-2.5 py-0.5 rounded-lg border"
                  style={{ color: grade.color, background: grade.bg, borderColor: grade.border }}
                >
                  {report.grade} · {grade.label}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">{generatedTime} 기준</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors flex-shrink-0"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>

          {/* 만족도 점수 */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-gray-500">인접 관계 만족도</span>
                <span className="text-sm font-black" style={{ color: grade.color }}>
                  {report.satisfactionScore}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${report.satisfactionScore}%`, background: grade.color }}
                />
              </div>
            </div>
          </div>

          {/* 요약 수치 */}
          <div className="flex gap-3 mt-2.5 text-[11px] text-gray-500">
            <span>{report.roomCount}실</span>
            <span>·</span>
            <span>{report.totalArea.toLocaleString()}㎡</span>
            <span>·</span>
            <span>관계 {report.connectionCount}쌍</span>
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

          {/* 종합 평가 요약 */}
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
              종합 평가
            </div>
            <p className="text-xs text-gray-700 leading-relaxed">{report.executiveSummary}</p>
          </div>

          {/* 섹션 */}
          {report.sections.map((section) => {
            const sm = SEVERITY_META[section.severity];
            const isExpanded = expandedSections.has(section.id);
            const hasDetails = section.severity !== "ok" || section.items.length > 0;

            return (
              <div
                key={section.id}
                className="rounded-xl border overflow-hidden"
                style={{ borderColor: section.severity === "ok" ? "#E5E7EB" : sm.bg }}
              >
                {/* 섹션 헤더 */}
                <button
                  onClick={() => hasDetails && toggleSection(section.id)}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-3 text-left ${
                    hasDetails ? "cursor-pointer hover:bg-gray-50" : "cursor-default"
                  }`}
                >
                  <span
                    className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black flex-shrink-0"
                    style={{ background: sm.bg, color: sm.color }}
                  >
                    {sm.icon}
                  </span>
                  <span className="flex-1 text-xs font-bold text-gray-800">{section.title}</span>
                  {hasDetails && (
                    <span className="text-gray-300 text-[10px]">{isExpanded ? "▲" : "▼"}</span>
                  )}
                </button>

                {/* 섹션 요약 */}
                <div className="px-3.5 pb-3 -mt-1">
                  <p className="text-xs text-gray-600 leading-relaxed">{section.summary}</p>
                </div>

                {/* 세부 항목 */}
                {isExpanded && section.items.length > 0 && section.severity !== "ok" && (
                  <div className="px-3.5 pb-3 space-y-1 border-t border-gray-100 pt-2">
                    {section.items.map((item, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="text-[10px] mt-0.5 flex-shrink-0" style={{ color: sm.color }}>
                          •
                        </span>
                        <span className="text-[11px] text-gray-700 leading-snug">{item}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 권장 조치 */}
                {isExpanded && section.action && (
                  <div
                    className="mx-3.5 mb-3 rounded-lg px-3 py-2 text-[11px] leading-snug"
                    style={{ background: sm.bg, color: sm.color }}
                  >
                    → {section.action}
                  </div>
                )}
              </div>
            );
          })}

          {/* 수정 우선순위 */}
          {report.priorityActions.length > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-3.5 py-2.5 bg-gray-50 border-b border-gray-100">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  수정 우선순위
                </div>
              </div>
              <div className="divide-y divide-gray-50">
                {report.priorityActions.map((action) => {
                  const isCritical = action.severity === "critical";
                  return (
                    <div key={action.rank} className="flex items-start gap-3 px-3.5 py-2.5">
                      <span
                        className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black mt-0.5"
                        style={{
                          background: isCritical ? "#FEF2F2" : "#FFFBEB",
                          color: isCritical ? "#DC2626" : "#D97706",
                        }}
                      >
                        {action.rank}
                      </span>
                      <span className="text-xs text-gray-700 leading-snug">{action.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {report.priorityActions.length === 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
              <p className="text-xs text-green-700 font-semibold">
                ✓ 수정이 필요한 우선 항목이 없습니다.
              </p>
              <p className="text-[11px] text-green-600 mt-0.5">
                현재 배치가 모든 인접 관계 조건을 충족합니다.
              </p>
            </div>
          )}
        </div>

        {/* 하단 액션 */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 flex gap-2">
          <button
            onClick={handleCopy}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
              copied
                ? "bg-green-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {copied ? "✓ 복사 완료" : "리포트 텍스트 복사"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            닫기
          </button>
        </div>
      </aside>
    </div>
  );
}
