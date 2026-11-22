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

/** Walk time for a fresh march: 1.5-2.5 s whatever the path length. */
export function marchSeconds(path: Vec[]): number {
  return THREE.MathUtils.clamp(pathLength(path) / 8, 1.5, 2.5);
}

const TROOP_SCALE = 2.6; // Kenney mini characters next to castle-kit towers

/**
 * A troop squad: a Kenney character marching along the stone path from the map
 * edge to the targeted building in 1.5-2.5 s, carrying a one-line speech bubble
 * with the (truncated) player message. Defeated: a puff of smoke and it falls;
 * sent back: walks home with a white flag. Reduced motion: no bob, it jumps to
 * where the director says it is.
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
  // distance walked along the path; speed fixed at spawn so an extended path
  // (damage beat: advance to the inner wall) continues smoothly
  const walked = useRef(squad.status === "marching" ? 0 : pathLength(squad.path));
  const speed = useMemo(() => pathLength(squad.path) / marchSeconds(squad.path), []); // eslint-disable-line react-hooks/exhaustive-deps
  const model = TROOP_MODELS[squad.id % TROOP_MODELS.length];

  useFrame((state, dt) => {
    if (!group.current) return;
    const total = pathLength(squad.path);
    const step = reduced ? total : dt * speed * (speedUp ? 2 : 1);
    if (squad.status === "marching" || squad.status === "reached") {
      walked.current = Math.min(total, walked.current + step);
    } else if (squad.status === "sentBack") {
      walked.current = Math.max(0, walked.current - step);
    }
    const t = walked.current / total;
    const p = pointAt(squad.path, t);
    const ahead = pointAt(squad.path, Math.min(1, t + 0.01));
    const moving = squad.status !== "defeated" && t > 0 && t < 1;
    group.current.position.set(p.x, 0, p.z);
    if (!reduced && moving) {
      group.current.position.y = Math.abs(Math.sin(state.clock.elapsedTime * 10 + squad.id)) * 0.08;
    }
    if (ahead.x !== p.x || ahead.z !== p.z) {
      const angle = Math.atan2(ahead.x - p.x, ahead.z - p.z);
      group.current.rotation.y = squad.status === "sentBack" ? angle + Math.PI : angle;
    }
    if (squad.status === "defeated") {
      group.current.rotation.x = -Math.PI / 2; // fall over where it stands
      group.current.position.y = 0.15;
    } else {
      group.current.rotation.x = 0;
    }
  });

  return (
    <group ref={group} position={[squad.path[0].x, 0, squad.path[0].z]}>
      <group scale={TROOP_SCALE}>
        <GlbModel model={model} />
      </group>
      {squad.status === "defeated" && !reduced && <Puff />}
      {squad.status === "sentBack" && (
        <group position={[0.35, 1.1, 0]}>
          <mesh>
            <cylinderGeometry args={[0.03, 0.03, 0.9, 6]} />
            <meshStandardMaterial color="#8a6a46" />
          </mesh>
          <mesh position={[0.17, 0.32, 0]}>
            <planeGeometry args={[0.34, 0.22]} />
            <meshStandardMaterial color="#f4f1ea" side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
      {squad.text && squad.status !== "defeated" && (
        <Html position={[0, 2.1, 0]} center zIndexRange={[20, 0]} className="pointer-events-none select-none">
          <div className="whitespace-nowrap rounded-lg border border-room-line bg-room-bg/95 px-2 py-1 text-[11px] text-room-text shadow">
            {squad.text}
          </div>
        </Html>
      )}
    </group>
  );
}

/** Defeat puff: a few grey spheres that swell and fade out in 0.7 s. */
function Puff() {
  const group = useRef<THREE.Group>(null);
  const age = useRef(0);
  const offsets = useMemo(
    () => Array.from({ length: 6 }, (_, i) => new THREE.Vector3(Math.cos(i) * 0.35, 0.3 + (i % 3) * 0.2, Math.sin(i) * 0.35)),
    []
  );
  useFrame((_, dt) => {
    if (!group.current) return;
    age.current += dt;
    const k = Math.min(1, age.current / 0.7);
    group.current.visible = k < 1;
    group.current.children.forEach((c, i) => {
      c.position.copy(offsets[i]).multiplyScalar(1 + k * 1.5);
      c.scale.setScalar(0.25 + k * 0.5);
      ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
    });
  });
  // the troop group is tipped over (rotation.x = -90deg), so tip the puff back upright
  return (
    <group ref={group} rotation={[Math.PI / 2, 0, 0]}>
      {offsets.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[1, 10, 10]} />
          <meshBasicMaterial color="#d9d6cf" transparent depthWrite={false} />
        </mesh>
      ))}
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
    t.current = reduced ? 1 : Math.min(1, t.current + dt / 1.6);
    const p = {
      x: from.x + (to.x - from.x) * t.current,
      z: from.z + (to.z - from.z) * t.current,
    };
    group.current.position.set(p.x, 0, p.z);
    group.current.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
  });
  return (
    <group ref={group} position={[from.x, 0, from.z]}>
      <group scale={TROOP_SCALE}>
        <GlbModel model={ENVOY_MODEL} />
      </group>
      {text && (
        <Html position={[0, 2.1, 0]} center zIndexRange={[20, 0]} className="pointer-events-none select-none">
          <div className="whitespace-nowrap rounded-lg border border-room-line bg-room-panel-2/95 px-2 py-1 text-[11px] text-room-text shadow">
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
