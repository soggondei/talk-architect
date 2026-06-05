"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import ChatPanel from "@/components/ChatPanel";
import { BuildingParams } from "@/lib/buildingTypes";

const ThreeViewer = dynamic(() => import("@/components/ThreeViewer"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#f0ede8]">
      <div className="text-gray-400 text-sm">뷰어 로딩 중...</div>
    </div>
  ),
});

export default function Home() {
  const [building, setBuilding] = useState<BuildingParams | null>(null);

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-gray-100">
      <div className="w-[400px] flex-shrink-0 h-full border-r border-gray-200 shadow-sm">
        <ChatPanel onBuildingUpdate={setBuilding} />
      </div>
      <div className="flex-1 h-full">
        <ThreeViewer building={building} />
      </div>
    </main>
  );
}
