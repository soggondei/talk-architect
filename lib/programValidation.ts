import { Connection, Room, SpaceProgram } from "./floorPlanTypes";

export type ValidationSeverity = "info" | "warning" | "error";

export type ValidationIssueType =
  | "area_mismatch"
  | "room_count_mismatch"
  | "required_adjacency_missing"
  | "forbidden_adjacency_detected"
  | "source_conflict";

export interface ValidationIssue {
  id: string;
  type: ValidationIssueType;
  severity: ValidationSeverity;
  title: string;
  description: string;
  relatedRoomIds?: string[];
  relatedRelationIds?: string[];
  suggestion?: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  calculatedRoomCount: number;
  calculatedArea: number;
  declaredArea?: number;
}

const AREA_TOLERANCE = 0.5;

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function calculateProgramArea(rooms: Room[]): number {
  return rooms.reduce((sum, room) => sum + (numberOrUndefined(room.totalArea) ?? 0), 0);
}

export function validateSpaceProgram(program: SpaceProgram): ValidationResult {
  const issues: ValidationIssue[] = [];
  const rooms = program.rooms ?? [];
  const connections = program.connections ?? [];
  const calculatedArea = rooms.reduce((sum, room) => {
    const area = numberOrUndefined(room.area) ?? 0;
    const count = numberOrUndefined(room.count) ?? 1;
    return sum + area * count;
  }, 0);
  const declaredArea = numberOrUndefined(program.totalArea);

  rooms.forEach((room) => {
    const area = numberOrUndefined(room.area);
    const count = numberOrUndefined(room.count);
    const totalArea = numberOrUndefined(room.totalArea);

    if (area === undefined || count === undefined || totalArea === undefined) {
      issues.push({
        id: `room-number-missing-${room.id}`,
        type: "source_conflict",
        severity: "error",
        title: `${room.name} 수치 확인 필요`,
        description: "면적, 개수, 합계 면적 중 숫자가 아닌 값이 있습니다.",
        relatedRoomIds: [room.id],
        suggestion: "실 정보표에서 면적과 개수를 다시 확인하세요.",
      });
      return;
    }

    const expected = area * count;
    if (Math.abs(expected - totalArea) > AREA_TOLERANCE) {
      issues.push({
        id: `room-area-mismatch-${room.id}`,
        type: "area_mismatch",
        severity: "warning",
        title: `${room.name} 면적 합계 불일치`,
        description: `${area}m² × ${count}개 = ${expected}m²이지만, 현재 합계는 ${totalArea}m²입니다.`,
        relatedRoomIds: [room.id],
        suggestion: "AI 추정값과 실 정보표의 합계 면적 중 어느 값을 확정할지 선택하세요.",
      });
    }
  });

  if (declaredArea !== undefined && Math.abs(declaredArea - calculatedArea) > AREA_TOLERANCE) {
    issues.push({
      id: "program-total-area-mismatch",
      type: "area_mismatch",
      severity: "warning",
      title: "전체 면적 합계 불일치",
      description: `실별 계산 합계는 ${calculatedArea}m²이지만, 프로그램 합계는 ${declaredArea}m²입니다.`,
      suggestion: "누락된 실이 있는지, 또는 totalArea가 AI 설명값을 그대로 사용했는지 확인하세요.",
    });
  }

  const roomIds = new Set(rooms.map((room) => room.id));
  connections.forEach((connection) => {
    const missingIds = [connection.fromId, connection.toId].filter((id) => !roomIds.has(id));
    if (missingIds.length > 0) {
      issues.push({
        id: `relation-room-missing-${connection.id}`,
        type: "source_conflict",
        severity: "error",
        title: "관계 매트릭스 연결 대상 누락",
        description: `관계 ${connection.id}가 존재하지 않는 실 ID를 참조합니다: ${missingIds.join(", ")}`,
        relatedRelationIds: [connection.id],
        suggestion: "관계 매트릭스를 다시 생성하거나 누락된 실을 복구하세요.",
      });
    }
  });

  return {
    issues,
    calculatedRoomCount: rooms.length,
    calculatedArea,
    declaredArea,
  };
}

export function validateLayoutIssues(
  rooms: Room[],
  connections: Connection[],
  satisfiedConnectionIds: Set<string>
): ValidationIssue[] {
  return connections
    .filter((connection) => connection.type === "required" && !satisfiedConnectionIds.has(connection.id))
    .map((connection) => {
      const from = rooms.find((room) => room.id === connection.fromId);
      const to = rooms.find((room) => room.id === connection.toId);
      return {
        id: `required-adjacency-missing-${connection.id}`,
        type: "required_adjacency_missing",
        severity: "warning",
        title: "필수 인접 미충족",
        description: `${from?.name ?? connection.fromId} - ${to?.name ?? connection.toId} 필수 인접 조건을 만족하지 않습니다.`,
        relatedRoomIds: [connection.fromId, connection.toId],
        relatedRelationIds: [connection.id],
        suggestion: "두 실을 더 가까이 배치하거나 최적화를 다시 실행하세요.",
      } satisfies ValidationIssue;
    });
}
