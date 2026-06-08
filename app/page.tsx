"use client";

import { useState, useCallback, useMemo } from "react";
import SpaceChatPanel from "@/components/SpaceChatPanel";
import FloorPlanCanvas from "@/components/FloorPlanCanvas";
import AdjacencyMatrix from "@/components/AdjacencyMatrix";
import ValidationIssuesPanel from "@/components/ValidationIssuesPanel";
import { Room, Connection, SpaceProgram } from "@/lib/floorPlanTypes";
import { autoLayout, calcSatisfactionScore } from "@/lib/floorPlanUtils";
import { validateLayoutIssues, validateSpaceProgram, ValidationIssue } from "@/lib/programValidation";

export default function Home() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [programTotalArea, setProgramTotalArea] = useState<number | undefined>();
  const [showMatrix, setShowMatrix] = useState(false);
  const [showValidationPanel, setShowValidationPanel] = useState(false);

  const handleProgramUpdate = useCallback((program: SpaceProgram) => {
    const laid = autoLayout(program.rooms, program.totalArea || 1);
    setRooms(laid);
    setConnections(program.connections || []);
    setProgramTotalArea(program.totalArea);
    // 공간이 들어오면 매트릭스 자동으로 열기
    setShowMatrix(true);
  }, []);

  const validationIssues = useMemo<ValidationIssue[]>(() => {
    if (rooms.length === 0) return [];
    const programValidation = validateSpaceProgram({
      rooms,
      connections,
      totalArea: programTotalArea ?? rooms.reduce((sum, room) => sum + room.totalArea, 0),
    });
    const satisfaction = calcSatisfactionScore(rooms, connections);
    const layoutIssues = validateLayoutIssues(rooms, connections, satisfaction.satisfiedIds);
    return [...programValidation.issues, ...layoutIssues];
  }, [rooms, connections, programTotalArea]);

  return (
    <main className="flex h-screen w-screen overflow-hidden">
      {/* 왼쪽: 채팅 패널 */}
      <div className="w-[390px] flex-shrink-0 h-full border-r border-gray-200 shadow-sm">
        <SpaceChatPanel
          onProgramUpdate={handleProgramUpdate}
          rooms={rooms}
          connections={connections}
          validationIssues={validationIssues}
          onOpenValidationPanel={() => setShowValidationPanel(true)}
        />
      </div>

      {/* 오른쪽: 캔버스 + 매트릭스 */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* 캔버스 */}
        <div className={`flex-1 min-h-0 ${showMatrix ? "border-b border-gray-200" : ""}`}>
          <FloorPlanCanvas
            rooms={rooms}
            connections={connections}
            onRoomsChange={setRooms}
            onConnectionsChange={setConnections}
          />
        </div>

        {/* 매트릭스 토글 버튼 */}
        <button
          onClick={() => setShowMatrix((v) => !v)}
          className={`flex-shrink-0 flex items-center justify-center gap-2 py-1.5 text-xs font-medium transition-colors border-t border-gray-200 ${
            showMatrix
              ? "bg-gray-800 text-white hover:bg-gray-700"
              : "bg-white text-gray-500 hover:bg-gray-50"
          }`}
        >
          <span>{showMatrix ? "▲" : "▼"}</span>
          <span>관계 매트릭스 (Adjacency Matrix)</span>
          {rooms.length > 0 && (
            <span className={`px-1.5 py-0.5 rounded text-xs ${showMatrix ? "bg-gray-600" : "bg-gray-100 text-gray-600"}`}>
              {rooms.length}×{rooms.length}
            </span>
          )}
          {connections.filter((c) => c.type === "required").length > 0 && (
            <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-600">
              필수 {connections.filter((c) => c.type === "required").length}
            </span>
          )}
        </button>

        {/* 매트릭스 패널 */}
        {showMatrix && (
          <div className="flex-shrink-0 h-56 bg-white overflow-hidden">
            <AdjacencyMatrix
              rooms={rooms}
              connections={connections}
              onConnectionsChange={setConnections}
            />
          </div>
        )}
      </div>

      {showValidationPanel && (
        <ValidationIssuesPanel
          issues={validationIssues}
          rooms={rooms}
          connections={connections}
          onClose={() => setShowValidationPanel(false)}
        />
      )}
    </main>
  );
}
