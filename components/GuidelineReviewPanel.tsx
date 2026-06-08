"use client";

import { useState, useMemo } from "react";
import { GuidelineItem, GuidelineCategory, Priority } from "@/lib/guidelineExtractionPrompt";

// ── 메타데이터 ──────────────────────────────────────────────────────────────

const CATEGORY_META: Record<GuidelineCategory, { label: string; color: string; bg: string }> = {
  room_area:   { label: "면적 기준",  color: "#2563EB", bg: "#EFF6FF" },
  room_count:  { label: "개수 기준",  color: "#7C3AED", bg: "#F5F3FF" },
  adjacency:   { label: "인접 관계", color: "#16A34A", bg: "#F0FDF4" },
  separation:  { label: "분리 관계", color: "#DC2626", bg: "#FEF2F2" },
  floor:       { label: "층별 구성",  color: "#D97706", bg: "#FFFBEB" },
  site:        { label: "대지 조건",  color: "#0891B2", bg: "#ECFEFF" },
  law:         { label: "법적 요건",  color: "#9D174D", bg: "#FDF2F8" },
  parking:     { label: "주차",       color: "#6B7280", bg: "#F9FAFB" },
  submission:  { label: "제출 요건",  color: "#64748B", bg: "#F8FAFC" },
  evaluation:  { label: "심사 기준",  color: "#B45309", bg: "#FEFCE8" },
  unknown:     { label: "기타",       color: "#9CA3AF", bg: "#F9FAFB" },
};

const PRIORITY_META: Record<Priority, { label: string; bg: string; text: string }> = {
  required:    { label: "필수",  bg: "#FEE2E2", text: "#DC2626" },
  recommended: { label: "권장",  bg: "#FEF9C3", text: "#CA8A04" },
  reference:   { label: "참고",  bg: "#F1F5F9", text: "#64748B" },
};

const CATEGORY_ORDER: GuidelineCategory[] = [
  "room_area", "room_count", "floor", "adjacency", "separation",
  "law", "site", "parking", "evaluation", "submission", "unknown",
];

// ── 타입 ────────────────────────────────────────────────────────────────────

type FilterTab = "all" | "review" | "confirmed";

interface Props {
  items: GuidelineItem[];
  confirmedIds: Set<string>;
  onConfirm: (id: string) => void;
  onUnconfirm: (id: string) => void;
  onClose: () => void;
  projectName?: string;
}

// ── 개별 아이템 카드 ─────────────────────────────────────────────────────────

function ItemCard({
  item,
  confirmed,
  onConfirm,
  onUnconfirm,
}: {
  item: GuidelineItem;
  confirmed: boolean;
  onConfirm: () => void;
  onUnconfirm: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cm = CATEGORY_META[item.category];
  const pm = PRIORITY_META[item.priority];
  const needsReview = item.content.includes("검토 필요");
  const conf = item.source.confidence ?? 1;
  const confPct = Math.round(conf * 100);
  const confColor = conf >= 0.8 ? "#16A34A" : conf >= 0.6 ? "#D97706" : "#DC2626";

  return (
    <div
      className={`rounded-xl border transition-all ${
        confirmed
          ? "bg-green-50/60 border-green-200"
          : needsReview
          ? "bg-amber-50/70 border-amber-200"
          : "bg-white border-gray-150"
      }`}
    >
      {/* 헤더 */}
      <div
        className="flex items-start gap-2 px-3 py-2.5 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* 카테고리 뱃지 */}
        <span
          className="flex-shrink-0 mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md"
          style={{ background: cm.bg, color: cm.color }}
        >
          {cm.label}
        </span>

        {/* 제목 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-xs font-semibold leading-snug ${confirmed ? "text-gray-500 line-through" : "text-gray-800"}`}>
              {item.title}
            </span>
            {needsReview && !confirmed && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                검토 필요
              </span>
            )}
          </div>
          {/* Priority + confidence (항상 표시) */}
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: pm.bg, color: pm.text }}
            >
              {pm.label}
            </span>
            <div className="flex items-center gap-1">
              <div className="w-12 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${confPct}%`, background: confColor }}
                />
              </div>
              <span className="text-[9px] font-medium" style={{ color: confColor }}>
                {confPct}%
              </span>
            </div>
          </div>
        </div>

        {/* 확정 버튼 */}
        <button
          onClick={(e) => { e.stopPropagation(); confirmed ? onUnconfirm() : onConfirm(); }}
          className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-colors ${
            confirmed
              ? "bg-green-500 text-white hover:bg-green-600"
              : "bg-gray-100 text-gray-400 hover:bg-green-100 hover:text-green-600"
          }`}
          title={confirmed ? "확정 취소" : "확정"}
        >
          {confirmed ? "✓" : "○"}
        </button>

        {/* 펼치기 */}
        <span className="flex-shrink-0 text-gray-300 text-xs mt-0.5">
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {/* 상세 내용 (펼침) */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-2">
          {/* 본문 */}
          <p className="text-xs text-gray-700 leading-relaxed">{item.content}</p>

          {/* 원문 인용 */}
          {item.source.quote && (
            <blockquote className="border-l-2 border-gray-300 pl-2 text-[11px] text-gray-500 italic leading-snug">
              &ldquo;{item.source.quote}&rdquo;
              {(item.source.section || item.source.page) && (
                <span className="not-italic text-[10px] text-gray-400 ml-1">
                  — {[item.source.section, item.source.page && `p.${item.source.page}`]
                    .filter(Boolean).join(", ")}
                </span>
              )}
            </blockquote>
          )}
        </div>
      )}
    </div>
  );
}

// ── 메인 패널 ────────────────────────────────────────────────────────────────

export default function GuidelineReviewPanel({
  items,
  confirmedIds,
  onConfirm,
  onUnconfirm,
  onClose,
  projectName,
}: Props) {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(CATEGORY_ORDER)
  );

  const needsReviewCount = useMemo(
    () => items.filter((i) => i.content.includes("검토 필요") && !confirmedIds.has(i.id)).length,
    [items, confirmedIds]
  );

  const filteredItems = useMemo(() => {
    if (filter === "review") return items.filter((i) => i.content.includes("검토 필요") && !confirmedIds.has(i.id));
    if (filter === "confirmed") return items.filter((i) => confirmedIds.has(i.id));
    return items;
  }, [items, filter, confirmedIds]);

  // 카테고리별 그룹핑 (CATEGORY_ORDER 순서 유지)
  const grouped = useMemo(() => {
    const map = new Map<GuidelineCategory, GuidelineItem[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const item of filteredItems) {
      map.get(item.category)!.push(item);
    }
    return Array.from(map.entries()).filter(([, arr]) => arr.length > 0);
  }, [filteredItems]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const confirmAll = () => {
    filteredItems
      .filter((i) => !confirmedIds.has(i.id))
      .forEach((i) => onConfirm(i.id));
  };

  return (
    <div className="absolute inset-0 z-20 flex justify-end pointer-events-none">
      {/* 패널 */}
      <div className="pointer-events-auto w-[340px] h-full bg-white/97 backdrop-blur-sm border-l border-gray-200 shadow-xl flex flex-col">
        {/* 헤더 */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-gray-900">지침서 요건 검토</div>
              {projectName && (
                <div className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[220px]">
                  {projectName}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* 통계 바 */}
          <div className="flex items-center gap-3 mt-2.5 text-xs">
            <span className="text-gray-500">{items.length}개 항목</span>
            {needsReviewCount > 0 && (
              <span className="text-amber-600 font-semibold">
                ⚠ 검토 필요 {needsReviewCount}개
              </span>
            )}
            <span className="text-green-600 font-semibold">
              ✓ 확정 {confirmedIds.size}개
            </span>
          </div>

          {/* 확정 진행 바 */}
          <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${items.length ? (confirmedIds.size / items.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* 필터 탭 */}
        <div className="flex-shrink-0 flex border-b border-gray-100">
          {([
            { key: "all",       label: "전체",      count: items.length },
            { key: "review",    label: "검토 필요", count: needsReviewCount },
            { key: "confirmed", label: "확정됨",    count: confirmedIds.size },
          ] as { key: FilterTab; label: string; count: number }[]).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                filter === key
                  ? "text-indigo-600 border-b-2 border-indigo-500 bg-indigo-50/50"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              {label}
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] ${
                filter === key ? "bg-indigo-100 text-indigo-600" : "bg-gray-100 text-gray-400"
              }`}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* 아이템 목록 */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {grouped.length === 0 && (
            <div className="text-center text-sm text-gray-400 pt-12">
              {filter === "confirmed" ? "아직 확정된 항목이 없습니다" :
               filter === "review"    ? "검토 필요 항목이 없습니다 ✓" :
               "추출된 요건이 없습니다"}
            </div>
          )}

          {grouped.map(([category, catItems]) => {
            const cm = CATEGORY_META[category as GuidelineCategory];
            const isExpanded = expandedCategories.has(category);
            return (
              <div key={category}>
                {/* 카테고리 헤더 */}
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center gap-2 mb-1.5 group"
                >
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                    style={{ background: cm.bg, color: cm.color }}
                  >
                    {cm.label}
                  </span>
                  <span className="text-[10px] text-gray-400">{catItems.length}개</span>
                  <span className="ml-auto text-gray-300 text-[10px] group-hover:text-gray-400">
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </button>

                {isExpanded && (
                  <div className="space-y-1.5">
                    {catItems.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        confirmed={confirmedIds.has(item.id)}
                        onConfirm={() => onConfirm(item.id)}
                        onUnconfirm={() => onUnconfirm(item.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 하단 액션 */}
        <div className="flex-shrink-0 px-3 py-3 border-t border-gray-100 flex gap-2">
          <button
            onClick={confirmAll}
            disabled={filteredItems.every((i) => confirmedIds.has(i.id))}
            className="flex-1 py-2 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 transition-colors"
          >
            {filter === "all" ? "전체 확정" : "현재 목록 확정"}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-2 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
