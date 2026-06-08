"use client";

import { Connection, Room } from "@/lib/floorPlanTypes";
import { ValidationIssue, ValidationIssueType } from "@/lib/programValidation";

const ISSUE_META: Record<ValidationIssueType, { label: string; color: string; bg: string }> = {
  area_mismatch: { label: "면적", color: "#D97706", bg: "#FFFBEB" },
  room_count_mismatch: { label: "실 개수", color: "#7C3AED", bg: "#F5F3FF" },
  required_adjacency_missing: { label: "필수 인접", color: "#DC2626", bg: "#FEF2F2" },
  forbidden_adjacency_detected: { label: "금지 인접", color: "#7C3AED", bg: "#F5F3FF" },
  source_conflict: { label: "데이터", color: "#475569", bg: "#F8FAFC" },
};

const SEVERITY_META = {
  error: { label: "오류", color: "#DC2626", bg: "#FEF2F2" },
  warning: { label: "주의", color: "#D97706", bg: "#FFFBEB" },
  info: { label: "정보", color: "#2563EB", bg: "#EFF6FF" },
} satisfies Record<ValidationIssue["severity"], { label: string; color: string; bg: string }>;

interface Props {
  issues: ValidationIssue[];
  rooms: Room[];
  connections: Connection[];
  onClose: () => void;
}

function roomNames(issue: ValidationIssue, rooms: Room[]) {
  return (issue.relatedRoomIds ?? [])
    .map((id) => rooms.find((room) => room.id === id)?.name ?? id)
    .join(" · ");
}

function relationNames(issue: ValidationIssue, connections: Connection[], rooms: Room[]) {
  return (issue.relatedRelationIds ?? [])
    .map((id) => {
      const relation = connections.find((conn) => conn.id === id);
      if (!relation) return id;
      const from = rooms.find((room) => room.id === relation.fromId)?.name ?? relation.fromId;
      const to = rooms.find((room) => room.id === relation.toId)?.name ?? relation.toId;
      return `${from} - ${to}`;
    })
    .join(" · ");
}

export default function ValidationIssuesPanel({ issues, rooms, connections, onClose }: Props) {
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  const infoCount = issues.filter((issue) => issue.severity === "info").length;

  const orderedIssues = [...issues].sort((a, b) => {
    const rank = { error: 0, warning: 1, info: 2 };
    return rank[a.severity] - rank[b.severity];
  });

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/15" onClick={onClose}>
      <aside
        className="h-full w-[380px] max-w-[92vw] bg-white shadow-2xl border-l border-gray-200 flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex-shrink-0 px-4 py-3 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-gray-900">전체 검증 결과</h2>
              <p className="text-[11px] text-gray-500 mt-0.5">
                실 정보와 배치 관계에서 확인된 이슈
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              aria-label="검증 패널 닫기"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3">
            {[
              { label: "오류", count: errorCount, color: "#DC2626", bg: "#FEF2F2" },
              { label: "주의", count: warningCount, color: "#D97706", bg: "#FFFBEB" },
              { label: "정보", count: infoCount, color: "#2563EB", bg: "#EFF6FF" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg px-2.5 py-2" style={{ background: item.bg }}>
                <div className="text-[10px] font-semibold" style={{ color: item.color }}>
                  {item.label}
                </div>
                <div className="text-lg font-bold leading-none mt-1" style={{ color: item.color }}>
                  {item.count}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {orderedIssues.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center text-sm text-gray-400">
              현재 검증 이슈가 없습니다.
            </div>
          ) : (
            orderedIssues.map((issue) => {
              const typeMeta = ISSUE_META[issue.type];
              const severityMeta = SEVERITY_META[issue.severity];
              const roomsText = roomNames(issue, rooms);
              const relationsText = relationNames(issue, connections, rooms);

              return (
                <article key={issue.id} className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: severityMeta.bg, color: severityMeta.color }}
                        >
                          {severityMeta.label}
                        </span>
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: typeMeta.bg, color: typeMeta.color }}
                        >
                          {typeMeta.label}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-gray-900 mt-1.5">{issue.title}</h3>
                    </div>
                  </div>

                  <p className="text-xs text-gray-700 leading-relaxed mt-2">
                    {issue.description}
                  </p>

                  {(roomsText || relationsText) && (
                    <div className="mt-2 rounded-lg bg-gray-50 px-2.5 py-2 text-[11px] text-gray-500 space-y-1">
                      {roomsText && <div>관련 실: {roomsText}</div>}
                      {relationsText && <div>관련 관계: {relationsText}</div>}
                    </div>
                  )}

                  {issue.suggestion && (
                    <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-2 text-[11px] text-blue-700 leading-relaxed">
                      {issue.suggestion}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}
