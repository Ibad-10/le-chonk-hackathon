"use client";

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Bounds, OrbitControls, useBounds } from "@react-three/drei";
import { LocateFixed } from "lucide-react";

import {
  MAP_HALF,
  ENVOY_MODEL,
  KIND_PARTS,
  SCAFFOLD_PARTS,
  TREASURY_DESTROYED_PARTS,
  TROOP_MODELS,
  mulberry32,
  type Village,
} from "@/lib/base";

import Building from "./Building";
import { GlbModel, preloadBaseAssets } from "./GlbModel";
import Troop, { CoinBurst, Envoy } from "./Troop";
import type { DirectorState } from "./useBaseDirector";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

// Everything that can appear mid-run is fetched up front: a model loading on
// demand would suspend the canvas (blank frame + camera refit) and delay troops.
preloadBaseAssets([
  ...new Set([
    ...TROOP_MODELS,
    ENVOY_MODEL,
    ...[...SCAFFOLD_PARTS, ...TREASURY_DESTROYED_PARTS, ...Object.values(KIND_PARTS).flat(2)].map((p) => p.model),
  ]),
]);

const GRASS_A = new THREE.Color("#5a9a4b");
const GRASS_B = new THREE.Color("#4e8b42");

/** Grass ground tiles with a subtle seeded per-tile tint, instanced for speed. */
function Ground() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const tiles = (MAP_HALF * 2) * (MAP_HALF * 2);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(() => {
    const rand = mulberry32(7);
    return Array.from({ length: tiles }, () => GRASS_A.clone().lerp(GRASS_B, rand() * 0.7));
  }, [tiles]);

  // layout effect: instances must be placed before drei Bounds measures the village
  useLayoutEffect(() => {
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
    m.computeBoundingBox();
    m.computeBoundingSphere();
  }, [dummy, colors]);

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, tiles]} receiveShadow>
      <boxGeometry args={[1, 0.1, 1]} />
      <meshStandardMaterial roughness={1} metalness={0} />
    </instancedMesh>
  );
}

/** Hills around the border (outside the camera fit box). */
function Hills() {
  return (
    <group>
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

/** Hands the drei Bounds api to the reset button outside the canvas. */
function BoundsBridge({ apiRef }: { apiRef: MutableRefObject<ReturnType<typeof useBounds> | null> }) {
  const api = useBounds();
  useEffect(() => {
    apiRef.current = api;
  }, [api, apiRef]);
  return null;
}

/** Keep the pan target (and camera with it, so the view never tilts) inside the map. */
function clampPan(controls: { target: THREE.Vector3; object: THREE.Camera } | undefined) {
  if (!controls) return;
  const t = controls.target;
  const before = t.clone();
  t.x = THREE.MathUtils.clamp(t.x, -MAP_HALF + 2, MAP_HALF - 2);
  t.z = THREE.MathUtils.clamp(t.z, -MAP_HALF + 2, MAP_HALF - 2);
  t.y = THREE.MathUtils.clamp(t.y, -2, 6);
  controls.object.position.add(t.clone().sub(before));
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
  const boundsApi = useRef<ReturnType<typeof useBounds> | null>(null);

  return (
    <div className="relative h-full w-full" style={{ height }}>
    <Canvas
      orthographic
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: [16, 16, 16], zoom: 20, near: -60, far: 200 }}
      style={{ height: "100%", width: "100%", touchAction: "none" }}
      onPointerMissed={() => onSelect(null)}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace }}
    >
      <hemisphereLight args={["#cfe6ff", "#5b6b3a", 1.2]} />
      <directionalLight
        position={[14, 22, 8]}
        intensity={2.4}
        color="#ffe7c2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-far={60}
        shadow-bias={-0.0004}
        shadow-radius={4}
      />

      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        enableRotate={false}
        enableZoom
        minZoom={6}
        maxZoom={60}
        enablePan
        screenSpacePanning
        zoomToCursor={false}
        enableDamping={!reduced}
        dampingFactor={0.2}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onChange={(e?: any) => clampPan(e?.target)}
      />

      <Hills />
      {/* camera fits this box on load and on resize (never the troops) */}
      <Bounds fit observe margin={1.02} maxDuration={reduced ? 0.001 : 0.6}>
      <BoundsBridge apiRef={boundsApi} />
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
        showLabel={showLabels && !village.public && selectedId === "treasury"}
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
          showLabel={showLabels && !village.public && selectedId === b.id}
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
      </Bounds>

      {/* own boundary: a late model never hides the village or refits the camera */}
      <Suspense fallback={null}>
      {director?.squads.map((s) => (
        <Troop key={s.id} squad={s} reduced={reduced} speedUp={director.speedUp} />
      ))}
      {director?.envoys.map((e) => (
        <Envoy key={e.id} from={e.from} to={e.to} text={e.text} reduced={reduced} />
      ))}
      <CoinBurst at={village.treasury.position} active={director?.treasuryDestroyed ?? false} />
      </Suspense>
    </Canvas>
    <button
      type="button"
      aria-label="Reset camera"
      title="Reset camera"
      onClick={() => boundsApi.current?.refresh().reset().fit()}
      className="absolute left-3 top-3 z-10 grid size-9 place-items-center rounded-md border border-room-line bg-room-panel/90 text-room-text shadow hover:bg-room-panel-2"
    >
      <LocateFixed size={16} aria-hidden="true" />
    </button>
    </div>
  );
}
