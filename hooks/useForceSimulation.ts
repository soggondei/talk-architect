"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import * as d3 from "d3";
import { Room, Connection, ZoneType, FloorType } from "@/lib/floorPlanTypes";
import { CANVAS_W, CANVAS_H, FLOOR_QUADS } from "@/lib/floorPlanUtils";

type SimNode = Room & d3.SimulationNodeDatum;

// Zones that should align vertically across floors (same-name sync)
const SYNC_ZONES: ZoneType[] = ["core", "circulation"];

export function useForceSimulation(onRoomsChange: (rooms: Room[]) => void) {
  const simRef = useRef<d3.Simulation<SimNode, undefined> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [linkStrength, setLinkStrength] = useState(1.0);
  const strengthRef = useRef(linkStrength);
  strengthRef.current = linkStrength;

  const stop = useCallback(() => {
    simRef.current?.stop();
    simRef.current = null;
    setIsRunning(false);
  }, []);

  const run = useCallback(
    (
      rooms: Room[],
      connections: Connection[],
      shake = false,
      pinnedIds: Set<string> = new Set(),
      multiFloor = false
    ) => {
      simRef.current?.stop();
      if (rooms.length === 0) return;

      const nodes: SimNode[] = rooms.map((r) => {
        const isPinned = pinnedIds.has(r.id);
        const floor: FloorType = r.floor ?? "1F";

        if (shake && !isPinned) {
          if (multiFloor) {
            // Shake within the floor's quadrant
            const quad = FLOOR_QUADS[floor];
            const qcx = quad.x + quad.w / 2;
            const qcy = quad.y + quad.h / 2;
            return {
              ...r,
              x: qcx + (Math.random() - 0.5) * quad.w * 0.55,
              y: qcy + (Math.random() - 0.5) * quad.h * 0.55,
              vx: (Math.random() - 0.5) * 20,
              vy: (Math.random() - 0.5) * 20,
              fx: undefined, fy: undefined,
            };
          }
          return {
            ...r,
            x: r.x + r.width / 2 + (Math.random() - 0.5) * 220,
            y: r.y + r.height / 2 + (Math.random() - 0.5) * 180,
            vx: (Math.random() - 0.5) * 35,
            vy: (Math.random() - 0.5) * 35,
            fx: undefined, fy: undefined,
          };
        }

        return {
          ...r,
          x: r.x + r.width / 2,
          y: r.y + r.height / 2,
          vx: 0, vy: 0,
          fx: isPinned ? r.x + r.width / 2 : undefined,
          fy: isPinned ? r.y + r.height / 2 : undefined,
        };
      });

      nodesRef.current = nodes;

      // In multi-floor mode, only use same-floor connections for link force
      const activeConns = multiFloor
        ? connections.filter((c) => {
            const from = rooms.find((r) => r.id === c.fromId);
            const to = rooms.find((r) => r.id === c.toId);
            return from && to && (from.floor ?? "1F") === (to.floor ?? "1F");
          })
        : connections;

      const rawLinks = activeConns.map((c) => ({
        source: c.fromId,
        target: c.toId,
        type: c.type,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const linkForce = (d3.forceLink(rawLinks) as any)
        .id((d: SimNode) => d.id)
        .distance((link: any) => {
          const s = link.source as SimNode;
          const t = link.target as SimNode;
          if (typeof s === "string" || typeof t === "string") return 80;
          const touch = (s.width + s.height + t.width + t.height) / 4;
          return link.type === "required" ? touch * 1.05 : touch * 1.8;
        })
        .strength((link: any) =>
          link.type === "required"
            ? strengthRef.current
            : strengthRef.current * 0.22
        );

      const sim = d3
        .forceSimulation<SimNode>(nodes)
        .force("link", linkForce)
        .force("charge", d3.forceManyBody<SimNode>().strength(-85).distanceMax(300))
        .force(
          "collision",
          d3.forceCollide<SimNode>()
            .radius((d) => Math.max(d.width, d.height) / 2 + 4)
            .strength(0.9)
            .iterations(3)
        )
        .alphaDecay(0.016)
        .velocityDecay(0.26);

      if (multiFloor) {
        // ── Per-floor center force ──────────────────────────────────────
        sim.force("center", () => {
          for (const n of nodes) {
            if (n.fx !== undefined) continue;
            const quad = FLOOR_QUADS[n.floor ?? "1F"];
            const cx = quad.x + quad.w / 2;
            const cy = quad.y + quad.h / 2;
            n.vx = (n.vx ?? 0) + (cx - (n.x ?? cx)) * 0.025;
            n.vy = (n.vy ?? 0) + (cy - (n.y ?? cy)) * 0.025;
          }
        });

        // ── Per-floor bounds force ──────────────────────────────────────
        sim.force("bounds", () => {
          for (const n of nodes) {
            if (n.fx !== undefined) continue;
            const quad = FLOOR_QUADS[n.floor ?? "1F"];
            const hw = n.width / 2 + 3;
            const hh = n.height / 2 + 3;
            const minX = quad.x + hw, maxX = quad.x + quad.w - hw;
            const minY = quad.y + hh, maxY = quad.y + quad.h - hh;
            const nx = n.x ?? (quad.x + quad.w / 2);
            const ny = n.y ?? (quad.y + quad.h / 2);
            if (nx < minX) { n.x = minX; n.vx = Math.abs(n.vx ?? 0) * 0.3; }
            if (nx > maxX) { n.x = maxX; n.vx = -Math.abs(n.vx ?? 0) * 0.3; }
            if (ny < minY) { n.y = minY; n.vy = Math.abs(n.vy ?? 0) * 0.3; }
            if (ny > maxY) { n.y = maxY; n.vy = -Math.abs(n.vy ?? 0) * 0.3; }
          }
        });

        // ── Core sync force: same-name rooms across floors align ────────
        // Build pairs of matching syncable rooms on different floors
        const nameMap = new Map<string, SimNode[]>();
        for (const n of nodes) {
          if (!SYNC_ZONES.includes(n.zone as ZoneType)) continue;
          const key = n.name.trim().replace(/\s+/g, "").toLowerCase();
          if (!nameMap.has(key)) nameMap.set(key, []);
          nameMap.get(key)!.push(n);
        }
        const syncPairs: [SimNode, SimNode][] = [];
        for (const [, group] of nameMap) {
          if (group.length < 2) continue;
          const floors = new Set(group.map((n) => n.floor ?? "1F"));
          if (floors.size < 2) continue;
          for (let i = 0; i < group.length - 1; i++) {
            for (let j = i + 1; j < group.length; j++) {
              syncPairs.push([group[i], group[j]]);
            }
          }
        }

        if (syncPairs.length > 0) {
          const SYNC_STRENGTH = 0.18;
          sim.force("coreSync", () => {
            for (const [n1, n2] of syncPairs) {
              if (n1.fx !== undefined && n2.fx !== undefined) continue;
              const q1 = FLOOR_QUADS[n1.floor ?? "1F"];
              const q2 = FLOOR_QUADS[n2.floor ?? "1F"];
              // Relative position within quadrant (0~1)
              const rx1 = ((n1.x ?? 0) - q1.x) / q1.w;
              const ry1 = ((n1.y ?? 0) - q1.y) / q1.h;
              const rx2 = ((n2.x ?? 0) - q2.x) / q2.w;
              const ry2 = ((n2.y ?? 0) - q2.y) / q2.h;
              const dx = rx1 - rx2;
              const dy = ry1 - ry2;
              if (n1.fx === undefined) {
                n1.vx = (n1.vx ?? 0) - dx * SYNC_STRENGTH * q1.w;
                n1.vy = (n1.vy ?? 0) - dy * SYNC_STRENGTH * q1.h;
              }
              if (n2.fx === undefined) {
                n2.vx = (n2.vx ?? 0) + dx * SYNC_STRENGTH * q2.w;
                n2.vy = (n2.vy ?? 0) + dy * SYNC_STRENGTH * q2.h;
              }
            }
          });
        }
      } else {
        // ── Single-floor mode: original center + bounds ─────────────────
        sim.force("center", d3.forceCenter<SimNode>(CANVAS_W / 2, CANVAS_H / 2).strength(0.04));
        sim.force("bounds", () => {
          const BOUND = 10;
          for (const n of nodes) {
            if (n.fx !== undefined) continue;
            const hw = n.width / 2 + BOUND;
            const hh = n.height / 2 + BOUND;
            const nx = n.x ?? CANVAS_W / 2;
            const ny = n.y ?? CANVAS_H / 2;
            if (nx < hw) { n.x = hw; n.vx = Math.abs(n.vx ?? 0) * 0.3; }
            if (nx > CANVAS_W - hw) { n.x = CANVAS_W - hw; n.vx = -Math.abs(n.vx ?? 0) * 0.3; }
            if (ny < hh) { n.y = hh; n.vy = Math.abs(n.vy ?? 0) * 0.3; }
            if (ny > CANVAS_H - hh) { n.y = CANVAS_H - hh; n.vy = -Math.abs(n.vy ?? 0) * 0.3; }
          }
        });
      }

      sim.on("tick", () => {
        const updated: Room[] = nodes.map((n) => {
          const rx = (n.x ?? 0) - n.width / 2;
          const ry = (n.y ?? 0) - n.height / 2;
          if (multiFloor) {
            const quad = FLOOR_QUADS[n.floor ?? "1F"];
            return {
              ...n,
              x: Math.max(quad.x, Math.min(quad.x + quad.w - n.width, rx)),
              y: Math.max(quad.y, Math.min(quad.y + quad.h - n.height, ry)),
            };
          }
          return {
            ...n,
            x: Math.max(0, Math.min(CANVAS_W - n.width, rx)),
            y: Math.max(0, Math.min(CANVAS_H - n.height, ry)),
          };
        });
        onRoomsChange(updated);
      });

      sim.on("end", () => setIsRunning(false));
      simRef.current = sim;
      setIsRunning(true);
    },
    [onRoomsChange]
  );

  const pinNode = useCallback((id: string, cx: number, cy: number) => {
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    node.fx = cx;
    node.fy = cy;
    simRef.current?.alpha(0.15).restart();
  }, []);

  const unpinNode = useCallback((id: string) => {
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    node.fx = undefined;
    node.fy = undefined;
    simRef.current?.alpha(0.15).restart();
  }, []);

  useEffect(() => () => { simRef.current?.stop(); }, []);

  return { isRunning, linkStrength, setLinkStrength, run, stop, pinNode, unpinNode };
}
