"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

import {
  KIND_PARTS,
  SCAFFOLD_PARTS,
  TREASURY_DESTROYED_PARTS,
  TREASURY_PARTS,
  type BaseBuilding,
  type ModelPart,
} from "@/lib/base";

import { ModelPartView } from "./GlbModel";

export interface BuildingVisualState {
  damaged: boolean; // took damage during a run (shows one level lower + scorch)
  destroyed: boolean; // treasury only: conquest
  firing: number; // timestamp-ish counter: defence fired at a troop
}

function partsFor(
  building: BaseBuilding | { kind: "treasury" },
  state: BuildingVisualState
): ModelPart[] {
  if (building.kind === "treasury") {
    return state.destroyed ? TREASURY_DESTROYED_PARTS : TREASURY_PARTS;
  }
  const b = building as BaseBuilding;
  if (state.destroyed) return SCAFFOLD_PARTS;
  if (b.level === 0) return SCAFFOLD_PARTS;
  const level = state.damaged ? Math.max(1, b.level - 1) : b.level;
  return KIND_PARTS[b.kind][level - 1] ?? KIND_PARTS[b.kind][0];
}

/**
 * A defensive building. Click/tap selects it (owner view shows a label).
 * Gentle idle animation: flags sway and the whole building bobs slowly —
 * disabled under prefers-reduced-motion.
 */
export default function Building({
  building,
  label,
  showLabel,
  selected,
  visual,
  reduced,
  onSelect,
}: {
  building: BaseBuilding | { kind: "treasury"; label: string; position: { x: number; z: number } };
  label: string;
  showLabel: boolean;
  selected: boolean;
  visual: BuildingVisualState;
  reduced: boolean;
  onSelect?: (id: string) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const flagRefs = useRef<THREE.Group[]>([]);
  const parts = useMemo(() => partsFor(building, visual), [building, visual]);
  const isTreasury = building.kind === "treasury";
  const id = "id" in building ? building.id : "treasury";

  useFrame((state) => {
    if (reduced) return;
    const t = state.clock.elapsedTime;
    if (group.current) {
      group.current.position.y = Math.sin(t * 1.2 + (building.position.x + building.position.z)) * 0.03;
    }
    flagRefs.current.forEach((f, i) => {
      if (f) f.rotation.z = Math.sin(t * 3 + i * 1.7) * 0.18;
    });
  });

  return (
    <group
      position={[building.position.x, 0, building.position.z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(id);
      }}
    >
      <group ref={group}>
        {parts.map((part, i) => (
          <group
            key={`${part.model}-${i}`}
            ref={(el) => {
              if (el && part.model.startsWith("flag")) flagRefs.current.push(el);
            }}
          >
            <ModelPartView part={part} />
          </group>
        ))}
        {/* selection ring */}
        {selected && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
            <ringGeometry args={[1.35, 1.6, 32]} />
            <meshBasicMaterial color="#f5eef0" transparent opacity={0.9} />
          </mesh>
        )}
        {/* defence firing flash */}
        {visual.firing > 0 && !reduced && (
          <mesh position={[0, 2.2, 0]}>
            <sphereGeometry args={[0.35, 12, 12]} />
            <meshBasicMaterial color="#ffd166" transparent opacity={0.9} />
          </mesh>
        )}
      </group>
      {showLabel && label && (
        <Html
          position={[0, isTreasury ? 6.2 : 3.1, 0]}
          center
          distanceFactor={14}
          className="pointer-events-none select-none"
          zIndexRange={[10, 0]}
        >
          <div
            className={`whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold shadow ${
              isTreasury
                ? "border-room-red bg-room-red/90 text-white"
                : "border-room-line bg-room-panel/90 text-room-text"
            } ${selected ? "ring-2 ring-room-red-soft" : ""}`}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}
