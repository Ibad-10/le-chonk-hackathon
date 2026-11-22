// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { ENVOY_MODEL, KIND_PARTS, SCAFFOLD_PARTS, TREASURY_DESTROYED_PARTS, TREASURY_PARTS, TROOP_MODELS } from "./base";

const DIR = join(__dirname, "..", "public", "base");

/** Image URIs referenced by a .glb (JSON chunk of the binary glTF). */
function imageUris(file: string): string[] {
  const b = readFileSync(join(DIR, file));
  const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
  return (json.images ?? []).map((i: { uri?: string }) => i.uri).filter(Boolean);
}

describe("village assets", () => {
  it("every Kenney GLB finds its external colormap (else the village renders white)", () => {
    const glbs = readdirSync(DIR).filter((f) => f.endsWith(".glb"));
    expect(glbs.length).toBeGreaterThan(10);
    for (const f of glbs) {
      const uris = imageUris(f);
      expect(uris.length, f).toBeGreaterThan(0);
      for (const uri of uris) expect(existsSync(join(DIR, uri)), `${f} -> ${uri}`).toBe(true);
    }
  });

  it("every model the village config names exists", () => {
    const parts = [
      ...SCAFFOLD_PARTS,
      ...TREASURY_PARTS,
      ...TREASURY_DESTROYED_PARTS,
      ...Object.values(KIND_PARTS).flat(2),
    ].map((p) => p.model);
    for (const m of new Set([...parts, ...TROOP_MODELS, ENVOY_MODEL, "road", "wall", "ground-hills", "banner-red", "cart"])) {
      expect(existsSync(join(DIR, `${m}.glb`)), m).toBe(true);
    }
  });
});
