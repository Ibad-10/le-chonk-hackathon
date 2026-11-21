"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";

import { ENVOY_MODEL, TROOP_MODELS, type Vec } from "@/lib/base";

import { GlbModel } from "./GlbModel";

export type SquadStatus = "marching" | "atTarget" | "defeated" | "sentBack" | "reached";

export interface Squad {
  id: number;
  text: string;
  tactic: string | null;
  targetId: string;
  path: Vec[];
  status: SquadStatus;
}

function pathLength(path: Vec[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    len += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  }
  return Math.max(len, 0.001);
}

function pointAt(path: Vec[], t: number): Vec {
  const total = pathLength(path);
  let dist = t * total;
  for (let i = 1; i < path.length; i++) {
    const seg = Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    if (dist <= seg && seg > 0) {
      const k = dist / seg;
      return {
        x: path[i - 1].x + (path[i].x - path[i - 1].x) * k,
        z: path[i - 1].z + (path[i].z - path[i - 1].z) * k,
      };
    }
    dist -= seg;
  }
  return path[path.length - 1];
}

/**
 * A troop squad: a Kenney character marching along the stone path from the map
 * edge to the targeted building, carrying a speech bubble with the (truncated)
 * player message. Falls when defeated, walks back with a white flag when sent
 * back. Reduced motion: no bob, positions jump (progress driven by director).
 */
export default function Troop({
  squad,
  reduced,
  speedUp,
}: {
  squad: Squad;
  reduced: boolean;
  speedUp: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const progress = useRef(squad.status === "marching" ? 0 : 1);
  const model = TROOP_MODELS[squad.id % TROOP_MODELS.length];

  const target = useMemo(() => {
    if (squad.status === "sentBack") return 0;
    if (squad.status === "marching") return 1;
    return progress.current;
  }, [squad.status]);

  useFrame((state, dt) => {
    if (!group.current) return;
    const speed = (reduced ? 6 : 2.2) * (speedUp ? 2.5 : 1); // units per second
    if (squad.status === "marching") {
      progress.current = Math.min(1, progress.current + (dt * speed) / pathLength(squad.path));
    } else if (squad.status === "sentBack") {
      progress.current = Math.max(0, progress.current - (dt * speed) / pathLength(squad.path));
    }
    const t = squad.status === "sentBack" ? progress.current : squad.status === "marching" ? progress.current : target;
    const p = pointAt(squad.path, t);
    const next = pointAt(squad.path, Math.min(1, t + 0.01));
    group.current.position.set(p.x, 0, p.z);
    if (!reduced) {
      group.current.position.y = Math.abs(Math.sin(state.clock.elapsedTime * 8 + squad.id)) * 0.06;
    }
    const angle = Math.atan2(next.x - p.x, next.z - p.z);
    const desired = squad.status === "sentBack" ? angle + Math.PI : angle;
    group.current.rotation.y = desired;
    if (squad.status === "defeated") {
      // fall over where it stands
      group.current.rotation.x = -Math.PI / 2;
      group.current.position.y = 0.1;
    } else {
      group.current.rotation.x = 0;
    }
  });

  return (
    <group ref={group}>
      <group scale={2}>
        <GlbModel model={model} />
      </group>
      {squad.status === "sentBack" && (
        <group position={[0.25, 0.9, 0]}>
          <mesh>
            <cylinderGeometry args={[0.02, 0.02, 0.7, 6]} />
            <meshStandardMaterial color="#e8e8e8" />
          </mesh>
          <mesh position={[0.12, 0.3, 0]}>
            <planeGeometry args={[0.24, 0.16]} />
            <meshStandardMaterial color="#ffffff" side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
      {squad.text && (
        <Html
          position={[0, 1.5, 0]}
          center
         
          zIndexRange={[20, 0]}
          className="pointer-events-none select-none"
        >
          <div className="max-w-[220px] whitespace-nowrap rounded-lg border border-room-line bg-room-bg/95 px-2 py-1 text-[11px] text-room-text shadow">
            {squad.text}
          </div>
        </Html>
      )}
    </group>
  );
}

/** The agent's envoy sallying out of the targeted building with the reply bubble. */
export function Envoy({
  from,
  to,
  text,
  reduced,
}: {
  from: Vec;
  to: Vec;
  text: string;
  reduced: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    if (!group.current) return;
    t.current = reduced ? 1 : Math.min(1, t.current + dt / 0.9);
    const p = {
      x: from.x + (to.x - from.x) * t.current,
      z: from.z + (to.z - from.z) * t.current,
    };
    group.current.position.set(p.x, 0, p.z);
    group.current.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
  });
  return (
    <group ref={group} position={[from.x, 0, from.z]}>
      <group scale={2}>
        <GlbModel model={ENVOY_MODEL} />
      </group>
      {text && (
        <Html position={[0, 1.5, 0]} center zIndexRange={[20, 0]} className="pointer-events-none select-none">
          <div className="max-w-[220px] whitespace-nowrap rounded-lg border border-room-line bg-room-panel-2/95 px-2 py-1 text-[11px] text-room-text shadow">
            {text}
          </div>
        </Html>
      )}
    </group>
  );
}

/** Coins bursting out of the treasury on a conquest. */
export function CoinBurst({ at, active }: { at: Vec; active: boolean }) {
  const coins = useRef<THREE.Group>(null);
  const vel = useRef<{ p: THREE.Vector3; v: THREE.Vector3 }[]>([]);
  const born = useRef(0);
  useFrame((state, dt) => {
    if (!active || !coins.current) return;
    if (vel.current.length === 0) {
      born.current = state.clock.elapsedTime;
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 1.5 + Math.random() * 2.5;
        vel.current.push({
          p: new THREE.Vector3(at.x, 1.5, at.z),
          v: new THREE.Vector3(Math.cos(a) * r, 4 + Math.random() * 3, Math.sin(a) * r),
        });
      }
    }
    const elapsed = state.clock.elapsedTime - born.current;
    coins.current.visible = elapsed < 1.4;
    coins.current.children.forEach((c, i) => {
      const v = vel.current[i];
      if (!v) return;
      v.v.y -= 12 * dt;
      v.p.addScaledVector(v.v, dt);
      if (v.p.y < 0.1) {
        v.p.y = 0.1;
        v.v.set(0, 0, 0);
      }
      c.position.copy(v.p);
      c.rotation.x += dt * 6;
      c.rotation.y += dt * 4;
    });
  });
  if (!active) return null;
  return (
    <group ref={coins}>
      {Array.from({ length: 26 }).map((_, i) => (
        <mesh key={i} castShadow>
          <cylinderGeometry args={[0.14, 0.14, 0.04, 12]} />
          <meshStandardMaterial color="#ffd166" metalness={0.8} roughness={0.25} />
        </mesh>
      ))}
    </group>
  );
}
