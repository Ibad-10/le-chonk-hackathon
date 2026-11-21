"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";

import type { ModelPart } from "@/lib/base";

export const BASE_ASSET = (model: string) => `/base/${model}.glb`;

/**
 * One Kenney GLB (CC0, see public/base/CREDITS.md), cloned so it can be placed
 * many times. Meshes cast/receive shadows; materials are left as authored.
 */
export function GlbModel({
  model,
  castShadow = true,
  receiveShadow = true,
}: {
  model: string;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const { scene } = useGLTF(BASE_ASSET(model));
  const cloned = useMemo(() => {
    const c = skeletonClone(scene);
    c.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = castShadow;
        obj.receiveShadow = receiveShadow;
      }
    });
    return c;
  }, [scene, castShadow, receiveShadow]);
  return <primitive object={cloned} />;
}

/** A building part (position/rotation/scale from lib/base.ts model config). */
export function ModelPartView({ part }: { part: ModelPart }) {
  return (
    <group
      position={[part.x ?? 0, part.y ?? 0, part.z ?? 0]}
      rotation={[0, part.ry ?? 0, 0]}
      scale={part.scale ?? 1}
    >
      <GlbModel model={part.model} />
    </group>
  );
}

export function preloadBaseAssets(models: string[]) {
  models.forEach((m) => useGLTF.preload(BASE_ASSET(m)));
}
