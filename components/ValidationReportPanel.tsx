"use client";

import { useState } from "react";
import { LayoutReport, ReportGrade, SectionSeverity, SectionQuote } from "@/lib/reportGenerator";

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
  onRoomFocus?: (roomId: string) => void;
}

// ── 인쇄용 HTML 생성 ─────────────────────────────────────────────────────────

function generatePrintHtml(report: LayoutReport): string {
  const gradeLabel = { A: "양호", B: "보통", C: "미흡", D: "불량" }[report.grade];
  const gradeColor = { A: "#16A34A", B: "#2563EB", C: "#D97706", D: "#DC2626" }[report.grade];

  const sectionsHtml = report.sections.map((s) => {
    const icon = { ok: "✓", caution: "△", critical: "✕" }[s.severity];
    const itemsHtml = s.severity !== "ok" && s.items.length
      ? `<ul>${s.items.map((i) => `<li>${i}</li>`).join("")}</ul>`
      : "";
    const actionHtml = s.action ? `<p class="action">→ ${s.action}</p>` : "";
    const quotesHtml = s.quotes?.length
      ? `<div class="quotes"><div class="quotes-label">지침서 원문 근거</div>${
          s.quotes.map((q) =>
            `<blockquote>${q.quote}<cite>${[q.itemTitle, q.sourceRef].filter(Boolean).join(" — ")}</cite></blockquote>`
          ).join("")
        }</div>`
      : "";
    return `<div class="section"><h3>${icon} ${s.title}</h3><p>${s.summary}</p>${itemsHtml}${actionHtml}${quotesHtml}</div>`;
  }).join("");

  const actionsHtml = report.priorityActions.length
    ? `<div class="section"><h3>수정 우선순위</h3><ol>${
        report.priorityActions.map((a) =>
          `<li class="${a.severity}">${a.label}</li>`
        ).join("")
      }</ol></div>`
    : "";

  const date = new Date(report.generatedAt).toLocaleString("ko-KR");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>배치 검증 리포트${report.projectName ? ` — ${report.projectName}` : ""}</title>
<style>
  @page { size: A4; margin: 25mm 20mm; }
  body { font-family: "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; font-size: 11pt; color: #1f2937; line-height: 1.6; }
  h1 { font-size: 16pt; margin-bottom: 4pt; }
  h2 { font-size: 11pt; font-weight: normal; color: #6b7280; margin-top: 0; }
  h3 { font-size: 11pt; margin: 0 0 6pt 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 4pt; }
  .grade { display: inline-block; font-size: 14pt; font-weight: 900; color: ${gradeColor}; border: 2px solid ${gradeColor}; padding: 2pt 8pt; border-radius: 6pt; margin-left: 8pt; }
  .meta { color: #6b7280; font-size: 9pt; margin-bottom: 16pt; }
  .summary { background: #f9fafb; border: 1px solid #e5e7eb; padding: 10pt 12pt; border-radius: 6pt; margin-bottom: 16pt; }
  .section { margin-bottom: 14pt; }
  ul, ol { margin: 6pt 0; padding-left: 16pt; }
  li { margin: 3pt 0; }
  li.critical { color: #dc2626; }
  li.caution { color: #d97706; }
  .action { color: #2563eb; font-size: 10pt; margin-top: 6pt; }
  .quotes { margin-top: 8pt; border-top: 1px solid #e5e7eb; padding-top: 8pt; }
  .quotes-label { font-size: 8pt; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4pt; }
  blockquote { margin: 4pt 0; padding: 4pt 8pt; border-left: 2px solid #d1d5db; font-style: italic; font-size: 9.5pt; color: #6b7280; }
  cite { display: block; font-style: normal; font-size: 9pt; color: #9ca3af; margin-top: 2pt; }
  .footer { margin-top: 20pt; border-top: 1px solid #e5e7eb; padding-top: 8pt; font-size: 9pt; color: #9ca3af; }
</style>
</head>
<body>
<h1>배치 검증 리포트 <span class="grade">${report.grade} ${gradeLabel}</span></h1>
<h2>${report.projectName ?? ""}</h2>
<p class="meta">${date} 기준 · ${report.roomCount}실 · ${report.totalArea.toLocaleString()}㎡ · 관계 ${report.connectionCount}쌍 · 만족도 ${report.satisfactionScore}%</p>
<div class="summary"><strong>종합 평가</strong><br>${report.executiveSummary}</div>
${sectionsHtml}
${actionsHtml}
<div class="footer">talk-architect 배치 검증 리포트 · ${date}</div>
</body>
</html>`;
}

// ── 지침서 근거 블록 ──────────────────────────────────────────────────────────

function QuoteBlock({ quotes }: { quotes: SectionQuote[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!quotes.length) return null;

  return (
    <div className="mx-3.5 mb-3 rounded-lg border border-gray-100 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider flex-1">
          지침서 원문 근거 {quotes.length}건
        </span>
        <span className="text-[10px] text-gray-300">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="divide-y divide-gray-50">
          {quotes.map((q, i) => {
            const confColor = q.confidence >= 0.8 ? "#16A34A" : q.confidence >= 0.6 ? "#D97706" : "#DC2626";
            return (
              <div key={i} className="px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-semibold text-gray-700 flex-1 leading-snug">
                    {q.itemTitle}
                  </span>
                  <span className="text-[9px] font-medium" style={{ color: confColor }}>
                    {Math.round(q.confidence * 100)}%
                  </span>
                </div>
                <blockquote className="border-l-2 border-gray-200 pl-2 text-[10px] text-gray-500 italic leading-snug">
                  &ldquo;{q.quote}&rdquo;
                  {q.sourceRef && (
                    <span className="not-italic text-[9px] text-gray-400 ml-1">
                      — {q.sourceRef}
                    </span>
                  )}
                </blockquote>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function ValidationReportPanel({ report, onClose, onRoomFocus }: Props) {
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

  const handleDownloadText = () => {
    const blob = new Blob([report.plainText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `배치검증리포트_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const html = generatePrintHtml(report);
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
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
                    className="mx-3.5 mb-2 rounded-lg px-3 py-2 text-[11px] leading-snug"
                    style={{ background: sm.bg, color: sm.color }}
                  >
                    → {section.action}
                  </div>
                )}

                {/* 지침서 원문 근거 */}
                {isExpanded && section.quotes && section.quotes.length > 0 && (
                  <QuoteBlock quotes={section.quotes} />
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
                  const firstRoomId = action.relatedRoomIds?.[0];
                  const isClickable = !!firstRoomId && !!onRoomFocus;
                  return (
                    <div
                      key={action.rank}
                      className={`flex items-start gap-3 px-3.5 py-2.5 transition-colors ${
                        isClickable ? "cursor-pointer hover:bg-gray-50 group" : ""
                      }`}
                      onClick={() => {
                        if (isClickable && firstRoomId) {
                          onRoomFocus(firstRoomId);
                          onClose();
                        }
                      }}
                      title={isClickable ? "클릭하면 캔버스에서 해당 실을 강조합니다" : undefined}
                    >
                      <span
                        className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black mt-0.5"
                        style={{
                          background: isCritical ? "#FEF2F2" : "#FFFBEB",
                          color: isCritical ? "#DC2626" : "#D97706",
                        }}
                      >
                        {action.rank}
                      </span>
                      <span className="flex-1 text-xs text-gray-700 leading-snug">{action.label}</span>
                      {isClickable && (
                        <span className="text-[9px] text-gray-300 group-hover:text-indigo-400 transition-colors mt-0.5 flex-shrink-0">
                          캔버스 ›
                        </span>
                      )}
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
        <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 space-y-2">
          {/* 내보내기 버튼 행 */}
          <div className="flex gap-1.5">
            <button
              onClick={handleCopy}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
                copied
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
              title="리포트 전문을 클립보드에 복사합니다"
            >
              {copied ? "✓ 복사됨" : "텍스트 복사"}
            </button>
            <button
              onClick={handleDownloadText}
              className="flex-1 py-2 text-xs font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              title="리포트를 .txt 파일로 저장합니다"
            >
              TXT 저장
            </button>
            <button
              onClick={handlePrint}
              className="flex-1 py-2 text-xs font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              title="새 창에서 인쇄 대화상자를 열어 PDF로 저장할 수 있습니다"
            >
              인쇄 / PDF
            </button>
          </div>
          {/* 닫기 */}
          <button
            onClick={onClose}
            className="w-full py-2 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            닫기
          </button>
          <p className="text-[10px] text-gray-400 text-center">
            인쇄 대화상자에서 &ldquo;PDF로 저장&rdquo;을 선택하면 PDF 파일로 내보낼 수 있습니다
          </p>
        </div>
      </aside>
    </div>
  );
}
