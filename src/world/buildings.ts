import * as THREE from "three";
import { BoxBatcher, createRng, pick } from "./build/geom";
import { facadeTextures, shopFrontTexture, type FacadeKind } from "./textures";
import { CITY_HALF, innerMin, innerSize, LAYOUT, type Rect } from "./layout";

export type BuildingInfo = {
  rect: Rect;
  height: number;
  kind: FacadeKind;
  cx: number;
  cz: number;
  w: number;
  d: number;
};

export type ParkInfo = Rect & { cx: number; cz: number };

export type WorldMeshes = {
  ground: THREE.Mesh;
  sidewalks: THREE.Mesh;
  markings: THREE.Mesh;
  facades: { mesh: THREE.Mesh; kind: FacadeKind }[];
  shops: THREE.Mesh;
  roofs: THREE.Mesh;
  grass: THREE.Mesh;
  kerbs: THREE.Mesh;
  buildings: BuildingInfo[];
  parks: ParkInfo[];
};

/** Blocks reserved for the tall landmarks: [blockX, blockZ, height] */
const LANDMARKS: { bx: number; bz: number; h: number }[] = [
  { bx: 2, bz: 2, h: 72 },
  { bx: 4, bz: 1, h: 58 },
  { bx: 1, bz: 4, h: 50 },
];

/** wall texture tile is 7.2 × 7.2 m (4 windows × 4 floors) */
const WALL_UV = 1 / 7.2;

const facadeCache = new Map<FacadeKind, ReturnType<typeof facadeTextures>>();
function facade(kind: FacadeKind) {
  let t = facadeCache.get(kind);
  if (!t) {
    t = facadeTextures(kind);
    facadeCache.set(kind, t);
  }
  return t;
}

/** Recursive split of a block into 1-4 building lots. */
function splitLots(rect: Rect, rand: () => number): Rect[] {
  const lots: Rect[] = [];
  const queue: { r: Rect; depth: number }[] = [{ r: rect, depth: 0 }];

  while (queue.length) {
    const { r, depth } = queue.pop()!;
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const smallest = Math.min(w, d);

    if (depth >= 2 || smallest < 12 || (smallest < 17 && rand() < 0.7)) {
      lots.push(r);
      continue;
    }

    const t = 0.38 + rand() * 0.24;
    if (w >= d) {
      const cut = r.x0 + w * t;
      queue.push({ r: { ...r, x1: cut }, depth: depth + 1 });
      queue.push({ r: { ...r, x0: cut }, depth: depth + 1 });
    } else {
      const cut = r.z0 + d * t;
      queue.push({ r: { ...r, z1: cut }, depth: depth + 1 });
      queue.push({ r: { ...r, z0: cut }, depth: depth + 1 });
    }
  }
  return lots;
}

export function buildWorld(): WorldMeshes {
  const rand = createRng(20241121);

  const buildings: BuildingInfo[] = [];
  const parks: ParkInfo[] = [];

  // ------------------------------------------------------------- ground
  const groundSize = 700;
  const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
  groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshStandardMaterial({ color: 0x8d8d8d, roughness: 0.95, metalness: 0.02 })
  );
  ground.name = "ground";
  ground.receiveShadow = true;

  // ---------------------------------------------------------- batchers
  const walkBatch = new BoxBatcher();
  const markBatch = new BoxBatcher();
  const kerbBatch = new BoxBatcher();
  const roofBatch = new BoxBatcher();
  const shopBatch = new BoxBatcher();
  const grassBatch = new BoxBatcher();
  const facadeBatches = new Map<FacadeKind, BoxBatcher>();
  const batchFor = (kind: FacadeKind) => {
    let b = facadeBatches.get(kind);
    if (!b) {
      b = new BoxBatcher();
      facadeBatches.set(kind, b);
    }
    return b;
  };

  // ------------------------------------------------------- road markings
  const edge = CITY_HALF - LAYOUT.road / 2;
  for (let i = 0; i <= LAYOUT.blocks; i++) {
    const c = -CITY_HALF + LAYOUT.road / 2 + i * (LAYOUT.block + LAYOUT.road);

    // dashed centre lines
    for (let t = -edge + 6; t < edge - 6; t += 10) {
      markBatch.addQuad(new THREE.Vector3(c, 0, t), 0.22, 4.2, 0, 0.02);
      markBatch.addQuad(new THREE.Vector3(t, 0, c), 4.2, 0.22, 0, 0.02);
    }

    // crosswalks on both axes at every junction
    for (let j = 0; j <= LAYOUT.blocks; j++) {
      const cz = -CITY_HALF + LAYOUT.road / 2 + j * (LAYOUT.block + LAYOUT.road);
      for (let k = -3; k <= 3; k++) {
        // stripes trailing away from the junction along z and x
        markBatch.addQuad(
          new THREE.Vector3(c + k * 2.2, 0, cz - LAYOUT.road / 2 - 2),
          1.05,
          3.2,
          0,
          0.021
        );
        markBatch.addQuad(
          new THREE.Vector3(c + k * 2.2, 0, cz + LAYOUT.road / 2 + 2),
          1.05,
          3.2,
          0,
          0.021
        );
        markBatch.addQuad(
          new THREE.Vector3(c - LAYOUT.road / 2 - 2, 0, cz + k * 2.2),
          3.2,
          1.05,
          0,
          0.021
        );
        markBatch.addQuad(
          new THREE.Vector3(c + LAYOUT.road / 2 + 2, 0, cz + k * 2.2),
          3.2,
          1.05,
          0,
          0.021
        );
      }
    }
  }

  // --------------------------------------------------------------- blocks
  const inner = innerSize();

  for (let bx = 0; bx < LAYOUT.blocks; bx++) {
    for (let bz = 0; bz < LAYOUT.blocks; bz++) {
      const ix0 = innerMin(bx);
      const iz0 = innerMin(bz);

      // sidewalk ring with a kerb
      const sw = inner + LAYOUT.sidewalk * 2;
      const sx = ix0 - LAYOUT.sidewalk + sw / 2;
      const sz = iz0 - LAYOUT.sidewalk + sw / 2;
      walkBatch.add(sx, 0.075, sz, sw, 0.15, sw, {
        uvPerMeter: 1 / 3,
        skipBottom: true,
      });

      // kerb strips along the four edges (slightly higher + darker)
      const kt = 0.42;
      kerbBatch.add(sx, 0.105, sz - sw / 2 + kt / 2, sw, 0.21, kt, { uvPerMeter: 1 });
      kerbBatch.add(sx, 0.105, sz + sw / 2 - kt / 2, sw, 0.21, kt, { uvPerMeter: 1 });
      kerbBatch.add(sx - sw / 2 + kt / 2, 0.105, sz, kt, 0.21, sw, { uvPerMeter: 1 });
      kerbBatch.add(sx + sw / 2 - kt / 2, 0.105, sz, kt, 0.21, sw, { uvPerMeter: 1 });

      // yellow-black kerb markers at the block corners
      for (const [ox, oz] of [[-1, -1], [1, 1], [-1, 1], [1, -1]] as [number, number][]) {
        kerbBatch.add(sx + ox * (sw / 2 - 0.3), 0.12, sz + oz * (sw / 2 - 0.3), 0.5, 0.24, 0.5, {
          uvPerMeter: 1,
        });
      }

      const blockRect: Rect = { x0: ix0, z0: iz0, x1: ix0 + inner, z1: iz0 + inner };

      // reserved blocks for the landmark towers
      const landmark = LANDMARKS.find((l) => l.bx === bx && l.bz === bz);
      if (landmark) {
        const cx = (blockRect.x0 + blockRect.x1) / 2;
        const cz = (blockRect.z0 + blockRect.z1) / 2;
        const t = batchFor("glass");
        const h = landmark.h;
        // stepped tower: wide lobby, shaft, crown
        t.add(cx, 5, cz, 22, 10, 22, { uvPerMeter: WALL_UV, skipBottom: true });
        t.add(cx, 10 + (h - 10) / 2, cz, 16, h - 10, 16, { uvPerMeter: WALL_UV, skipBottom: true });
        t.add(cx, h + 3, cz, 10, 6, 10, { uvPerMeter: WALL_UV, skipBottom: true });
        roofBatch.add(cx, 10.2, cz, 22.6, 0.4, 22.6, { uvPerMeter: 1 / 3 });
        roofBatch.add(cx, h + 0.3, cz, 16.4, 0.6, 16.4, { uvPerMeter: 1 / 3 });
        // red aviation beacon (a small emissive box high up)
        roofBatch.add(cx, h + 6.4, cz, 0.7, 0.7, 0.7, { uvPerMeter: 2 });
        buildings.push({
          rect: blockRect,
          height: h,
          kind: "glass",
          cx,
          cz,
          w: 22,
          d: 22,
        });
        continue;
      }

      // park block (about one in six)
      if ((bx * 7 + bz * 5) % 11 === 3) {
        const cx = (blockRect.x0 + blockRect.x1) / 2;
        const cz = (blockRect.z0 + blockRect.z1) / 2;
        grassBatch.add(cx, 0.09, cz, inner - 1, 0.18, inner - 1, {
          uvPerMeter: 1 / 6,
          skipBottom: true,
        });
        // fountain / statue base
        roofBatch.add(cx, 0.5, cz, 3.2, 1, 3.2, { uvPerMeter: 1 / 2 });
        roofBatch.add(cx, 1.6, cz, 1.2, 1.6, 1.2, { uvPerMeter: 1 / 2 });
        parks.push({ ...blockRect, cx, cz });
        continue;
      }

      for (const lot of splitLots(blockRect, rand)) {
        const gap = 1.1;
        const w = lot.x1 - lot.x0 - gap * 2;
        const d = lot.z1 - lot.z0 - gap * 2;
        if (w < 6.5 || d < 6.5) continue;

        const cx = (lot.x0 + lot.x1) / 2;
        const cz = (lot.z0 + lot.z1) / 2;

        // downtown is taller: distance from the middle of the map
        const dist = Math.min(1, Math.hypot(cx, cz) / (CITY_HALF * 0.85));
        const maxH = THREE.MathUtils.lerp(38, 10, dist);
        const height = THREE.MathUtils.clamp(maxH * (0.5 + rand() * 0.9), 7, 42);

        const kind: FacadeKind =
          height > 27 ? "glass" : pick<FacadeKind>(["plaster", "brick", "concrete", "plaster", "brick"]);
        const batch = batchFor(kind);

        // A realistic mass: a wider base with one or two set-backs on top.
        const upper = height > 18 ? height * (0.55 + rand() * 0.18) : height;
        const baseH = height - upper;

        if (baseH > 0.5) {
          batch.add(cx, baseH / 2, cz, w, baseH, d, { uvPerMeter: WALL_UV, skipBottom: true });
          // cornice between the base and the tower
          roofBatch.add(cx, baseH + 0.12, cz, w + 0.7, 0.24, d + 0.7, { uvPerMeter: 1 / 3 });
          const tw = w * (0.68 + rand() * 0.16);
          const td = d * (0.68 + rand() * 0.16);
          batch.add(cx, baseH + upper / 2, cz, tw, upper, td, { uvPerMeter: WALL_UV, skipBottom: true });
          if (rand() < 0.5 && upper > 8) {
            // a second, smaller set-back
            const t2h = upper * 0.4;
            batch.add(cx, baseH + upper + t2h / 2, cz, tw * 0.7, t2h, td * 0.7, {
              uvPerMeter: WALL_UV,
              skipBottom: true,
            });
          }
          // balconies on brick/plaster buildings
          if ((kind === "brick" || kind === "plaster") && baseH > 7) {
            const floors = Math.min(5, Math.floor(baseH / 3.2));
            for (let f = 1; f <= floors; f++) {
              const y = f * 3.2 - 0.4;
              if (y > baseH - 1) break;
              if (rand() < 0.6) {
                roofBatch.add(cx, y, cz - d / 2 - 0.35, Math.min(w * 0.55, 4.2), 0.12, 0.7, {
                  uvPerMeter: 1 / 2,
                });
              }
              if (rand() < 0.6) {
                roofBatch.add(cx + w / 2 + 0.35, y, cz, 0.7, 0.12, Math.min(d * 0.5, 4.0), {
                  uvPerMeter: 1 / 2,
                });
              }
            }
          }
        } else {
          batch.add(cx, height / 2, cz, w, height, d, { uvPerMeter: WALL_UV, skipBottom: true });
        }

        // parapet
        roofBatch.add(cx, height + 0.2, cz, w + 0.35, 0.4, d + 0.35, { uvPerMeter: 1 / 3 });
        // rooftop clutter: AC units / water tanks / stair house
        const clutterCount = 1 + Math.floor(rand() * 2);
        for (let i = 0; i < clutterCount; i++) {
          const uw = Math.min(w * 0.3, 3.6);
          const ud = Math.min(d * 0.3, 3.6);
          const ux = cx + (rand() - 0.5) * Math.max(0.5, w - uw - 1);
          const uz = cz + (rand() - 0.5) * Math.max(0.5, d - ud - 1);
          roofBatch.add(ux, height + 0.9, uz, uw, 1.4, ud, { uvPerMeter: 1 / 2 });
        }

        // ground floor shop front: thin slab on the street-facing side (both -z and +x sides)
        const shopH = 3.1;
        shopBatch.add(cx, shopH / 2, cz - d / 2 - 0.06, Math.max(2, w - 1), shopH, 0.12, {
          uvPerMeter: 1 / 5,
        });
        shopBatch.add(cx + w / 2 + 0.06, shopH / 2, cz, 0.12, shopH, Math.max(2, d - 1), {
          uvPerMeter: 1 / 5,
        });
        shopBatch.add(cx, shopH / 2, cz + d / 2 + 0.06, Math.max(2, w - 1), shopH, 0.12, {
          uvPerMeter: 1 / 5,
        });
        shopBatch.add(cx - w / 2 - 0.06, shopH / 2, cz, 0.12, shopH, Math.max(2, d - 1), {
          uvPerMeter: 1 / 5,
        });
        // awning ledge
        roofBatch.add(cx, shopH + 0.18, cz - d / 2 - 0.5, Math.max(2, w - 1), 0.2, 1.1, {
          uvPerMeter: 1 / 2,
        });

        buildings.push({ rect: lot, height, kind, cx, cz, w, d });
      }
    }
  }

  // ------------------------------------------------- hazy skyline
  const skyBatch = batchFor("concrete");
  for (let i = 0; i < 90; i++) {
    const ang = (i / 90) * Math.PI * 2 + rand() * 0.05;
    const rad = CITY_HALF + 70 + rand() * 170;
    const sx = Math.cos(ang) * rad;
    const sz = Math.sin(ang) * rad;
    const sh = 14 + rand() * 46;
    const sw2 = 14 + rand() * 20;
    skyBatch.add(sx, sh / 2, sz, sw2, sh, sw2, { uvPerMeter: WALL_UV, skipBottom: true });
  }

  // ------------------------------------------------------------- meshes
  const sidewalks = new THREE.Mesh(
    walkBatch.build(),
    new THREE.MeshStandardMaterial({ color: 0xbdb9af, roughness: 0.92 })
  );
  sidewalks.receiveShadow = true;
  sidewalks.name = "sidewalks";

  const kerbs = new THREE.Mesh(
    kerbBatch.build(),
    new THREE.MeshStandardMaterial({ color: 0x9c9a92, roughness: 0.85 })
  );
  kerbs.receiveShadow = true;
  kerbs.castShadow = true;

  const markings = new THREE.Mesh(
    markBatch.build(),
    new THREE.MeshStandardMaterial({
      color: 0xf4f3ee,
      roughness: 0.8,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    })
  );
  markings.name = "markings";

  const roofs = new THREE.Mesh(
    roofBatch.build(),
    new THREE.MeshStandardMaterial({ color: 0x8b8880, roughness: 0.9 })
  );
  roofs.castShadow = true;
  roofs.receiveShadow = true;

  const shopTex = shopFrontTexture(0);
  const shops = new THREE.Mesh(
    shopBatch.build(),
    new THREE.MeshStandardMaterial({
      map: shopTex,
      roughness: 0.5,
      metalness: 0.05,
      color: 0xffffff,
    })
  );
  shops.castShadow = false;
  shops.receiveShadow = true;

  const grass = new THREE.Mesh(
    grassBatch.build(),
    new THREE.MeshStandardMaterial({ color: 0x6f9257, roughness: 0.95 })
  );
  grass.receiveShadow = true;

  const facades: { mesh: THREE.Mesh; kind: FacadeKind }[] = [];
  for (const [kind, batch] of facadeBatches) {
    const tex = facade(kind);
    const mesh = new THREE.Mesh(
      batch.build(),
      new THREE.MeshStandardMaterial({
        map: tex.map,
        roughnessMap: tex.roughnessMap,
        roughness: 0.9,
        metalness: kind === "glass" ? 0.4 : 0.02,
        envMapIntensity: 0.7,
      })
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `facades-${kind}`;
    facades.push({ mesh, kind });
  }

  return { ground, sidewalks, kerbs, markings, facades, shops, roofs, grass, buildings, parks };
}

/** Bounding boxes for collision: buildings plus park monuments. */
export function collisionRects(world: WorldMeshes) {
  const rects = world.buildings.map((b) => ({
    x0: b.cx - b.w / 2,
    x1: b.cx + b.w / 2,
    z0: b.cz - b.d / 2,
    z1: b.cz + b.d / 2,
    height: b.height,
  }));
  for (const p of world.parks) {
    rects.push({ x0: p.cx - 1.6, x1: p.cx + 1.6, z0: p.cz - 1.6, z1: p.cz + 1.6, height: 2.4 });
  }
  return rects;
}
