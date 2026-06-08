"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { Room, Connection, ZONE_COLORS, ZoneType, FloorType, FLOOR_INFO, FLOORS } from "@/lib/floorPlanTypes";
import {
  CANVAS_W, CANVAS_H, QUAD_W, QUAD_H,
  FLOOR_QUADS, layoutByFloor,
  getRoomCenter, snapVal,
  setRelation, getRelation, cycleRelation,
  calcSatisfactionScore,
  computeSize, autoLayout,
} from "@/lib/floorPlanUtils";
import { parseRoomCSV, parsedRoomsToLayout, parseMatrixCSV } from "@/lib/csvParser";
import { useForceSimulation } from "@/hooks/useForceSimulation";

interface Props {
  rooms: Room[];
  connections: Connection[];
  onRoomsChange: (rooms: Room[]) => void;
  onConnectionsChange: (connections: Connection[]) => void;
}

type Mode = "select" | "connect" | "pin" | "delete";

export default function FloorPlanCanvas({
  rooms, connections, onRoomsChange, onConnectionsChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [mode, setMode] = useState<Mode>("select");
  const [connectSource, setConnectSource] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{ id: string; ox: number; oy: number } | null>(null);
  const [hoveredConn, setHoveredConn] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [showZoneGroups, setShowZoneGroups] = useState(false);
  const [multiFloor, setMultiFloor] = useState(false);
  const [pdfLoading, setPDFLoading] = useState(false);
  const [pdfError, setPDFError] = useState<string | null>(null);
  const [pdfSummary, setPDFSummary] = useState<{
    projectName?: string;
    floorComposition?: {
      summary: string;
      floors: Partial<Record<FloorType, string | null>>;
      circulationNotes?: string | null;
    } | null;
  } | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const sim = useForceSimulation(onRoomsChange);

  // Satisfaction metrics
  const { score: satisfactionScore, satisfiedIds } = calcSatisfactionScore(rooms, connections);

  const satisfiedRoomIds = new Set(
    rooms
      .filter((room) => {
        const req = connections.filter(
          (c) => (c.fromId === room.id || c.toId === room.id) && c.type === "required"
        );
        return req.length > 0 && req.every((c) => satisfiedIds.has(c.id));
      })
      .map((r) => r.id)
  );

  const missingRequiredCount = connections.filter(
    (c) => c.type === "required" && !satisfiedIds.has(c.id)
  ).length;

  const totalArea = rooms.reduce((s, r) => s + r.totalArea, 0);

  // Same-name core/circulation rooms across floors — used for visualization and sync force
  const syncPairs = useMemo<[Room, Room][]>(() => {
    if (!multiFloor) return [];
    const SYNC_ZONES: ZoneType[] = ['core', 'circulation'];
    const nameMap = new Map<string, Room[]>();
    for (const r of rooms) {
      if (!SYNC_ZONES.includes(r.zone)) continue;
      const key = r.name.trim().replace(/\s+/g, '').toLowerCase();
      if (!nameMap.has(key)) nameMap.set(key, []);
      nameMap.get(key)!.push(r);
    }
    const pairs: [Room, Room][] = [];
    for (const [, group] of nameMap) {
      if (group.length < 2) continue;
      const floors = new Set(group.map((r) => r.floor ?? '1F'));
      if (floors.size < 2) continue;
      for (let i = 0; i < group.length - 1; i++) {
        for (let j = i + 1; j < group.length; j++) {
          pairs.push([group[i], group[j]]);
        }
      }
    }
    return pairs;
  }, [rooms, multiFloor]);

  // Zone group bounding boxes
  const zoneGroupRects = showZoneGroups && !multiFloor
    ? (Object.entries(ZONE_COLORS) as [ZoneType, typeof ZONE_COLORS[ZoneType]][]).flatMap(([zone, zc]) => {
        const zRooms = rooms.filter((r) => r.zone === zone);
        if (zRooms.length < 2) return [];
        const pad = 14;
        const minX = Math.min(...zRooms.map((r) => r.x)) - pad;
        const minY = Math.min(...zRooms.map((r) => r.y)) - pad;
        const maxX = Math.max(...zRooms.map((r) => r.x + r.width)) + pad;
        const maxY = Math.max(...zRooms.map((r) => r.y + r.height)) + pad;
        return [{ zone, zc, x: minX, y: minY, w: maxX - minX, h: maxY - minY }];
      })
    : [];

  // SVG coordinate conversion
  const getSVGCoords = useCallback((e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (CANVAS_W / rect.width),
      y: (e.clientY - rect.top) * (CANVAS_H / rect.height),
    };
  }, []);

  // Toggle multi-floor: re-layout rooms into quadrants (or back to full canvas)
  const toggleMultiFloor = useCallback(() => {
    if (!multiFloor) {
      sim.stop();
      const laid = layoutByFloor(rooms, totalArea);
      onRoomsChange(laid);
      setPinnedIds(new Set());
      setMultiFloor(true);
    } else {
      const laid = autoLayout(rooms, totalArea);
      onRoomsChange(laid);
      setMultiFloor(false);
    }
  }, [multiFloor, rooms, totalArea, onRoomsChange, sim]);

  // Change floor of selected room
  const changeSelectedFloor = useCallback((floor: FloorType) => {
    if (!selectedId) return;
    const updated = rooms.map((r) =>
      r.id === selectedId ? { ...r, floor } : r
    );
    const laid = layoutByFloor(updated, totalArea);
    onRoomsChange(laid);
  }, [selectedId, rooms, totalArea, onRoomsChange]);

  const handleRoomMouseDown = useCallback(
    (e: React.MouseEvent, room: Room) => {
      e.stopPropagation();

      // Pin mode: toggle pin (works during simulation too)
      if (mode === "pin") {
        const cx = room.x + room.width / 2;
        const cy = room.y + room.height / 2;
        setPinnedIds((prev) => {
          const next = new Set(prev);
          if (next.has(room.id)) {
            next.delete(room.id);
            sim.unpinNode(room.id);
          } else {
            next.add(room.id);
            sim.pinNode(room.id, cx, cy);
          }
          return next;
        });
        return;
      }

      if (sim.isRunning) return;

      if (mode === "connect") {
        if (!connectSource) {
          setConnectSource(room.id);
          setSelectedId(room.id);
        } else if (connectSource !== room.id) {
          const current = getRelation(connectSource, room.id, connections);
          const next = cycleRelation(current);
          onConnectionsChange(setRelation(connectSource, room.id, next, connections));
          setConnectSource(null);
          setSelectedId(null);
        }
        return;
      }
      if (mode === "delete") { setSelectedId(room.id); return; }

      const { x, y } = getSVGCoords(e);
      setDragState({ id: room.id, ox: x - room.x, oy: y - room.y });
      setSelectedId(room.id);
    },
    [mode, connectSource, connections, getSVGCoords, onConnectionsChange, sim]
  );

  const handleSVGMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragState || sim.isRunning || mode === "pin") return;
      const { x, y } = getSVGCoords(e);

      if (multiFloor) {
        const room = rooms.find((r) => r.id === dragState.id);
        const floor: FloorType = room?.floor ?? '1F';
        const quad = FLOOR_QUADS[floor];
        const newX = snapVal(Math.max(quad.x, Math.min(quad.x + quad.w - (room?.width ?? 0), x - dragState.ox)));
        const newY = snapVal(Math.max(quad.y, Math.min(quad.y + quad.h - (room?.height ?? 0), y - dragState.oy)));
        onRoomsChange(rooms.map((r) => r.id === dragState.id ? { ...r, x: newX, y: newY } : r));
        return;
      }

      const newX = snapVal(Math.max(0, x - dragState.ox));
      const newY = snapVal(Math.max(0, y - dragState.oy));
      onRoomsChange(rooms.map((r) => r.id === dragState.id ? { ...r, x: newX, y: newY } : r));
    },
    [dragState, getSVGCoords, rooms, onRoomsChange, sim.isRunning, mode, multiFloor]
  );

  const handleSVGMouseUp = useCallback(() => setDragState(null), []);

  const handleSVGClick = useCallback(() => {
    setSelectedId(null);
    if (mode === "connect") setConnectSource(null);
  }, [mode]);

  const handleConnClick = useCallback(
    (e: React.MouseEvent, conn: Connection) => {
      e.stopPropagation();
      if (mode === "delete") {
        onConnectionsChange(connections.filter((c) => c.id !== conn.id));
        return;
      }
      onConnectionsChange(
        connections.map((c) =>
          c.id === conn.id
            ? { ...c, type: c.type === "required" ? "preferred" : "required" }
            : c
        )
      );
    },
    [mode, connections, onConnectionsChange]
  );

  // PDF 설계지침서 업로드
  const handlePDFUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;

      setPDFLoading(true);
      setPDFError(null);

      try {
        const formData = new FormData();
        formData.append("pdf", file);

        const res = await fetch("/api/parse-pdf", { method: "POST", body: formData });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "PDF 파싱 실패");
        }

        const data = await res.json() as {
          projectName?: string;
          totalArea?: number;
          floorComposition?: {
            summary: string;
            floors: Partial<Record<FloorType, string | null>>;
            circulationNotes?: string | null;
          } | null;
          rooms: {
            id?: string;
            name: string;
            area: number;
            count?: number;
            zone: ZoneType;
            floor?: FloorType | null;
            adjacency?: string[];
            required?: string[];
          }[];
        };

        if (!data.rooms?.length) throw new Error("공간 정보를 찾을 수 없습니다");

        const sumArea = data.rooms.reduce((s, r) => s + r.area * (r.count ?? 1), 0);
        const newRooms: Room[] = data.rooms.map((r, i) => ({
          id: r.id || `pdf-r${i}`,
          name: r.name,
          area: r.area,
          count: r.count ?? 1,
          totalArea: r.area * (r.count ?? 1),
          zone: r.zone,
          floor: r.floor ?? undefined,
          x: 0, y: 0,
          ...computeSize(r.area * (r.count ?? 1), sumArea),
        }));

        const hasFloors = newRooms.some((r) => r.floor);
        const laidOut = hasFloors
          ? layoutByFloor(newRooms, sumArea)
          : autoLayout(newRooms, sumArea);

        // Store PDF analysis summary
        setPDFSummary({
          projectName: data.projectName,
          floorComposition: data.floorComposition ?? null,
        });
        setShowSummary(!!data.floorComposition);

        const seen = new Set<string>();
        const newConns: Connection[] = [];
        data.rooms.forEach((r, i) => {
          if (!r.adjacency?.length) return;
          const fromId = laidOut[i]?.id;
          if (!fromId) return;
          r.adjacency.forEach((adjName) => {
            const toRoom = laidOut.find(
              (lr) => lr.name === adjName || lr.name.includes(adjName) || adjName.includes(lr.name)
            );
            if (!toRoom || toRoom.id === fromId) return;
            const key = [fromId, toRoom.id].sort().join("|");
            if (seen.has(key)) return;
            seen.add(key);
            const isReq = (r.required ?? []).some(
              (req) => req === adjName || adjName.includes(req) || req.includes(adjName)
            );
            newConns.push({
              id: `pdf-c-${fromId}-${toRoom.id}`,
              fromId, toId: toRoom.id,
              type: isReq ? "required" : "preferred",
            });
          });
        });

        onRoomsChange(laidOut);
        onConnectionsChange(newConns);
        setPinnedIds(new Set());
        setMultiFloor(hasFloors);
      } catch (err) {
        setPDFError(err instanceof Error ? err.message : "오류 발생");
      } finally {
        setPDFLoading(false);
      }
    },
    [onRoomsChange, onConnectionsChange]
  );

  // Export JSON
  const handleExportJSON = useCallback(() => {
    const data = {
      rooms: rooms.map((r) => ({ ...r })),
      connections: connections.map((c) => ({ ...c })),
      totalArea, satisfactionScore,
      multiFloor,
      pinnedIds: [...pinnedIds],
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `floor-plan-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [rooms, connections, totalArea, satisfactionScore, multiFloor, pinnedIds]);

  // CSV handlers
  const handleCSVRooms = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const csv = ev.target?.result as string;
        const parsed = parseRoomCSV(csv);
        if (!parsed.length) return;
        const laid = parsedRoomsToLayout(parsed);
        onRoomsChange(laid);
        onConnectionsChange([]);
        setPinnedIds(new Set());
        setMultiFloor(false);
      };
      reader.readAsText(file);
    },
    [onRoomsChange, onConnectionsChange]
  );

  const handleCSVMatrix = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const csv = ev.target?.result as string;
        const parsed = parseMatrixCSV(csv);
        const newConns: Connection[] = parsed.map((c, i) => ({
          id: `csv-c-${i}-${c.fromId}-${c.toId}`,
          fromId: c.fromId, toId: c.toId, type: c.type,
        }));
        onConnectionsChange(newConns);
      };
      reader.readAsText(file);
    },
    [onConnectionsChange]
  );

  const modeBtn = (m: Mode, label: string, icon: string) => (
    <button
      key={m}
      onClick={() => { setMode(m); setConnectSource(null); setSelectedId(null); }}
      disabled={(sim.isRunning && m !== "pin") || (multiFloor && m === "connect")}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        mode === m
          ? m === "pin"
            ? "bg-orange-500 text-white"
            : "bg-gray-900 text-white"
          : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
      }`}
    >
      <span>{icon}</span>{label}
    </button>
  );

  const selectedRoom = rooms.find((r) => r.id === selectedId);

  return (
    <div className="flex flex-col h-full bg-[#f5f4f0]">
      {/* Toolbar */}
      <div className="flex flex-col flex-shrink-0 bg-white border-b border-gray-100">
        <div className="flex items-center gap-1.5 px-3 py-2 flex-wrap">
          {/* Mode buttons */}
          <span className="text-xs font-semibold text-gray-400">모드</span>
          {modeBtn("select", "이동", "↖")}
          {!multiFloor && modeBtn("connect", "연결", "🔗")}
          {modeBtn("pin", "핀", "📌")}
          {modeBtn("delete", "삭제", "✕")}

          <span className="w-px h-5 bg-gray-200 mx-1 flex-shrink-0" />

          {/* Simulation — visible in both modes; multiFloor=true → per-floor + core sync */}
          <span className="text-xs font-semibold text-gray-400">{multiFloor ? "층별" : "배치"}</span>
          <button
            onClick={() => sim.run(rooms, connections, false, pinnedIds, multiFloor)}
            disabled={rooms.length === 0}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-30 ${
              sim.isRunning
                ? "bg-green-100 text-green-700 border border-green-300"
                : "bg-green-600 text-white hover:bg-green-700"
            }`}
          >
            {sim.isRunning
              ? <><span className="inline-block animate-spin">◌</span> 실행중</>
              : <><span>▶</span> {multiFloor ? "층별 최적화" : "최적화"}</>}
          </button>
          <button
            onClick={() => sim.run(rooms, connections, true, pinnedIds, multiFloor)}
            disabled={rooms.length === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors disabled:opacity-30"
          >
            🔀 {multiFloor ? "층내 흔들기" : "흔들기"}
          </button>
          {sim.isRunning && (
            <button onClick={sim.stop} className="px-2 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200">⏹</button>
          )}
          {pinnedIds.size > 0 && (
            <button
              onClick={() => setPinnedIds(new Set())}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100"
              title="전체 고정 해제"
            >
              📌 {pinnedIds.size}개 ✕
            </button>
          )}

          {!multiFloor && (
            <>
              <span className="w-px h-5 bg-gray-200 mx-1 flex-shrink-0" />
              <span className="text-xs text-gray-500">강도</span>
              <input
                type="range" min="0.3" max="2.0" step="0.1"
                value={sim.linkStrength}
                onChange={(e) => sim.setLinkStrength(parseFloat(e.target.value))}
                className="w-16 accent-green-600"
                title={`연결 강도: ${sim.linkStrength.toFixed(1)}`}
              />
            </>
          )}

          {/* Floor assignment for selected room (multi-floor mode only) */}
          {multiFloor && selectedRoom && (
            <>
              <span className="w-px h-5 bg-gray-200 mx-1 flex-shrink-0" />
              <span className="text-xs font-semibold text-gray-500">층 배정</span>
              {FLOORS.map((f) => {
                const fi = FLOOR_INFO[f];
                const isActive = (selectedRoom.floor ?? '1F') === f;
                return (
                  <button
                    key={f}
                    onClick={() => changeSelectedFloor(f)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                      isActive
                        ? 'text-white border-transparent'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                    }`}
                    style={isActive ? { background: fi.borderColor, borderColor: fi.borderColor } : {}}
                  >
                    {fi.shortLabel}
                  </button>
                );
              })}
            </>
          )}

          {/* Satisfaction score */}
          {!multiFloor && connections.length > 0 && (
            <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold border ${
              satisfactionScore >= 80
                ? "bg-green-50 text-green-700 border-green-200"
                : satisfactionScore >= 50
                ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                : "bg-red-50 text-red-600 border-red-200"
            }`}>
              {satisfactionScore >= 80 ? "✓" : satisfactionScore >= 50 ? "△" : "!"} 만족도 {satisfactionScore}%
            </div>
          )}

          {/* Right side buttons */}
          <div className="ml-auto flex items-center gap-1">
            {/* PDF 분석 결과 보기 */}
            {pdfSummary?.floorComposition && (
              <button
                onClick={() => setShowSummary((v) => !v)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  showSummary
                    ? "bg-sky-600 text-white border-sky-700"
                    : "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100"
                }`}
                title="층별 구성 분석 결과"
              >
                📋 층별 분석
              </button>
            )}
            {/* Multi-floor toggle */}
            <button
              onClick={toggleMultiFloor}
              disabled={rooms.length === 0}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-30 ${
                multiFloor
                  ? "bg-indigo-600 text-white border-indigo-700"
                  : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
              }`}
              title="층별 2×2 뷰"
            >
              🏢 층별뷰
            </button>

            {!multiFloor && (
              <button
                onClick={() => setShowZoneGroups((v) => !v)}
                disabled={rooms.length === 0}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-30 ${
                  showZoneGroups
                    ? "bg-purple-100 text-purple-700 border-purple-300"
                    : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                }`}
              >
                ◎ Zone
              </button>
            )}

            {rooms.length > 0 && (
              <button
                onClick={handleExportJSON}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 transition-colors"
              >
                💾 JSON
              </button>
            )}
            <label className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 cursor-pointer transition-colors">
              📂 실 CSV
              <input type="file" accept=".csv" className="hidden" onChange={handleCSVRooms} />
            </label>
            <label className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 cursor-pointer transition-colors">
              🔗 매트릭스
              <input type="file" accept=".csv" className="hidden" onChange={handleCSVMatrix} />
            </label>
            <label className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
              pdfLoading
                ? "bg-blue-50 text-blue-400 border-blue-200 cursor-wait"
                : "bg-blue-600 text-white border-blue-700 hover:bg-blue-700"
            }`}>
              {pdfLoading
                ? <><span className="inline-block animate-spin">◌</span> 분석중…</>
                : <>📄 지침서 PDF</>}
              <input type="file" accept=".pdf" className="hidden" disabled={pdfLoading} onChange={handlePDFUpload} />
            </label>
          </div>
        </div>

        {/* Status bar */}
        {pdfError && (
          <div className="px-4 py-1 bg-red-50 border-t border-red-100 text-xs text-red-700 flex items-center justify-between">
            <span>⚠ PDF 오류: {pdfError}</span>
            <button onClick={() => setPDFError(null)} className="ml-2 text-red-400 hover:text-red-700">✕</button>
          </div>
        )}
        {pdfLoading && (
          <div className="px-4 py-1 bg-blue-50 border-t border-blue-100 text-xs text-blue-700 flex items-center gap-2">
            <span className="inline-block animate-pulse">●</span>
            Claude가 설계 지침서에서 공간 프로그램을 분석 중입니다…
          </div>
        )}
        {multiFloor && (
          <div className="px-4 py-1 bg-indigo-50 border-t border-indigo-100 text-xs text-indigo-700 flex items-center gap-2">
            <span>🏢</span>
            층별 2×2 뷰 · ▶ 층별 최적화로 각 층 내 자동 정렬
            {syncPairs.length > 0 && (
              <span className="text-indigo-500 font-medium">· 🔗 코어 {syncPairs.length}쌍 동기화 연동</span>
            )}
            <button
              onClick={toggleMultiFloor}
              className="ml-auto text-indigo-500 underline hover:text-indigo-800 font-medium"
            >
              단일 뷰로 전환
            </button>
          </div>
        )}
        {mode === "pin" && !multiFloor && (
          <div className="px-4 py-1 bg-orange-50 border-t border-orange-100 text-xs text-orange-700">
            📌 방을 클릭하면 고정/해제 — 고정된 방은 시뮬레이션 중 움직이지 않습니다
          </div>
        )}
        {!multiFloor && mode === "connect" && connectSource && (
          <div className="px-4 py-1 bg-blue-50 border-t border-blue-100 text-xs text-blue-700">
            &ldquo;{rooms.find((r) => r.id === connectSource)?.name}&rdquo; →연결할 공간 클릭
          </div>
        )}
        {!sim.isRunning && !multiFloor && missingRequiredCount > 0 && mode !== "pin" && (
          <div className="px-4 py-1 bg-amber-50 border-t border-amber-100 text-xs text-amber-700 flex items-center gap-2">
            <span>⚠</span> 필수 인접 미충족 {missingRequiredCount}쌍 ·&nbsp;
            <button onClick={() => sim.run(rooms, connections, false, pinnedIds)} className="underline font-semibold hover:text-amber-900">
              ▶ 최적화 실행
            </button>으로 자동 배치
          </div>
        )}
        {sim.isRunning && (
          <div className="px-4 py-1 bg-green-50 border-t border-green-100 text-xs text-green-700 flex items-center gap-2">
            <span className="inline-block animate-pulse">●</span>
            시뮬레이션 진행 중…
            {pinnedIds.size > 0 && <span className="text-orange-600">📌 {pinnedIds.size}개 고정됨</span>}
          </div>
        )}
      </div>

      {/* SVG canvas */}
      <div className="flex-1 overflow-hidden relative min-h-0">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          className="w-full h-full"
          style={{
            cursor: mode === "pin"
              ? "cell"
              : sim.isRunning
              ? "not-allowed"
              : mode === "connect"
              ? "crosshair"
              : "default",
          }}
          onMouseMove={handleSVGMouseMove}
          onMouseUp={handleSVGMouseUp}
          onMouseLeave={handleSVGMouseUp}
          onClick={handleSVGClick}
        >
          <defs>
            <pattern id="fp-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e0d8" strokeWidth="0.5" />
            </pattern>
            <filter id="glow-green">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            {/* Clip paths for each quadrant */}
            {FLOORS.map((floor) => {
              const q = FLOOR_QUADS[floor];
              return (
                <clipPath key={`clip-${floor}`} id={`clip-${floor}`}>
                  <rect x={q.x} y={q.y} width={q.w} height={q.h} />
                </clipPath>
              );
            })}
          </defs>
          <rect width={CANVAS_W} height={CANVAS_H} fill="url(#fp-grid)" />

          {/* Multi-floor quadrant grid */}
          {multiFloor && (
            <>
              {/* Quadrant backgrounds and labels */}
              {FLOORS.map((floor) => {
                const fi = FLOOR_INFO[floor];
                const isRight = floor === '1F' || floor === '3F';
                const isBottom = floor === '2F' || floor === '3F';
                const qx = isRight ? QUAD_W : 0;
                const qy = isBottom ? QUAD_H : 0;
                const fRooms = rooms.filter((r) => (r.floor ?? '1F') === floor);
                const fArea = fRooms.reduce((s, r) => s + r.totalArea, 0);

                return (
                  <g key={floor}>
                    {/* Quadrant tinted background */}
                    <rect x={qx} y={qy} width={QUAD_W} height={QUAD_H}
                      fill={fi.bgColor} fillOpacity={0.45} />
                    {/* Label bar */}
                    <rect x={qx} y={qy} width={QUAD_W} height={22}
                      fill={fi.borderColor} fillOpacity={0.18} />
                    {/* Floor name */}
                    <text x={qx + 8} y={qy + 15} fontSize={11} fontWeight="700" fill={fi.borderColor}>
                      {fi.label}
                    </text>
                    {/* Room count + area */}
                    <text x={qx + QUAD_W - 8} y={qy + 15} fontSize={10} fill={fi.borderColor} textAnchor="end" opacity={0.85}>
                      {fArea > 0 ? `${fArea}m²  ·  ${fRooms.length}실` : '—'}
                    </text>
                  </g>
                );
              })}
              {/* Divider lines */}
              <line x1={QUAD_W} y1={0} x2={QUAD_W} y2={CANVAS_H} stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="8 4" />
              <line x1={0} y1={QUAD_H} x2={CANVAS_W} y2={QUAD_H} stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="8 4" />
            </>
          )}

          {/* Core sync alignment guides between matching rooms across floors */}
          {multiFloor && syncPairs.map(([r1, r2], i) => {
            const cx1 = r1.x + r1.width / 2;
            const cy1 = r1.y + r1.height / 2;
            const cx2 = r2.x + r2.width / 2;
            const cy2 = r2.y + r2.height / 2;
            return (
              <line key={`sync-${i}`}
                x1={cx1} y1={cy1} x2={cx2} y2={cy2}
                stroke="#6366f1" strokeWidth={1.2} strokeDasharray="3 6"
                opacity={0.28} style={{ pointerEvents: "none" }} />
            );
          })}

          {/* Zone group outlines (single-floor mode only) */}
          {zoneGroupRects.map(({ zone, zc, x, y, w, h }) => (
            <g key={zone} style={{ pointerEvents: "none" }}>
              <rect x={x} y={y} width={w} height={h} rx={14}
                fill={zc.bg} fillOpacity={0.3}
                stroke={zc.border} strokeWidth={2} strokeDasharray="10 5" />
              <rect x={x + 4} y={y + 3} width={38} height={14} rx={4} fill={zc.border} opacity={0.9} />
              <text x={x + 8} y={y + 13} fontSize={9} fill="white" fontWeight="700">
                {zc.label} 존
              </text>
            </g>
          ))}

          {/* Connection lines */}
          {connections.map((conn) => {
            const from = rooms.find((r) => r.id === conn.fromId);
            const to = rooms.find((r) => r.id === conn.toId);
            if (!from || !to) return null;

            const isSatisfied = satisfiedIds.has(conn.id);
            const isReq = conn.type === "required";
            const isHov = hoveredConn === conn.id;
            const color = isSatisfied ? "#16A34A" : isReq ? "#F59E0B" : "#9CA3AF";
            const { cx: x1, cy: y1 } = getRoomCenter(from);
            const { cx: x2, cy: y2 } = getRoomCenter(to);
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const label = isSatisfied ? (isReq ? "✓ 필수" : "✓ 권장") : (isReq ? "⚠ 필수" : "권장");

            return (
              <g key={conn.id}>
                <line x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="transparent" strokeWidth={14}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => handleConnClick(e, conn)}
                  onMouseEnter={() => setHoveredConn(conn.id)}
                  onMouseLeave={() => setHoveredConn(null)}
                />
                <line x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={color}
                  strokeWidth={isHov ? 3.5 : isReq ? 2.5 : 1.5}
                  strokeDasharray={!isSatisfied && !isReq ? "6 4" : "none"}
                  strokeLinecap="round"
                  opacity={isSatisfied ? 1 : 0.72}
                  style={{ pointerEvents: "none" }}
                />
                {(isHov || (!isSatisfied && isReq && !multiFloor)) && (
                  <>
                    <rect x={mx - 18} y={my - 8} width={36} height={15} rx={4}
                      fill="white" stroke={color} strokeWidth={1} style={{ pointerEvents: "none" }} />
                    <text x={mx} y={my + 3} textAnchor="middle" fontSize={8}
                      fill={color} fontWeight={isReq ? "700" : "400"} style={{ pointerEvents: "none" }}>
                      {label}
                    </text>
                  </>
                )}
              </g>
            );
          })}

          {/* Room blocks */}
          {rooms.map((room) => {
            const zc = ZONE_COLORS[room.zone as ZoneType] ?? ZONE_COLORS.public;
            const fi = multiFloor ? FLOOR_INFO[room.floor ?? '1F'] : null;
            const isSel = selectedId === room.id;
            const isSrc = connectSource === room.id;
            const isSatisfied = !multiFloor && satisfiedRoomIds.has(room.id);
            const isPinned = pinnedIds.has(room.id);
            const isSmall = room.width < 80;

            return (
              <g
                key={room.id}
                style={{
                  cursor: mode === "pin"
                    ? "cell"
                    : sim.isRunning
                    ? "not-allowed"
                    : mode === "select"
                    ? "grab"
                    : "pointer",
                }}
                onMouseDown={(e) => handleRoomMouseDown(e, room)}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Satisfaction glow */}
                {isSatisfied && (
                  <rect x={room.x - 5} y={room.y - 5} width={room.width + 10} height={room.height + 10}
                    rx={8} fill="none" stroke="#16A34A" strokeWidth={2.5} opacity={0.55}
                    filter="url(#glow-green)" style={{ pointerEvents: "none" }} />
                )}

                {/* Pin indicator */}
                {isPinned && (
                  <rect x={room.x - 3} y={room.y - 3} width={room.width + 6} height={room.height + 6}
                    rx={6} fill="none" stroke="#F97316" strokeWidth={2.5} strokeDasharray="6 3"
                    style={{ pointerEvents: "none" }} />
                )}

                {/* Selection ring */}
                {(isSel || isSrc) && (
                  <rect x={room.x - 3} y={room.y - 3} width={room.width + 6} height={room.height + 6}
                    rx={6} fill="none"
                    stroke={isSrc ? "#2563EB" : multiFloor ? (fi?.borderColor ?? "#374151") : "#374151"}
                    strokeWidth={2.5}
                    strokeDasharray={isSrc ? "6 3" : "none"} />
                )}

                {/* Room rect */}
                <rect x={room.x} y={room.y} width={room.width} height={room.height}
                  rx={4} fill={zc.bg}
                  stroke={isPinned ? "#F97316" : isSatisfied ? "#16A34A" : zc.border}
                  strokeWidth={isPinned || isSatisfied ? 2 : 1.5} />

                {/* Zone color bar */}
                <rect x={room.x} y={room.y} width={room.width} height={5} rx={4} fill={zc.border} />
                <rect x={room.x} y={room.y + 2} width={room.width} height={3} fill={zc.border} />

                {/* Floor badge (multi-floor mode) */}
                {multiFloor && fi && (
                  <rect x={room.x + room.width - 20} y={room.y + 1} width={18} height={12} rx={3}
                    fill={fi.borderColor} opacity={0.85} style={{ pointerEvents: "none" }} />
                )}
                {multiFloor && fi && (
                  <text x={room.x + room.width - 11} y={room.y + 10}
                    textAnchor="middle" fontSize={8} fill="white" fontWeight="700"
                    style={{ pointerEvents: "none", userSelect: "none" }}>
                    {fi.shortLabel}
                  </text>
                )}

                {/* Pin icon */}
                {isPinned && (
                  <text x={room.x + room.width - 3} y={room.y + 15}
                    textAnchor="end" fontSize={11}
                    style={{ pointerEvents: "none", userSelect: "none" }}>
                    📌
                  </text>
                )}

                <text
                  x={room.x + room.width / 2}
                  y={room.y + (isSmall ? room.height / 2 + 2 : room.height / 2 - 4)}
                  textAnchor="middle" fontSize={isSmall ? 9 : 11} fontWeight="700" fill={zc.text}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {room.count > 1 ? `${room.name} ×${room.count}` : room.name}
                </text>
                {!isSmall && (
                  <text
                    x={room.x + room.width / 2}
                    y={room.y + room.height / 2 + 11}
                    textAnchor="middle" fontSize={9} fill={zc.text} opacity={0.65}
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {room.totalArea}m²
                  </text>
                )}
              </g>
            );
          })}

          {rooms.length === 0 && (
            <>
              <text x={CANVAS_W / 2} y={CANVAS_H / 2 - 16} textAnchor="middle" fontSize={14} fill="#9CA3AF">
                왼쪽 채팅창에 공모전 요강 또는 실 목록을 입력하세요
              </text>
              <text x={CANVAS_W / 2} y={CANVAS_H / 2 + 8} textAnchor="middle" fontSize={11} fill="#C4B9A8">
                또는 툴바의 &ldquo;실 CSV&rdquo; / &ldquo;지침서 PDF&rdquo; 로 데이터를 불러오세요
              </text>
              <text x={CANVAS_W / 2} y={CANVAS_H / 2 + 26} textAnchor="middle" fontSize={10} fill="#D1C4B5">
                예: &ldquo;로비 100m², 사무실 200m², 회의실 40m² × 3, 화장실 20m²&rdquo;
              </text>
            </>
          )}
        </svg>

        {/* PDF Floor Composition Analysis Panel */}
        {showSummary && pdfSummary?.floorComposition && (
          <div className="absolute top-3 left-3 bg-white/97 backdrop-blur-sm rounded-2xl shadow-lg border border-sky-100 p-4 max-w-[300px] z-10">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="text-xs font-bold text-gray-800 leading-tight">
                  {pdfSummary.projectName ?? "설계공모 지침서 분석"}
                </div>
                <div className="text-[10px] text-sky-600 font-medium mt-0.5">층별 구성 계획</div>
              </div>
              <button
                onClick={() => setShowSummary(false)}
                className="text-gray-300 hover:text-gray-500 flex-shrink-0 mt-0.5"
              >✕</button>
            </div>

            {/* Summary text */}
            <p className="text-[11px] text-gray-600 leading-relaxed mb-3 border-b border-gray-100 pb-3">
              {pdfSummary.floorComposition.summary}
            </p>

            {/* Per-floor descriptions */}
            <div className="space-y-2">
              {FLOORS.map((floor) => {
                const desc = pdfSummary.floorComposition?.floors?.[floor];
                if (!desc) return null;
                const fi = FLOOR_INFO[floor];
                const fRooms = rooms.filter((r) => (r.floor ?? '1F') === floor);
                const fArea = fRooms.reduce((s, r) => s + r.totalArea, 0);
                return (
                  <div key={floor} className="flex gap-2">
                    <div
                      className="flex-shrink-0 w-6 h-5 rounded text-[9px] font-bold flex items-center justify-center text-white mt-0.5"
                      style={{ background: fi.borderColor }}
                    >
                      {fi.shortLabel}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-gray-700 leading-snug">{desc}</div>
                      {fArea > 0 && (
                        <div className="text-[9px] mt-0.5" style={{ color: fi.borderColor }}>
                          {fArea}m² · {fRooms.length}실 배정됨
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Circulation notes */}
            {pdfSummary.floorComposition.circulationNotes && (
              <div className="mt-3 pt-2 border-t border-gray-100">
                <div className="text-[10px] font-semibold text-gray-500 mb-1">동선 계획</div>
                <div className="text-[10px] text-gray-600 leading-snug">
                  {pdfSummary.floorComposition.circulationNotes}
                </div>
              </div>
            )}

            {/* Action hint */}
            <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between">
              <span className="text-[10px] text-gray-400">방 선택 → 층 배정 변경 가능</span>
              {!multiFloor && (
                <button
                  onClick={toggleMultiFloor}
                  className="text-[10px] text-indigo-600 font-semibold hover:text-indigo-800 underline"
                >
                  층별뷰 열기
                </button>
              )}
            </div>
          </div>
        )}

        {/* Stats overlay */}
        {rooms.length > 0 && (
          <div className="absolute top-3 right-3 bg-white/92 backdrop-blur-sm rounded-xl p-3 shadow-sm border border-gray-100 min-w-[180px]">
            <div className="text-xs font-bold text-gray-700 mb-1.5 flex items-center justify-between">
              <span>{multiFloor ? "층별 면적" : "면적 요약"}</span>
              {!multiFloor && connections.length > 0 && (
                <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                  satisfactionScore >= 80 ? "text-green-700" :
                  satisfactionScore >= 50 ? "text-yellow-700" : "text-red-600"
                }`}>{satisfactionScore}%</span>
              )}
            </div>

            {multiFloor ? (
              <div className="space-y-1">
                {FLOORS.map((floor) => {
                  const fi = FLOOR_INFO[floor];
                  const fRooms = rooms.filter((r) => (r.floor ?? '1F') === floor);
                  if (!fRooms.length) return null;
                  const fArea = fRooms.reduce((s, r) => s + r.totalArea, 0);
                  return (
                    <div key={floor} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: fi.borderColor }} />
                        <span className="text-gray-600">{fi.label}</span>
                      </span>
                      <span className="font-medium text-gray-800">{fArea}m²</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-1">
                {(Object.entries(ZONE_COLORS) as [ZoneType, typeof ZONE_COLORS[ZoneType]][]).map(([zone, zc]) => {
                  const zRooms = rooms.filter((r) => r.zone === zone);
                  if (!zRooms.length) return null;
                  const total = zRooms.reduce((s, r) => s + r.totalArea, 0);
                  return (
                    <div key={zone} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm" style={{ background: zc.border }} />
                        <span className="text-gray-600">{zc.label}</span>
                      </span>
                      <span className="font-medium text-gray-800">{total}m²</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="border-t border-gray-100 mt-2 pt-2 space-y-0.5">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-gray-700">합계</span>
                <span className="font-bold text-gray-900">{totalArea}m²</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>실 {rooms.length}개</span>
                <span>연결 {connections.length}</span>
              </div>
              {pinnedIds.size > 0 && (
                <div className="flex justify-between text-xs text-orange-500">
                  <span>📌 고정</span><span>{pinnedIds.size}개</span>
                </div>
              )}
              {!multiFloor && connections.length > 0 && (
                <div className={`flex justify-between text-xs font-semibold ${
                  satisfactionScore >= 80 ? "text-green-600" :
                  satisfactionScore >= 50 ? "text-yellow-600" : "text-red-500"
                }`}>
                  <span>연결 만족도</span><span>{satisfactionScore}%</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Zone legend (single-floor only) */}
        {rooms.length > 0 && !multiFloor && (
          <div className="absolute bottom-3 right-3 bg-white/85 backdrop-blur-sm rounded-xl px-3 py-2 shadow-sm border border-gray-100 flex gap-3 flex-wrap text-xs text-gray-500">
            {(Object.entries(ZONE_COLORS) as [ZoneType, typeof ZONE_COLORS[ZoneType]][]).map(([zone, zc]) => (
              <span key={zone} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: zc.border }} />
                {zc.label}
              </span>
            ))}
          </div>
        )}

        {/* Floor legend (multi-floor) */}
        {rooms.length > 0 && multiFloor && (
          <div className="absolute bottom-3 left-3 bg-white/85 backdrop-blur-sm rounded-xl px-3 py-2 shadow-sm border border-gray-100 text-xs text-gray-500">
            방 선택 후 툴바에서 층 배정 변경
          </div>
        )}

        {/* Hint */}
        {mode === "pin" && !multiFloor ? (
          <div className="absolute top-3 left-3 text-xs text-orange-600 bg-orange-50/90 backdrop-blur-sm px-2 py-1 rounded border border-orange-200">
            📌 클릭: 고정/해제
          </div>
        ) : !sim.isRunning && !multiFloor ? (
          <div className="absolute top-3 left-3 text-xs text-gray-400 bg-white/70 px-2 py-1 rounded">
            {dragState ? "드래그 중…" : "드래그: 이동 · 8px 스냅"}
          </div>
        ) : null}
      </div>
    </div>
  );
}
