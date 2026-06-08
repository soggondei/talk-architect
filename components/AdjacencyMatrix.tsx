"use client";

import { Room, Connection, ZONE_COLORS, ZoneType } from "@/lib/floorPlanTypes";
import {
  RelationType,
  getRelation,
  setRelation,
  cycleRelation,
} from "@/lib/floorPlanUtils";

const REL = {
  none:      { symbol: "·",  bg: "#F9FAFB", border: "#E5E7EB", color: "#D1D5DB", label: "없음" },
  preferred: { symbol: "○",  bg: "#FFFBEB", border: "#FCD34D", color: "#CA8A04", label: "권장" },
  required:  { symbol: "●",  bg: "#FEF2F2", border: "#FCA5A5", color: "#DC2626", label: "필수" },
  separated: { symbol: "◇",  bg: "#EFF6FF", border: "#93C5FD", color: "#2563EB", label: "분리" },
  forbidden: { symbol: "×",  bg: "#F5F3FF", border: "#C4B5FD", color: "#7C3AED", label: "금지" },
};

interface Props {
  rooms: Room[];
  connections: Connection[];
  onConnectionsChange: (c: Connection[]) => void;
}

export default function AdjacencyMatrix({ rooms, connections, onConnectionsChange }: Props) {
  if (rooms.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-gray-400">
        공간을 입력하면 관계 매트릭스가 표시됩니다
      </div>
    );
  }

  const handleClick = (fromId: string, toId: string) => {
    const current = getRelation(fromId, toId, connections);
    const next = cycleRelation(current);
    onConnectionsChange(setRelation(fromId, toId, next, connections));
  };

  const truncate = (name: string, max = 6) =>
    name.length > max ? name.slice(0, max) + "…" : name;

  // 각 공간의 필수 관계 수 (행 요약용)
  const requiredCount = (id: string) =>
    connections.filter(
      (c) => (c.fromId === id || c.toId === id) && c.type === "required"
    ).length;

  return (
    <div className="flex flex-col h-full">
      {/* 범례 */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-500">인접 관계 매트릭스</span>
        <div className="flex gap-3 ml-2">
          {(Object.entries(REL) as [RelationType, typeof REL[RelationType]][]).map(([key, cfg]) => (
            <span key={key} className="flex items-center gap-1 text-xs" style={{ color: cfg.color }}>
              <span className="font-bold text-sm">{cfg.symbol}</span>
              {cfg.label}
            </span>
          ))}
        </div>
        <span className="ml-auto text-xs text-gray-400">셀 클릭 → 없음 → 권장 → 필수 → 분리 → 금지</span>
      </div>

      {/* 매트릭스 테이블 */}
      <div className="flex-1 overflow-auto p-3">
        <table className="border-collapse text-xs select-none">
          <thead>
            <tr>
              {/* 빈 코너 */}
              <th className="w-8 h-8" />
              {/* 열 헤더: 존 색상 인디케이터 + 이름 */}
              {rooms.map((room) => {
                const zc = ZONE_COLORS[room.zone as ZoneType] ?? ZONE_COLORS.public;
                return (
                  <th key={room.id} className="text-center pb-1" style={{ minWidth: 40 }}>
                    <div className="flex flex-col items-center gap-0.5">
                      <span
                        className="w-2 h-2 rounded-sm"
                        style={{ background: zc.border }}
                        title={zc.label}
                      />
                      <span
                        className="font-medium text-gray-600"
                        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: 10, lineHeight: 1.2 }}
                        title={room.name}
                      >
                        {truncate(room.name)}
                      </span>
                    </div>
                  </th>
                );
              })}
              <th className="pl-3 text-gray-400 font-normal text-left w-12">필수</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((rowRoom, ri) => {
              const zc = ZONE_COLORS[rowRoom.zone as ZoneType] ?? ZONE_COLORS.public;
              return (
                <tr key={rowRoom.id}>
                  {/* 행 헤더 */}
                  <td className="pr-2 py-0.5 text-right whitespace-nowrap">
                    <span className="flex items-center justify-end gap-1">
                      <span
                        className="w-2 h-2 rounded-sm flex-shrink-0"
                        style={{ background: zc.border }}
                      />
                      <span className="font-medium text-gray-600" title={rowRoom.name} style={{ fontSize: 10 }}>
                        {truncate(rowRoom.name)}
                      </span>
                    </span>
                  </td>

                  {/* 매트릭스 셀 */}
                  {rooms.map((colRoom, ci) => {
                    const isDiag = ri === ci;
                    const rel = isDiag
                      ? null
                      : getRelation(rowRoom.id, colRoom.id, connections);
                    const cfg = rel ? REL[rel] : null;

                    return (
                      <td key={colRoom.id} className="p-0.5">
                        {isDiag ? (
                          <div
                            className="flex items-center justify-center rounded"
                            style={{
                              width: 32, height: 26,
                              background: "#F3F4F6",
                              border: "1px solid #E5E7EB",
                            }}
                          >
                            <span style={{ color: "#D1D5DB", fontSize: 14 }}>—</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleClick(rowRoom.id, colRoom.id)}
                            title={`${rowRoom.name} ↔ ${colRoom.name}: ${cfg ? cfg.label : REL.none.label}`}
                            className="flex items-center justify-center rounded transition-all hover:scale-110 hover:shadow-sm"
                            style={{
                              width: 32, height: 26,
                              background: cfg ? cfg.bg : REL.none.bg,
                              border: `1px solid ${cfg ? cfg.border : REL.none.border}`,
                              cursor: "pointer",
                            }}
                          >
                            <span
                              style={{
                                fontSize: rel === "none" ? 16 : 13,
                                color: cfg ? cfg.color : REL.none.color,
                                fontWeight: rel === "required" || rel === "forbidden" ? 700 : 400,
                              }}
                            >
                              {cfg ? cfg.symbol : REL.none.symbol}
                            </span>
                          </button>
                        )}
                      </td>
                    );
                  })}

                  {/* 행 요약: 필수 개수 */}
                  <td className="pl-3 text-center">
                    {requiredCount(rowRoom.id) > 0 ? (
                      <span className="text-red-500 font-bold text-xs">
                        {requiredCount(rowRoom.id)}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">0</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
