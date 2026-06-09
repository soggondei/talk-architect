"use client";

/**
 * GuidelineDiffPanel
 *
 * 확정된 GuidelineItem과 현재 room 값이 다를 때 표시되는 알림 패널.
 * "적용 / 무시 / 수정" 세 가지 액션을 제공합니다.
 *
 * 마운트 위치: FloorPlanCanvas 내부 또는 app/page.tsx overlay
 * 데이터 연결: Codex가 onApply/onIgnore/onEdit 콜백에 실제 room 변경 로직 구현 필요
 */

import { useState } from "react";
import { GuidelineDiff } from "@/lib/guidelineDiff";
import { FloorType } from "@/lib/floorPlanTypes";

// ── 카테고리 메타 ─────────────────────────────────────────────────────────────

const CATEGORY_META = {
  room_area:  { label: "면적",  color: "#2563EB", bg: "#EFF6FF" },
  room_count: { label: "개수",  color: "#7C3AED", bg: "#F5F3FF" },
  floor:      { label: "층",    color: "#D97706", bg: "#FFFBEB" },
} as const;

const PRIORITY_META = {
  required:    { label: "필수",  bg: "#FEE2E2", text: "#DC2626" },
  recommended: { label: "권장",  bg: "#FEF9C3", text: "#CA8A04" },
  reference:   { label: "참고",  bg: "#F1F5F9", text: "#64748B" },
} as const;

const FLOOR_OPTIONS: { value: FloorType; label: string }[] = [
  { value: "B1", label: "지하 1층" },
  { value: "1F", label: "지상 1층" },
  { value: "2F", label: "지상 2층" },
  { value: "3F", label: "지상 3층" },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  diffs: GuidelineDiff[];
  onApply: (diff: GuidelineDiff) => void;            // 지침서 값으로 room 업데이트
  onIgnore: (diff: GuidelineDiff) => void;           // 현재 값 유지, diff 닫기
  onEdit: (diff: GuidelineDiff, value: string) => void; // 사용자 입력값으로 업데이트
}

// ── 개별 Diff 카드 ────────────────────────────────────────────────────────────

function DiffCard({
  diff,
  onApply,
  onIgnore,
  onEdit,
}: {
  diff: GuidelineDiff;
  onApply: () => void;
  onIgnore: () => void;
  onEdit: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(
    diff.parsedValue?.toString() ?? ""
  );

  const cm = CATEGORY_META[diff.category];
  const pm = PRIORITY_META[diff.priority];

  const handleEdit = () => {
    if (diff.category === "floor") {
      onEdit(editValue || (diff.parsedFloor ?? diff.currentValue));
    } else {
      const num = parseFloat(editValue);
      if (!isNaN(num) && num > 0) {
        onEdit(editValue);
      }
    }
    setEditing(false);
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 shadow-sm">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
          style={{ background: cm.bg, color: cm.color }}
        >
          {cm.label}
        </span>
        <span
          className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
          style={{ background: pm.bg, color: pm.text }}
        >
          {pm.label}
        </span>
        <span className="text-xs font-semibold text-gray-800 flex-1 truncate">
          {diff.roomName}
        </span>
      </div>

      {/* 값 비교 */}
      <div className="flex items-center gap-2 mb-2 text-xs">
        <span className="text-gray-500">현재</span>
        <span className="font-semibold text-gray-800 bg-white border border-gray-200 rounded px-2 py-0.5">
          {diff.currentValue}
        </span>
        <span className="text-gray-400">→</span>
        <span className="text-gray-500">지침서</span>
        <span className="font-semibold text-amber-700 bg-amber-100 border border-amber-200 rounded px-2 py-0.5">
          {diff.guidelineValue}
        </span>
      </div>

      {/* 지침서 원문 */}
      <blockquote className="text-[10px] text-gray-500 italic border-l-2 border-amber-300 pl-2 mb-2.5 leading-snug">
        &ldquo;{diff.quote}&rdquo;
      </blockquote>

      {/* 수정 입력 (editing 상태) */}
      {editing && (
        <div className="mb-2.5">
          {diff.category === "floor" ? (
            <select
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full text-xs border border-amber-300 rounded-lg px-2 py-1.5 bg-white"
            >
              {FLOOR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="flex-1 text-xs border border-amber-300 rounded-lg px-2 py-1.5 bg-white"
                placeholder={diff.category === "room_area" ? "면적(㎡)" : "실 수"}
                min="1"
                autoFocus
              />
              <span className="text-xs text-gray-400 flex-shrink-0">
                {diff.category === "room_area" ? "㎡" : "실"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="flex gap-1.5">
        {!editing ? (
          <>
            {/* 적용: 지침서 값으로 room 업데이트 */}
            <button
              onClick={onApply}
              className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
              title="지침서 기준값으로 현재 값을 업데이트합니다"
              disabled={!diff.parsedValue && !diff.parsedFloor}
            >
              적용
            </button>
            {/* 무시: 현재 값 유지 */}
            <button
              onClick={onIgnore}
              className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              title="현재 값을 유지하고 이 알림을 닫습니다"
            >
              무시
            </button>
            {/* 수정: 직접 입력 */}
            <button
              onClick={() => setEditing(true)}
              className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-200 text-indigo-600 hover:bg-indigo-50 transition-colors"
              title="직접 값을 입력합니다"
            >
              수정
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleEdit}
              className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              확인
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── 메인 패널 ─────────────────────────────────────────────────────────────────

export default function GuidelineDiffPanel({ diffs, onApply, onIgnore, onEdit }: Props) {
  if (diffs.length === 0) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 p-3 pointer-events-none">
      <div className="pointer-events-auto max-w-sm ml-auto space-y-2">
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold shadow-lg">
          <span>⚠</span>
          <span>
            {diffs.length}건의 확정 항목이 현재 값과 다릅니다
          </span>
        </div>

        {/* Diff 카드 목록 */}
        {diffs.map((diff) => (
          <DiffCard
            key={`${diff.itemId}-${diff.roomId}`}
            diff={diff}
            onApply={() => onApply(diff)}
            onIgnore={() => onIgnore(diff)}
            onEdit={(v) => onEdit(diff, v)}
          />
        ))}

        {/* 전체 무시 */}
        {diffs.length > 1 && (
          <button
            onClick={() => diffs.forEach(onIgnore)}
            className="w-full py-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-700 bg-white/80 backdrop-blur-sm rounded-lg border border-gray-200 transition-colors"
          >
            모두 무시 (현재 값 유지)
          </button>
        )}
      </div>
    </div>
  );
}
