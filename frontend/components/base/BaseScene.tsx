"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

import {
  MAP_HALF,
  type Village,
} from "@/lib/base";

import Building from "./Building";
import { GlbModel } from "./GlbModel";
import Troop, { CoinBurst, Envoy } from "./Troop";
import type { DirectorState } from "./useBaseDirector";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const GRASS_A = new THREE.Color("#5d9c4f");
const GRASS_B = new THREE.Color("#548f47");

/** Grass ground tiles with a slight per-tile tint, instanced for speed. */
function Ground() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const tiles = (MAP_HALF * 2) * (MAP_HALF * 2);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(() => {
    const arr: THREE.Color[] = [];
    for (let i = 0; i < tiles; i++) {
      arr.push((i * 7 + ((i / 13) | 0)) % 3 === 0 ? GRASS_B : GRASS_A);
    }
    return arr;
  }, [tiles]);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    let i = 0;
    for (let x = -MAP_HALF; x < MAP_HALF; x++) {
      for (let z = -MAP_HALF; z < MAP_HALF; z++) {
        dummy.position.set(x + 0.5, -0.05, z + 0.5);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        m.setColorAt(i, colors[i]);
        i += 1;
      }
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [dummy, colors]);

  return (
    <group>
      <instancedMesh ref={mesh} args={[undefined, undefined, tiles]} receiveShadow>
        <boxGeometry args={[1, 0.1, 1]} />
        <meshStandardMaterial roughness={1} metalness={0} />
      </instancedMesh>
      {/* hills around the border */}
      {Array.from({ length: 18 }).map((_, i) => {
        const a = (i / 18) * Math.PI * 2;
        const r = MAP_HALF + 0.4;
        return (
          <group
            key={i}
            position={[Math.cos(a) * r, 0, Math.sin(a) * r]}
            rotation={[0, a, 0]}
            scale={1.4}
          >
            <GlbModel model="ground-hills" receiveShadow={false} />
          </group>
        );
      })}
    </group>
  );
}

/** Stone path network (road tiles from the village layout). */
function Paths({ village }: { village: Village }) {
  return (
    <group>
      {village.paths.map((p, i) => (
        <group key={i} position={[p.position.x, 0.02, p.position.z]} rotation={[0, p.ry, 0]}>
          <GlbModel model="road" receiveShadow />
        </group>
      ))}
    </group>
  );
}

/** Walls between defences sharing a cause family + the inner wall ring. */
function Walls({ village }: { village: Village }) {
  return (
    <group>
      {village.walls.map((w, i) => {
        const dx = w.b.x - w.a.x;
        const dz = w.b.z - w.a.z;
        const dist = Math.hypot(dx, dz);
        const n = Math.max(1, Math.round(dist));
        const ry = Math.atan2(dx, dz);
        return (
          <group key={i}>
            {Array.from({ length: n }).map((_, j) => (
              <group
                key={j}
                position={[
                  w.a.x + (dx * j) / n,
                  0,
                  w.a.z + (dz * j) / n,
                ]}
                rotation={[0, ry, 0]}
              >
                <GlbModel model="wall" />
              </group>
            ))}
          </group>
        );
      })}
    </group>
  );
}

/** Attacker camps on the map edge (banner + cart). */
function Camps({ village }: { village: Village }) {
  return (
    <group>
      {[0, 4].map((i) => {
        const p = village.spawnPoints[i % village.spawnPoints.length];
        return (
          <group key={i} position={[p.x * 0.96, 0, p.z * 0.96]}>
            <GlbModel model="banner-red" />
            <group position={[0.9, 0, 0.4]} rotation={[0, 0.6, 0]}>
              <GlbModel model="cart" />
            </group>
          </group>
        );
      })}
    </group>
  );
}

export interface BaseSceneProps {
  village: Village;
  director: DirectorState | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  showLabels: boolean;
  height?: string | number;
}

/**
 * The 3D village. Orthographic isometric camera, soft shadowed sunlight, pan
 * and zoom with limits, tap/click to select a building. Touch works through
 * OrbitControls; under prefers-reduced-motion there is no idle animation and
 * no automatic camera motion.
 */
export default function BaseScene({
  village,
  director,
  selectedId,
  onSelect,
  showLabels,
  height = "100%",
}: BaseSceneProps) {
  const reduced = usePrefersReducedMotion();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);

  return (
    <Canvas
      orthographic
      shadows
      dpr={[1, 2]}
      camera={{ position: [16, 16, 16], zoom: 24, near: -60, far: 160 }}
      style={{ height, width: "100%", touchAction: "none" }}
      onPointerMissed={() => onSelect(null)}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#141a22"]} />
      <hemisphereLight args={["#d6e6ff", "#3c4a33", 1.0]} />
      <directionalLight
        position={[14, 22, 8]}
        intensity={1.8}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-far={60}
        shadow-bias={-0.0004}
      />
      <ambientLight intensity={0.25} />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={[0, 0, 0]}
        enableRotate={false}
        enableZoom
        minZoom={13}
        maxZoom={55}
        enablePan
        screenSpacePanning
        zoomToCursor={false}
        enableDamping={!reduced}
        dampingFactor={0.2}
        onChange={(e?: unknown) => {
          // pan limits
          const t = (e as { target?: THREE.Vector3 } | undefined)?.target;
          if (t) {
            t.x = THREE.MathUtils.clamp(t.x, -MAP_HALF + 2, MAP_HALF - 2);
            t.z = THREE.MathUtils.clamp(t.z, -MAP_HALF + 2, MAP_HALF - 2);
            t.y = THREE.MathUtils.clamp(t.y, -2, 6);
          }
        }}
      />

      <Ground />
      <Paths village={village} />
      <Walls village={village} />
      <Camps village={village} />

      {village.decor.map((d, i) => (
        <group
          key={`decor-${i}`}
          position={[d.position.x, 0, d.position.z]}
          rotation={[0, d.ry, 0]}
          scale={d.scale}
        >
          <GlbModel model={d.model} receiveShadow />
        </group>
      ))}

      {/* treasury in the centre */}
      <Building
        building={{
          kind: "treasury",
          label: village.treasury.label,
          position: village.treasury.position,
        }}
        label={village.treasury.label}
        showLabel={showLabels && !village.public}
        selected={selectedId === "treasury"}
        visual={{
          damaged: false,
          destroyed: director?.treasuryDestroyed ?? false,
          firing: 0,
        }}
        reduced={reduced}
        onSelect={onSelect}
      />

      {village.buildings.map((b) => (
        <Building
          key={b.id}
          building={b}
          label={b.label}
          showLabel={showLabels && !village.public}
          selected={selectedId === b.id}
          visual={{
            damaged: (director?.damage[b.id] ?? 0) > 0,
            destroyed: false,
            firing: director?.firing[b.id] ?? 0,
          }}
          reduced={reduced}
          onSelect={onSelect}
        />
      ))}

      {director?.squads.map((s) => (
        <Troop key={s.id} squad={s} reduced={reduced} speedUp={director.speedUp} />
      ))}
      {director?.envoys.map((e) => (
        <Envoy key={e.id} from={e.from} to={e.to} text={e.text} reduced={reduced} />
      ))}
      <CoinBurst at={village.treasury.position} active={director?.treasuryDestroyed ?? false} />
    </Canvas>
  );
}
