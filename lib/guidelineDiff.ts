/**
 * GuidelineDiff — 확정된 GuidelineItem과 현재 Room 값의 불일치를 계산합니다.
 *
 * 흐름:
 *   computeGuidelineDiffs(items, confirmedIds, rooms) → GuidelineDiff[]
 *
 * 사용처:
 *   GuidelineDiffPanel이 이 결과를 받아 "적용/무시/수정" UI를 렌더링.
 *   실제 room 값 변경은 GuidelineDiffPanel의 콜백(onApply/onIgnore/onEdit)을
 *   FloorPlanCanvas에서 구현합니다 (Codex 담당).
 */

import { Room, FloorType } from "./floorPlanTypes";
import { GuidelineItem, GuidelineCategory, Priority } from "./guidelineExtractionPrompt";

// ── 타입 ─────────────────────────────────────────────────────────────────────

export type DiffCategory = Extract<GuidelineCategory, "room_area" | "room_count" | "floor">;

export interface GuidelineDiff {
  itemId: string;
  itemTitle: string;
  itemContent: string;
  category: DiffCategory;
  priority: Priority;
  quote: string;
  roomId: string;
  roomName: string;
  currentValue: string;       // 현재 room 값 (포맷된 문자열)
  guidelineValue: string;     // 지침서 기준값 (포맷된 문자열)
  parsedValue?: number;       // 숫자 추출 가능한 경우 (room_area/room_count)
  parsedFloor?: FloorType;    // 층 추출 가능한 경우 (floor)
}

// ── 내부 파서 ─────────────────────────────────────────────────────────────────

const FLOOR_LABELS: Record<FloorType, string> = {
  B1: "지하 1층",
  "1F": "지상 1층",
  "2F": "지상 2층",
  "3F": "지상 3층",
};

function parseArea(content: string): number | null {
  // "300m²", "300㎡", "300 m2", "1,200㎡" 등
  const match = content.match(/(\d[\d,]*)\s*(?:m²|㎡|m2)/i);
  if (!match) return null;
  return parseFloat(match[1].replace(/,/g, ""));
}

function parseCount(content: string): number | null {
  // "3실 이상", "5개", "2곳"
  const match = content.match(/(\d+)\s*(?:실|개|곳|동)/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

function parseFloor(content: string): FloorType | null {
  if (/지하\s*1층|B1|지하층/i.test(content)) return "B1";
  if (/지상\s*1층|1층|1F|주출입|저층부/i.test(content)) return "1F";
  if (/지상\s*2층|2층|2F/i.test(content)) return "2F";
  if (/지상\s*3층|3층|3F|상층부/i.test(content)) return "3F";
  return null;
}

// ── 메인 함수 ─────────────────────────────────────────────────────────────────

/**
 * 확정된 GuidelineItem과 현재 room 값을 비교해 불일치 목록을 반환합니다.
 *
 * 감지 대상:
 *   - room_area: guidelineItem의 면적 수치 ≠ room.totalArea
 *   - room_count: guidelineItem의 개수 ≠ 동일 이름 room 수
 *   - floor: guidelineItem의 층 ≠ room.floor
 */
export function computeGuidelineDiffs(
  items: GuidelineItem[],
  confirmedIds: Set<string>,
  rooms: Room[],
): GuidelineDiff[] {
  const diffs: GuidelineDiff[] = [];

  for (const item of items) {
    if (!confirmedIds.has(item.id)) continue;
    if (!["room_area", "room_count", "floor"].includes(item.category)) continue;
    if (!item.appliesToRoomIds?.length) continue;

    const relatedRooms = item.appliesToRoomIds
      .map((id) => rooms.find((r) => r.id === id))
      .filter((r): r is Room => r !== undefined);

    for (const room of relatedRooms) {
      if (item.category === "room_area") {
        const parsed = parseArea(item.content);
        const currentFormatted = room.totalArea > 0
          ? `${room.totalArea.toLocaleString()}㎡`
          : "미입력";
        if (parsed !== null && Math.abs(room.totalArea - parsed) > 1) {
          diffs.push({
            itemId: item.id,
            itemTitle: item.title,
            itemContent: item.content,
            category: "room_area",
            priority: item.priority,
            quote: item.source.quote,
            roomId: room.id,
            roomName: room.name,
            currentValue: currentFormatted,
            guidelineValue: `${parsed.toLocaleString()}㎡`,
            parsedValue: parsed,
          });
        }
      } else if (item.category === "room_count") {
        const parsed = parseCount(item.content);
        const sameNameCount = rooms.filter((r) => r.name === room.name).length;
        if (parsed !== null && sameNameCount !== parsed) {
          diffs.push({
            itemId: item.id,
            itemTitle: item.title,
            itemContent: item.content,
            category: "room_count",
            priority: item.priority,
            quote: item.source.quote,
            roomId: room.id,
            roomName: room.name,
            currentValue: `${sameNameCount}실`,
            guidelineValue: `${parsed}실`,
            parsedValue: parsed,
          });
        }
      } else if (item.category === "floor") {
        const parsed = parseFloor(item.content);
        if (parsed !== null && room.floor !== null && room.floor !== parsed) {
          diffs.push({
            itemId: item.id,
            itemTitle: item.title,
            itemContent: item.content,
            category: "floor",
            priority: item.priority,
            quote: item.source.quote,
            roomId: room.id,
            roomName: room.name,
            currentValue: room.floor ? FLOOR_LABELS[room.floor] : "미지정",
            guidelineValue: FLOOR_LABELS[parsed],
            parsedFloor: parsed,
          });
        }
      }
    }
  }

  return diffs;
}
