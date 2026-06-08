import { Room, Connection, ZoneType } from "./floorPlanTypes";
import { computeSize, autoLayout } from "./floorPlanUtils";

interface ParsedRoom {
  id: string;
  name: string;
  area: number;
  zone: ZoneType;
  count: number;
}

const ZONE_MAP: Record<string, ZoneType> = {
  public: "public", 공용: "public", 공공: "public", 공유: "public",
  private: "private", 전용: "private", 사무: "private", 업무: "private",
  service: "service", 서비스: "service", 지원: "service",
  circulation: "circulation", 동선: "circulation", 복도: "circulation",
  core: "core", 코어: "core", 화장실: "core", 계단: "core", 기계: "core",
};

export function parseRoomCSV(csv: string): ParsedRoom[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const get = (cols: string[], keys: string[]) => {
    for (const k of keys) {
      const i = headers.indexOf(k);
      if (i >= 0) return (cols[i] ?? "").trim();
    }
    return "";
  };

  return lines.slice(1).filter((l) => l.trim()).map((line, i) => {
    const cols = line.split(",");
    const id = get(cols, ["code", "id", "코드"]) || `room-${i}`;
    const name = get(cols, ["name", "room", "이름", "실명", "공간명"]) || `공간 ${i + 1}`;
    const area = parseFloat(get(cols, ["area", "면적", "넓이"])) || 0;
    const count = parseInt(get(cols, ["count", "개수", "수"]) || "1", 10) || 1;
    const zoneRaw = get(cols, ["zone", "type", "존", "유형", "종류"]).toLowerCase();
    const zone: ZoneType = ZONE_MAP[zoneRaw] ?? "public";
    return { id, name, area, zone, count };
  });
}

export function parsedRoomsToLayout(parsed: ParsedRoom[]): Room[] {
  const totalArea = parsed.reduce((s, r) => s + r.area * r.count, 0);
  const rooms: Room[] = parsed.map((r) => ({
    id: r.id,
    name: r.name,
    area: r.area,
    count: r.count,
    totalArea: r.area * r.count,
    zone: r.zone,
    x: 0,
    y: 0,
    ...computeSize(r.area * r.count, totalArea),
  }));
  return autoLayout(rooms, totalArea);
}

export function parseMatrixCSV(
  csv: string
): Pick<Connection, "fromId" | "toId" | "type">[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const roomIds = headers.slice(1);
  const result: Pick<Connection, "fromId" | "toId" | "type">[] = [];
  const seen = new Set<string>();

  lines.slice(1).forEach((line) => {
    const cols = line.split(",");
    const fromId = (cols[0] ?? "").trim();
    if (!fromId) return;

    cols.slice(1).forEach((val, ci) => {
      const toId = roomIds[ci];
      if (!toId || fromId === toId) return;
      const v = parseInt(val.trim(), 10);
      if (isNaN(v) || v <= 0) return;

      const key = [fromId, toId].sort().join("|");
      if (seen.has(key)) return;
      seen.add(key);

      result.push({ fromId, toId, type: v >= 2 ? "required" : "preferred" });
    });
  });

  return result;
}
