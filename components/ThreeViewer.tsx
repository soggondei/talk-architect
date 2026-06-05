"use client";

import { useEffect, useRef } from "react";
import { BuildingParams } from "@/lib/buildingTypes";
import { BuildingRenderer } from "./BuildingRenderer";

interface Props {
  building: BuildingParams | null;
}

export default function ThreeViewer({ building }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<BuildingRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    rendererRef.current = new BuildingRenderer(canvas);

    const observer = new ResizeObserver(() => {
      if (canvas && rendererRef.current) {
        rendererRef.current.resize(canvas.clientWidth, canvas.clientHeight);
      }
    });
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      rendererRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (building && rendererRef.current) {
      rendererRef.current.render(building);
    }
  }, [building]);

  return (
    <div className="relative w-full h-full bg-[#f0ede8]">
      <canvas ref={canvasRef} className="w-full h-full" />

      {!building && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-center space-y-3 opacity-40">
            <div className="text-6xl">🏛</div>
            <p className="text-gray-600 text-sm font-medium">
              왼쪽 채팅창에 건축 요청을 입력하면<br />
              3D 건물이 여기에 나타납니다
            </p>
          </div>
        </div>
      )}

      {building && (
        <div className="absolute bottom-4 left-4 bg-white/80 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-gray-600 space-y-0.5">
          <div className="font-semibold text-gray-800">건물 정보</div>
          <div>층수: {building.floors}층 · 규모: {building.width}×{building.depth}m</div>
          <div>층고: {building.heightPerFloor}m · 지붕: {
            building.roofType === "flat" ? "평지붕" :
            building.roofType === "gable" ? "박공지붕" : "우진각지붕"
          }</div>
          {building.piloti && <div>필로티: {building.pilotiFloors}층</div>}
          {building.hasCourt && <div>중정 포함</div>}
        </div>
      )}

      <div className="absolute top-4 right-4 text-xs text-gray-400 bg-white/60 px-2 py-1 rounded">
        드래그: 회전 · 스크롤: 줌 · 우클릭: 이동
      </div>
    </div>
  );
}
