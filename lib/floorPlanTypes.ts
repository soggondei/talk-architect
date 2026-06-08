export type ZoneType = 'public' | 'private' | 'service' | 'circulation' | 'core';

export const ZONE_COLORS: Record<ZoneType, { bg: string; border: string; text: string; label: string }> = {
  public:      { bg: '#DBEAFE', border: '#2563EB', text: '#1E3A8A', label: '공용' },
  private:     { bg: '#FEF9C3', border: '#CA8A04', text: '#713F12', label: '전용' },
  service:     { bg: '#DCFCE7', border: '#16A34A', text: '#14532D', label: '서비스' },
  circulation: { bg: '#EDE9FE', border: '#7C3AED', text: '#3B0764', label: '동선' },
  core:        { bg: '#F3F4F6', border: '#6B7280', text: '#1F2937', label: '코어' },
};

export type FloorType = 'B1' | '1F' | '2F' | '3F';

export const FLOOR_INFO: Record<FloorType, { label: string; shortLabel: string; bgColor: string; borderColor: string }> = {
  'B1': { label: '지하 1층', shortLabel: 'B1', bgColor: '#f1f5f9', borderColor: '#64748b' },
  '1F': { label: '1층',     shortLabel: '1F', bgColor: '#eff6ff', borderColor: '#3b82f6' },
  '2F': { label: '2층',     shortLabel: '2F', bgColor: '#f0fdf4', borderColor: '#22c55e' },
  '3F': { label: '3층',     shortLabel: '3F', bgColor: '#fefce8', borderColor: '#eab308' },
};

export const FLOORS: FloorType[] = ['B1', '1F', '2F', '3F'];

export interface Room {
  id: string;
  name: string;
  area: number;      // m² (단위 공간)
  count: number;     // 개수
  totalArea: number; // area × count
  zone: ZoneType;
  floor?: FloorType; // 층 (없으면 1F 기본값)
  x: number;
  y: number;
  width: number;     // px (면적 비례)
  height: number;    // px
  notes?: string;
}

export interface Connection {
  id: string;
  fromId: string;
  toId: string;
  type: 'required' | 'preferred'; // 필수 인접 / 권장 인접
}

export interface SpaceProgram {
  rooms: Room[];
  connections: Connection[];
  totalArea: number;
  targetArea?: number;
  notes?: string;
}
