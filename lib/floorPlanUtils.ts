import { Room, Connection, ZoneType, ZONE_COLORS, FloorType, FLOORS, RelationType as StoredRelationType } from "./floorPlanTypes";

export const CANVAS_W = 920;
export const CANVAS_H = 620;
export const QUAD_W = Math.floor(CANVAS_W / 2);
export const QUAD_H = Math.floor(CANVAS_H / 2);
const PADDING = 24;
const GAP = 10;
const MIN_W = 64;
const MIN_H = 44;
const ASPECT = 1.6;
const SNAP = 8;

export function snapVal(v: number): number {
  return Math.round(v / SNAP) * SNAP;
}

export function computeSize(
  area: number,
  totalArea: number
): { width: number; height: number } {
  const safeTotal = Number.isFinite(totalArea) && totalArea > 0 ? totalArea : 1;
  const safeArea = Number.isFinite(area) && area > 0 ? area : safeTotal * 0.05;
  const canvasFill = CANVAS_W * CANVAS_H * 0.45;
  const scale = canvasFill / safeTotal;
  const px = safeArea * scale;
  const w = Math.max(MIN_W, Math.sqrt(px * ASPECT));
  const h = Math.max(MIN_H, Math.sqrt(px / ASPECT));
  return { width: Math.round(w), height: Math.round(h) };
}

export function autoLayout(rooms: Room[], totalArea: number): Room[] {
  const sized = rooms.map((r) => ({
    ...r,
    ...computeSize(r.totalArea, totalArea),
  }));

  let x = PADDING;
  let y = PADDING;
  let rowH = 0;

  return sized.map((room) => {
    if (x + room.width > CANVAS_W - PADDING && x > PADDING) {
      x = PADDING;
      y += rowH + GAP;
      rowH = 0;
    }
    const placed = { ...room, x, y };
    x += room.width + GAP;
    rowH = Math.max(rowH, room.height);
    return placed;
  });
}

export function getRoomCenter(room: Room) {
  return { cx: room.x + room.width / 2, cy: room.y + room.height / 2 };
}

export type RelationType = StoredRelationType | "none";

const RELATION_CYCLE: RelationType[] = ["none", "preferred", "required", "separated", "forbidden"];

export const RELATION_LABELS: Record<RelationType, string> = {
  none: "없음",
  preferred: "권장 인접",
  required: "필수 인접",
  separated: "분리 권장",
  forbidden: "인접 금지",
};

export function relationWeight(type: StoredRelationType): number {
  if (type === "required") return 1;
  if (type === "preferred") return 0.6;
  if (type === "separated") return 0.4;
  return 0;
}

export function getRelation(
  fromId: string,
  toId: string,
  connections: Connection[]
): RelationType {
  const conn = connections.find(
    (c) =>
      (c.fromId === fromId && c.toId === toId) ||
      (c.fromId === toId && c.toId === fromId)
  );
  return conn ? (conn.type as RelationType) : "none";
}

export function setRelation(
  fromId: string,
  toId: string,
  type: RelationType,
  connections: Connection[]
): Connection[] {
  const existing = connections.filter(
    (c) =>
      !((c.fromId === fromId && c.toId === toId) ||
        (c.fromId === toId && c.toId === fromId))
  );
  if (type === "none") return existing;
  return [
    ...existing,
    {
      id: `c-${fromId}-${toId}`,
      fromId,
      toId,
      type,
      weight: relationWeight(type),
      status: "edited",
    },
  ];
}

export function cycleRelation(current: RelationType): RelationType {
  const currentIndex = RELATION_CYCLE.indexOf(current);
  return RELATION_CYCLE[(currentIndex + 1) % RELATION_CYCLE.length];
}

export function isActuallyAdjacent(a: Room, b: Room, gap = 26): boolean {
  const aRight = a.x + a.width, aBottom = a.y + a.height;
  const bRight = b.x + b.width, bBottom = b.y + b.height;
  const overlapX = Math.min(aRight, bRight) - Math.max(a.x, b.x);
  const overlapY = Math.min(aBottom, bBottom) - Math.max(a.y, b.y);
  const distX = Math.max(0, Math.max(a.x, b.x) - Math.min(aRight, bRight));
  const distY = Math.max(0, Math.max(a.y, b.y) - Math.min(aBottom, bBottom));
  return (overlapX > -gap && distY < gap) || (overlapY > -gap && distX < gap);
}

export function calcSatisfactionScore(
  rooms: Room[],
  connections: Connection[],
  gap = 26
): { score: number; satisfied: number; total: number; satisfiedIds: Set<string> } {
  if (connections.length === 0) {
    return { score: 100, satisfied: 0, total: 0, satisfiedIds: new Set() };
  }
  const satisfiedIds = new Set<string>();
  connections.forEach((c) => {
    const a = rooms.find((r) => r.id === c.fromId);
    const b = rooms.find((r) => r.id === c.toId);
    if (!a || !b) return;
    const adjacent = isActuallyAdjacent(a, b, gap);
    if ((c.type === "required" || c.type === "preferred") && adjacent) {
      satisfiedIds.add(c.id);
    }
    if ((c.type === "separated" || c.type === "forbidden") && !adjacent) {
      satisfiedIds.add(c.id);
    }
  });
  return {
    score: Math.round((satisfiedIds.size / connections.length) * 100),
    satisfied: satisfiedIds.size,
    total: connections.length,
    satisfiedIds,
  };
}

// --- 멀티플로어 ---

const QUAD_LABEL_H = 22; // 층 레이블 높이
const QUAD_PAD = 8;

// 각 층이 사용하는 캔버스 영역 (레이블 아래)
export const FLOOR_QUADS: Record<FloorType, { x: number; y: number; w: number; h: number }> = {
  'B1': { x: QUAD_PAD,           y: QUAD_LABEL_H,           w: QUAD_W - QUAD_PAD * 2, h: QUAD_H - QUAD_LABEL_H - QUAD_PAD },
  '1F': { x: QUAD_W + QUAD_PAD,  y: QUAD_LABEL_H,           w: QUAD_W - QUAD_PAD * 2, h: QUAD_H - QUAD_LABEL_H - QUAD_PAD },
  '2F': { x: QUAD_PAD,           y: QUAD_H + QUAD_LABEL_H,  w: QUAD_W - QUAD_PAD * 2, h: QUAD_H - QUAD_LABEL_H - QUAD_PAD },
  '3F': { x: QUAD_W + QUAD_PAD,  y: QUAD_H + QUAD_LABEL_H,  w: QUAD_W - QUAD_PAD * 2, h: QUAD_H - QUAD_LABEL_H - QUAD_PAD },
};

export function layoutByFloor(rooms: Room[], _totalArea: number): Room[] {
  void _totalArea;
  const groups: Partial<Record<FloorType, Room[]>> = {};
  rooms.forEach((r) => {
    const f: FloorType = r.floor ?? '1F';
    if (!groups[f]) groups[f] = [];
    groups[f]!.push(r);
  });

  const result: Room[] = [];
  const PAD = 4;
  const GAP = 3;
  const ASPECT = 1.35;
  const MIN_W = 26;
  const MIN_H = 18;

  FLOORS.forEach((floor) => {
    const fRooms = groups[floor] ?? [];
    if (!fRooms.length) return;

    const quad = FLOOR_QUADS[floor];
    const availW = quad.w - PAD * 2;
    const availH = quad.h - PAD * 2;
    const safeRoomArea = (r: Room) =>
      Number.isFinite(r.totalArea) && r.totalArea > 0 ? r.totalArea : 10;
    const floorTotal = fRooms.reduce((s, r) => s + safeRoomArea(r), 0);

    // Try layout with given scale; returns placed rooms or null if any room overflows quad height
    const tryLayout = (sc: number): Room[] | null => {
      const placed: Room[] = [];
      let x = 0, y = 0, rowH = 0;

      for (const r of fRooms) {
        const px = safeRoomArea(r) * sc;
        const w = Math.max(MIN_W, Math.round(Math.min(availW * 0.9, Math.sqrt(px * ASPECT))));
        const h = Math.max(MIN_H, Math.round(Math.min(availH * 0.85, Math.sqrt(px / ASPECT))));

        // Wrap to next row
        if (x > 0 && x + w > availW) {
          x = 0;
          y += rowH + GAP;
          rowH = 0;
        }
        // Overflow check
        if (y + h > availH) return null;

        placed.push({ ...r, x: quad.x + PAD + x, y: quad.y + PAD + y, width: w, height: h });
        x += w + GAP;
        rowH = Math.max(rowH, h);
      }
      return placed;
    };

    // Start at 60% fill, reduce by 18% each attempt until all rooms fit
    let scale = (availW * availH * 0.60) / Math.max(floorTotal, 1);
    let laid: Room[] | null = null;

    for (let i = 0; i < 14; i++) {
      laid = tryLayout(scale);
      if (laid) break;
      scale *= 0.82;
    }

    // Hard fallback: place with minimum sizes, clamp y to stay inside quad
    if (!laid) {
      let x = 0, y = 0, rowH = 0;
      laid = fRooms.map((r) => {
        const px = safeRoomArea(r) * scale;
        const w = Math.max(MIN_W, Math.round(Math.min(availW * 0.5, Math.sqrt(px * ASPECT))));
        const h = Math.max(MIN_H, Math.round(Math.min(availH * 0.5, Math.sqrt(px / ASPECT))));
        if (x > 0 && x + w > availW) { x = 0; y += rowH + GAP; rowH = 0; }
        const clampedY = Math.min(y, availH - h);
        const placed = { ...r, x: quad.x + PAD + x, y: quad.y + PAD + Math.max(0, clampedY), width: w, height: h };
        x += w + GAP;
        rowH = Math.max(rowH, h);
        return placed;
      });
    }

    result.push(...laid);
  });

  return result;
}

// --- LLM 출력 ---

// 현재 배치를 LLM에게 전달할 텍스트로 변환
export function programToText(rooms: Room[], connections: Connection[]): string {
  const roomLines = rooms.map(
    (r) =>
      `- ${r.name} (${r.totalArea}m², ${ZONE_COLORS[r.zone as ZoneType]?.label ?? r.zone})`
  );
  const connLines = connections.map((c) => {
    const from = rooms.find((r) => r.id === c.fromId)?.name ?? c.fromId;
    const to = rooms.find((r) => r.id === c.toId)?.name ?? c.toId;
    const reason = c.reason ? ` (${c.reason})` : "";
    return `- ${from} ↔ ${to}: ${RELATION_LABELS[c.type]}${reason}`;
  });
  return `[공간 목록]\n${roomLines.join("\n")}\n\n[인접 관계]\n${connLines.join("\n") || "없음"}`;
}
