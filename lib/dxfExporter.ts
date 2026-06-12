/**
 * DXF Exporter
 *
 * 캔버스 room 배치를 실제 면적 기준 DXF로 변환합니다.
 * 픽셀→미터 변환: scale = sqrt(총실면적(m²) / 캔버스채움픽셀(px²))
 * 출력 단위: 미터(m), DXF R2000(AC1015) 포맷
 */

import { Room } from "./floorPlanTypes";
import { CANVAS_W, CANVAS_H } from "./floorPlanUtils";

// ── 존별 CAD 레이어 및 색상 ──────────────────────────────────────────────────

const ZONE_LAYER: Record<string, string> = {
  public:      "공용",
  private:     "전용",
  service:     "서비스",
  circulation: "동선",
  core:        "코어",
};

// AutoCAD Index Color (ACI)
const ZONE_ACI: Record<string, number> = {
  public:      5,  // 파랑
  private:     2,  // 노랑
  service:     3,  // 초록
  circulation: 6,  // 자홍
  core:        8,  // 회색
};

// ── 스케일 계산 ───────────────────────────────────────────────────────────────

const CANVAS_FILL_PX2 = CANVAS_W * CANVAS_H * 0.45;

function calcScale(rooms: Room[]): number {
  const totalArea = rooms.reduce((s, r) => s + r.totalArea, 0);
  if (!totalArea || totalArea <= 0) return 0.05; // 기본 5cm/px
  return Math.sqrt(totalArea / CANVAS_FILL_PX2);
}

// ── DXF 생성 헬퍼 ─────────────────────────────────────────────────────────────

function r2(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(3);
}

function dxfHeader(): string {
  return [
    "0", "SECTION",
    "2", "HEADER",
    "9", "$ACADVER",  "1", "AC1015",
    "9", "$DWGCODEPAGE", "3", "UTF-8",
    "9", "$INSUNITS", "70", "6",   // 6 = 미터
    "9", "$LUNITS",   "70", "2",   // 소수 단위
    "9", "$LUPREC",   "70", "3",   // 소수점 3자리
    "0", "ENDSEC",
  ].join("\n");
}

function dxfLayerTable(layers: { name: string; color: number }[]): string {
  const layerEntries = layers.map(({ name, color }) => [
    "0", "LAYER",
    "2", name,
    "70", "0",
    "62", String(color),
    "6", "CONTINUOUS",
  ].join("\n")).join("\n");

  return [
    "0", "SECTION",
    "2", "TABLES",
    // LTYPE 테이블 (CONTINUOUS 필수)
    "0", "TABLE", "2", "LTYPE", "70", "1",
    "0", "LTYPE",
    "2", "CONTINUOUS",
    "70", "0",
    "3", "Solid line",
    "72", "65",
    "73", "0",
    "40", "0.0",
    "0", "ENDTAB",
    // LAYER 테이블
    "0", "TABLE",
    "2", "LAYER",
    "70", String(layers.length + 1),
    "0", "LAYER", "2", "0", "70", "0", "62", "7", "6", "CONTINUOUS",
    layerEntries,
    "0", "ENDTAB",
    "0", "ENDSEC",
  ].join("\n");
}

function dxfLwPolyline(
  x1: number, y1: number,
  x2: number, y2: number,
  layer: string, color: number,
): string {
  return [
    "0", "LWPOLYLINE",
    "8", layer,
    "62", String(color),
    "70", "1",   // 닫힘
    "90", "4",   // 꼭짓점 4개
    "10", r2(x1), "20", r2(y1),
    "10", r2(x2), "20", r2(y1),
    "10", r2(x2), "20", r2(y2),
    "10", r2(x1), "20", r2(y2),
  ].join("\n");
}

function dxfText(
  x: number, y: number,
  height: number, text: string,
  layer: string,
): string {
  return [
    "0", "TEXT",
    "8", layer,
    "10", r2(x),
    "20", r2(y),
    "40", r2(Math.max(0.1, height)),
    "1", text,
    "72", "1",   // 수평 중앙 정렬
    "11", r2(x),
    "21", r2(y),
  ].join("\n");
}

// ── 메인 생성 함수 ────────────────────────────────────────────────────────────

export function generateDXF(rooms: Room[]): string {
  if (rooms.length === 0) return "";

  const scale = calcScale(rooms);
  const canvasH_m = CANVAS_H * scale; // Y축 반전 기준점

  // 사용된 존 레이어 수집
  const usedZones = [...new Set(rooms.map((r) => r.zone))];
  const layers = usedZones.map((zone) => ({
    name: ZONE_LAYER[zone] ?? zone,
    color: ZONE_ACI[zone] ?? 7,
  }));

  // 엔티티 생성
  const entities = rooms.flatMap((room) => {
    const layer = ZONE_LAYER[room.zone] ?? room.zone;
    const color = ZONE_ACI[room.zone] ?? 7;

    const x1 = room.x * scale;
    const y2 = canvasH_m - room.y * scale;               // 캔버스 Y반전
    const x2 = (room.x + room.width) * scale;
    const y1 = canvasH_m - (room.y + room.height) * scale;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const roomH_m = y2 - y1;
    const textH = Math.max(0.2, roomH_m * 0.14);

    return [
      dxfLwPolyline(x1, y1, x2, y2, layer, color),
      dxfText(cx, cy + textH * 0.4, textH, room.name, layer),
      dxfText(cx, cy - textH * 0.9, textH * 0.72,
        `${room.totalArea.toLocaleString()}㎡`, layer),
    ];
  });

  return [
    dxfHeader(),
    dxfLayerTable(layers),
    "0", "SECTION",
    "2", "ENTITIES",
    ...entities,
    "0", "ENDSEC",
    "0", "EOF",
  ].join("\n");
}

// ── 파일 다운로드 헬퍼 ────────────────────────────────────────────────────────

export function downloadDXF(rooms: Room[], projectName?: string): void {
  const dxf = generateDXF(rooms);
  if (!dxf) return;

  const fileName = projectName
    ? `${projectName.replace(/[^\w가-힣]/g, "_")}_배치도.dxf`
    : `공간배치도_${new Date().toISOString().slice(0, 10)}.dxf`;

  const blob = new Blob([dxf], { type: "application/dxf;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
