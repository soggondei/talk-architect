/**
 * Layout Validation Report Generator
 *
 * rooms, connections, validationIssues, satisfactionScore를 받아
 * 설계실무자가 읽을 수 있는 한국어 문장형 검증 리포트를 생성합니다.
 */

import { Room, Connection, ZONE_COLORS, ZoneType } from "./floorPlanTypes";
import { ValidationIssue } from "./programValidation";
import { GuidelineItem, GuidelineCategory } from "./guidelineExtractionPrompt";

// ── 리포트 타입 ─────────────────────────────────────────────────────────────

export type ReportGrade = "A" | "B" | "C" | "D";
export type SectionSeverity = "ok" | "caution" | "critical";

export interface SectionQuote {
  itemTitle: string;
  content: string;
  quote: string;
  sourceRef: string;     // "section p.N" 형태
  confidence: number;
}

export interface ReportSection {
  id: string;
  title: string;
  severity: SectionSeverity;
  summary: string;          // 한 문단 문장형 요약
  items: string[];          // 세부 항목 목록
  action?: string;          // 권장 조치
  quotes?: SectionQuote[];  // 관련 지침서 원문 근거
}

export interface PriorityAction {
  rank: number;
  severity: "critical" | "caution";
  label: string;
  target?: string;
  relatedRoomIds?: string[];
}

export interface LayoutReport {
  generatedAt: string;
  projectName?: string;
  totalArea: number;
  roomCount: number;
  connectionCount: number;
  satisfactionScore: number;
  grade: ReportGrade;
  executiveSummary: string;   // 전체 3~4문장 요약
  sections: ReportSection[];
  priorityActions: PriorityAction[];
  plainText: string;          // 클립보드 복사용 전문
}

// ── 내부 유틸 ───────────────────────────────────────────────────────────────

function roomName(id: string, rooms: Room[]): string {
  return rooms.find((r) => r.id === id)?.name ?? id;
}

function gradeFromScore(score: number, errorCount: number): ReportGrade {
  if (errorCount > 0) return score >= 60 ? "C" : "D";
  if (score >= 90) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "D";
}

function gradeLabel(grade: ReportGrade): string {
  return { A: "양호", B: "보통", C: "미흡", D: "불량" }[grade];
}

function severityEmoji(s: SectionSeverity): string {
  return { ok: "✓", caution: "△", critical: "✕" }[s];
}

// ── 지침서 근거 추출 ─────────────────────────────────────────────────────────

const SECTION_CATEGORIES: Record<string, GuidelineCategory[]> = {
  "adjacency":    ["adjacency"],
  "separation":   ["separation"],
  "area-check":   ["room_area", "room_count"],
  "layout-overview": ["floor", "site"],
};

function extractQuotesForSection(
  sectionId: string,
  guidelineItems: GuidelineItem[],
): SectionQuote[] {
  const cats = SECTION_CATEGORIES[sectionId];
  if (!cats) return [];

  return guidelineItems
    .filter((item) => cats.includes(item.category) && item.source.quote)
    .slice(0, 4)
    .map((item) => ({
      itemTitle: item.title,
      content: item.content,
      quote: item.source.quote,
      sourceRef: [
        item.source.section,
        item.source.page != null ? `p.${item.source.page}` : null,
      ].filter(Boolean).join(", "),
      confidence: item.source.confidence ?? 1,
    }));
}

// ── 섹션 생성 ───────────────────────────────────────────────────────────────

function buildLayoutSection(
  rooms: Room[],
  connections: Connection[],
  score: number,
  grade: ReportGrade,
): ReportSection {
  const satisfiedCount = Math.round((score / 100) * connections.length);
  const zoneBreakdown = (Object.keys(ZONE_COLORS) as ZoneType[])
    .map((z) => {
      const zRooms = rooms.filter((r) => r.zone === z);
      if (!zRooms.length) return null;
      const area = zRooms.reduce((s, r) => s + r.totalArea, 0);
      return `${ZONE_COLORS[z].label} ${area.toLocaleString()}㎡(${zRooms.length}실)`;
    })
    .filter(Boolean) as string[];

  const totalArea = rooms.reduce((s, r) => s + r.totalArea, 0);

  const isOk = score >= 70;
  return {
    id: "layout-overview",
    title: "전체 배치 현황",
    severity: score >= 70 ? "ok" : score >= 50 ? "caution" : "critical",
    summary: `총 ${rooms.length}개 실, ${totalArea.toLocaleString()}㎡ 규모의 공간 프로그램이 입력되어 있습니다. `
      + `인접 관계 ${connections.length}쌍 중 ${satisfiedCount}쌍이 충족되어 만족도 ${score}% (${gradeLabel(grade)} 등급)입니다.`
      + (isOk ? " 전반적으로 양호한 배치 상태입니다." : " 일부 배치 조정이 필요합니다."),
    items: [
      `실 구성: ${rooms.length}개`,
      `총 면적: ${totalArea.toLocaleString()}㎡`,
      `인접 관계 만족도: ${score}% (${gradeLabel(grade)})`,
      ...zoneBreakdown,
    ],
  };
}

function buildAdjacencySection(
  issues: ValidationIssue[],
  rooms: Room[],
  connections: Connection[],
): ReportSection {
  const requiredConns = connections.filter((c) => c.type === "required");
  const missingIssues = issues.filter((i) => i.type === "required_adjacency_missing");
  const satisfiedCount = requiredConns.length - missingIssues.length;

  const items: string[] = missingIssues.map((issue) => {
    const [fromId, toId] = issue.relatedRoomIds ?? [];
    const fromName = fromId ? roomName(fromId, rooms) : "?";
    const toName = toId ? roomName(toId, rooms) : "?";
    const reason = connections.find((c) =>
      (c.fromId === fromId && c.toId === toId) ||
      (c.fromId === toId && c.toId === fromId)
    )?.reason;
    return reason
      ? `${fromName} ↔ ${toName} (미충족) — ${reason}`
      : `${fromName} ↔ ${toName} (미충족)`;
  });

  const severity: SectionSeverity =
    missingIssues.length === 0 ? "ok" : missingIssues.length <= 2 ? "caution" : "critical";

  const summary = requiredConns.length === 0
    ? "설정된 필수 인접 관계가 없습니다. 공간 간 인접 요건이 있다면 연결 모드에서 설정하세요."
    : missingIssues.length === 0
    ? `필수 인접 관계 ${requiredConns.length}쌍이 모두 충족되었습니다.`
    : `필수 인접 관계 ${requiredConns.length}쌍 중 ${satisfiedCount}쌍이 충족되었습니다. `
      + `${missingIssues.length}쌍이 미충족 상태로, 해당 실의 배치 조정 또는 최적화 재실행이 필요합니다.`;

  return {
    id: "adjacency",
    title: "필수 인접 관계",
    severity,
    summary,
    items: items.length ? items : ["모든 필수 인접 조건이 충족되었습니다."],
    action: missingIssues.length > 0
      ? "미충족 실을 선택하고 ▶ 최적화를 실행하거나, 직접 드래그로 인접 배치하세요."
      : undefined,
  };
}

function buildSeparationSection(
  issues: ValidationIssue[],
  rooms: Room[],
  connections: Connection[],
): ReportSection {
  const forbiddenIssues = issues.filter((i) => i.type === "forbidden_adjacency_detected");
  const separatedConns = connections.filter((c) => c.type === "separated" || c.type === "forbidden");

  const items: string[] = forbiddenIssues.map((issue) => {
    const [fromId, toId] = issue.relatedRoomIds ?? [];
    const fromName = fromId ? roomName(fromId, rooms) : "?";
    const toName = toId ? roomName(toId, rooms) : "?";
    const conn = connections.find((c) =>
      (c.fromId === fromId && c.toId === toId) ||
      (c.fromId === toId && c.toId === fromId)
    );
    const reason = conn?.reason;
    return reason
      ? `${fromName} ↔ ${toName} (금지 위반) — ${reason}`
      : `${fromName} ↔ ${toName} (인접 금지 위반)`;
  });

  const severity: SectionSeverity =
    forbiddenIssues.length === 0 ? "ok" : "critical";

  const summary = separatedConns.length === 0
    ? "설정된 분리·금지 관계가 없습니다."
    : forbiddenIssues.length === 0
    ? `분리·금지 관계 ${separatedConns.length}쌍이 모두 준수되고 있습니다.`
    : `인접 금지 조건 중 ${forbiddenIssues.length}건이 위반되었습니다. `
      + "해당 실들이 현재 인접 배치되어 있으므로 즉시 분리가 필요합니다.";

  return {
    id: "separation",
    title: "분리·금지 관계",
    severity,
    summary,
    items: items.length ? items : separatedConns.length
      ? ["모든 분리·금지 조건이 준수되고 있습니다."]
      : ["분리·금지 조건이 설정되지 않았습니다."],
    action: forbiddenIssues.length > 0
      ? "금지 위반 실을 이격 배치하거나 관계 근거를 다시 확인하세요."
      : undefined,
  };
}

function buildAreaSection(issues: ValidationIssue[]): ReportSection {
  const areaIssues = issues.filter(
    (i) => i.type === "area_mismatch" || i.type === "room_count_mismatch" || i.type === "source_conflict"
  );

  const items = areaIssues.map((issue) => `${issue.title}: ${issue.description}`);

  const severity: SectionSeverity =
    areaIssues.filter((i) => i.severity === "error").length > 0
      ? "critical"
      : areaIssues.length > 0 ? "caution" : "ok";

  const summary = areaIssues.length === 0
    ? "면적·수량 오류가 없습니다. 모든 실의 면적과 개수가 일치합니다."
    : `${areaIssues.length}건의 면적·수량 불일치가 확인되었습니다. `
      + "AI 추출값과 지침서 수치를 비교하여 확정하세요.";

  return {
    id: "area-check",
    title: "면적·수량 검증",
    severity,
    summary,
    items: items.length ? items : ["면적·수량 오류 없음"],
    action: areaIssues.length > 0
      ? "오류 실을 선택해 면적을 수정하거나 지침서 원문과 대조하세요."
      : undefined,
  };
}

// ── 수정 우선순위 ────────────────────────────────────────────────────────────

function buildPriorityActions(
  sections: ReportSection[],
  issues: ValidationIssue[],
  rooms: Room[],
  connections: Connection[],
): PriorityAction[] {
  const actions: PriorityAction[] = [];
  let rank = 1;

  // 1순위: 금지 위반
  issues
    .filter((i) => i.type === "forbidden_adjacency_detected")
    .forEach((issue) => {
      const [fromId, toId] = issue.relatedRoomIds ?? [];
      actions.push({
        rank: rank++,
        severity: "critical",
        label: `${roomName(fromId ?? "", rooms)} ↔ ${roomName(toId ?? "", rooms)} 인접 금지 위반 — 즉시 분리 배치 필요`,
        target: issue.relatedRoomIds?.join(","),
        relatedRoomIds: issue.relatedRoomIds,
      });
    });

  // 2순위: 필수 인접 미충족
  issues
    .filter((i) => i.type === "required_adjacency_missing")
    .forEach((issue) => {
      const [fromId, toId] = issue.relatedRoomIds ?? [];
      const reason = connections.find((c) =>
        (c.fromId === fromId && c.toId === toId) ||
        (c.fromId === toId && c.toId === fromId)
      )?.reason;
      actions.push({
        rank: rank++,
        severity: "caution",
        label: `${roomName(fromId ?? "", rooms)} ↔ ${roomName(toId ?? "", rooms)} 인접 배치${reason ? ` (${reason})` : ""}`,
        target: issue.relatedRoomIds?.join(","),
        relatedRoomIds: issue.relatedRoomIds,
      });
    });

  // 3순위: 면적 오류
  issues
    .filter((i) => i.severity === "error" && i.type === "source_conflict")
    .forEach((issue) => {
      actions.push({
        rank: rank++,
        severity: "critical",
        label: issue.title,
        target: issue.relatedRoomIds?.join(","),
        relatedRoomIds: issue.relatedRoomIds,
      });
    });

  issues
    .filter((i) => i.severity === "warning" && i.type === "area_mismatch")
    .slice(0, 3)
    .forEach((issue) => {
      actions.push({
        rank: rank++,
        severity: "caution",
        label: issue.title + " — 지침서 원문과 대조 필요",
        relatedRoomIds: issue.relatedRoomIds,
      });
    });

  return actions;
}

// ── 전문 텍스트 생성 ─────────────────────────────────────────────────────────

function buildPlainText(report: Omit<LayoutReport, "plainText">): string {
  const lines: string[] = [
    "═══════════════════════════════════════",
    "  배치 검증 리포트",
    `  생성일시: ${new Date(report.generatedAt).toLocaleString("ko-KR")}`,
    report.projectName ? `  프로젝트: ${report.projectName}` : "",
    "═══════════════════════════════════════",
    "",
    "【종합 평가】",
    `만족도 ${report.satisfactionScore}% · ${gradeLabel(report.grade)} 등급 (${report.grade})`,
    "",
    report.executiveSummary,
    "",
  ];

  report.sections.forEach((section) => {
    lines.push(`【${section.title}】 ${severityEmoji(section.severity)}`);
    lines.push(section.summary);
    if (section.items.length && section.severity !== "ok") {
      section.items.forEach((item) => lines.push(`  • ${item}`));
    }
    if (section.action) lines.push(`  → ${section.action}`);
    lines.push("");
  });

  if (report.priorityActions.length) {
    lines.push("【수정 우선순위】");
    report.priorityActions.forEach((action) => {
      const prefix = action.severity === "critical" ? "✕" : "△";
      lines.push(`  ${action.rank}. ${prefix} ${action.label}`);
    });
    lines.push("");
  }

  lines.push("───────────────────────────────────────");
  lines.push(`실 ${report.roomCount}개 · 관계 ${report.connectionCount}쌍 · 총 ${report.totalArea.toLocaleString()}㎡`);

  return lines.filter((l) => l !== undefined).join("\n");
}

// ── 메인 생성 함수 ───────────────────────────────────────────────────────────

export function generateLayoutReport(
  rooms: Room[],
  connections: Connection[],
  issues: ValidationIssue[],
  satisfactionScore: number,
  projectName?: string,
  confirmedGuidelineItems?: GuidelineItem[],
): LayoutReport {
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const grade = gradeFromScore(satisfactionScore, errorCount);
  const totalArea = rooms.reduce((s, r) => s + r.totalArea, 0);

  const missingRequired = issues.filter((i) => i.type === "required_adjacency_missing").length;
  const forbiddenViolations = issues.filter((i) => i.type === "forbidden_adjacency_detected").length;
  const areaErrors = issues.filter(
    (i) => i.type === "area_mismatch" || i.type === "source_conflict"
  ).length;

  // 종합 요약문
  const executiveSummary = [
    `현재 ${rooms.length}개 실, ${totalArea.toLocaleString()}㎡ 규모의 공간 프로그램에 대한 배치 검증 결과입니다.`,
    `인접 관계 만족도는 ${satisfactionScore}%로 ${gradeLabel(grade)} 등급(${grade})에 해당합니다.`,
    forbiddenViolations > 0
      ? `인접 금지 조건 위반 ${forbiddenViolations}건이 발견되어 즉시 수정이 필요합니다.`
      : missingRequired > 0
      ? `필수 인접 미충족 ${missingRequired}쌍이 있으며, 최적화 실행 또는 수동 배치 조정을 권장합니다.`
      : "인접 관계 위반 사항은 없습니다.",
    areaErrors > 0
      ? `면적·수량 불일치 ${areaErrors}건은 지침서 원문과 대조하여 확정하세요.`
      : "면적·수량 오류는 없습니다.",
  ].join(" ");

  const glItems = confirmedGuidelineItems ?? [];
  const sections = [
    buildLayoutSection(rooms, connections, satisfactionScore, grade),
    buildAdjacencySection(issues, rooms, connections),
    buildSeparationSection(issues, rooms, connections),
    buildAreaSection(issues),
  ].map((section) => ({
    ...section,
    quotes: glItems.length ? extractQuotesForSection(section.id, glItems) : undefined,
  }));

  const priorityActions = buildPriorityActions(sections, issues, rooms, connections);

  const partial = {
    generatedAt: new Date().toISOString(),
    projectName,
    totalArea,
    roomCount: rooms.length,
    connectionCount: connections.length,
    satisfactionScore,
    grade,
    executiveSummary,
    sections,
    priorityActions,
  };

  return { ...partial, plainText: buildPlainText(partial) };
}
