export interface Window3D {
  wall: "front" | "back" | "left" | "right";
  floor: number;
  xOffset: number;
  width: number;
  height: number;
}

export interface Balcony {
  wall: "front" | "back" | "left" | "right";
  floor: number;
  width: number;
  depth: number;
}

export interface BuildingParams {
  floors: number;
  width: number;
  depth: number;
  heightPerFloor: number;
  piloti: boolean;
  pilotiFloors: number;
  roofType: "flat" | "gable" | "hip";
  roofAngle?: number;
  windows: Window3D[];
  balconies: Balcony[];
  hasCourt: boolean;
  courtWidth?: number;
  courtDepth?: number;
  wallColor: string;
  roofColor: string;
  description?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  buildingParams?: BuildingParams;
}

export const DEFAULT_BUILDING: BuildingParams = {
  floors: 2,
  width: 10,
  depth: 8,
  heightPerFloor: 3,
  piloti: false,
  pilotiFloors: 0,
  roofType: "flat",
  windows: [],
  balconies: [],
  hasCourt: false,
  wallColor: "#e8e0d5",
  roofColor: "#8b7355",
};
