import * as THREE from "three";
import { BoxBatcher, createRng, pick } from "./build/geom";
import {
  FACADE_KINDS,
  facadeTextures,
  shopFrontTexture,
  type FacadeKind,
} from "./textures";
import { CITY_HALF, innerMin, innerSize, LAYOUT, type Rect } from "./layout";

export type BuildingInfo = {
  rect: Rect;
  height: number;
  kind: FacadeKind;
  cx: number;
  cz: number;
  w: number;
  d: number;
  floors: number;
};

export type ParkInfo = Rect & { cx: number; cz: number };

export type ShopSign = { text: string; x: number; z: number; rot: number; color: string };

export type WorldMeshes = {
  ground: THREE.Mesh;
  sidewalks: THREE.Mesh;
  markings: THREE.Mesh;
  facades: { mesh: THREE.Mesh; kind: FacadeKind }[];
  shops: THREE.Mesh;
  roofs: THREE.Mesh;
  grass: THREE.Mesh;
  kerbs: THREE.Mesh;
  details: {
    plaster: THREE.Mesh;
    metal: THREE.Mesh;
    wood: THREE.Mesh;
    green: THREE.Mesh;
    trim: THREE.Mesh;
  };
  signs: THREE.Group;
  buildings: BuildingInfo[];
  parks: ParkInfo[];
};

/** wall texture tile is 7.2 × 7.2 m (4 windows × 4 floors) */
const WALL_UV = 1 / 7.2;
const FLOOR_H = 3.2;

/** Blocks reserved for the tall landmarks: [blockX, blockZ, height] */
const LANDMARKS = [
  { bx: 2, bz: 2, h: 72 },
  { bx: 4, bz: 1, h: 58 },
  { bx: 1, bz: 4, h: 50 },
];

const PALETTES: Record<FacadeKind, [number, number, number][]> = {
  // each entry is a tint; tinting the shared texture gives many distinct houses
  plaster: [
    [1.0, 0.97, 0.9],
    [0.95, 0.9, 0.82],
    [0.84, 0.9, 0.86],
    [0.92, 0.84, 0.82],
    [0.88, 0.87, 0.93],
    [0.97, 0.92, 0.8],
  ],
  brick: [
    [1.0, 0.94, 0.9],
    [0.9, 0.86, 0.84],
    [1.05, 1.0, 0.94],
    [0.86, 0.8, 0.76],
  ],
  concrete: [
    [1.0, 1.0, 0.98],
    [0.92, 0.92, 0.9],
    [0.84, 0.85, 0.85],
  ],
  glass: [
    [0.95, 1.0, 1.05],
    [0.85, 0.95, 1.0],
    [1.0, 0.98, 0.94],
  ],
  panel: [
    [0.98, 0.98, 0.96],
    [0.9, 0.93, 0.95],
    [1.0, 0.95, 0.88],
    [0.88, 0.9, 0.86],
  ],
  tile: [
    [1.0, 0.96, 0.9],
    [0.9, 0.9, 0.92],
    [1.0, 0.88, 0.8],
  ],
};

const SHOP_TEXTS = [
  "МАГАЗИН",
  "АПТЕКА",
  "КАФЕ",
  "ХЛЕБ",
  "БАР",
  "ЦВЕТЫ",
  "ТАБАК",
  "ПИЦЦА",
];
const SIGN_COLORS = ["#c8412f", "#2f6a4c", "#2c4a80", "#8a2f6a", "#a86a1e", "#243b52"];

const facadeCache = new Map<FacadeKind, ReturnType<typeof facadeTextures>>();
function facade(kind: FacadeKind) {
  let t = facadeCache.get(kind);
  if (!t) {
    t = facadeTextures(kind);
    facadeCache.set(kind, t);
  }
  return t;
}

/** Recursive split of a block into building lots. */
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
  const groundGeo = new THREE.PlaneGeometry(700, 700);
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
  const roofBatch = new BoxBatcher();
  const shopBatch = new BoxBatcher();
  const grassBatch = new BoxBatcher();
  const kerbBatch = new BoxBatcher();

  // detail batches (each becomes one draw call with its own material)
  const plasterD = new BoxBatcher(); // plaster trim, cornices, sills
  const metalD = new BoxBatcher(); // AC units, downpipes, railings, tanks
  const woodD = new BoxBatcher(); // window frames, doors, awnings
  const greenD = new BoxBatcher(); // bushes, hedges
  const trimD = new BoxBatcher(); // dark kerb-side details, bollards

  const facadeBatches = new Map<FacadeKind, BoxBatcher>();
  const batchFor = (kind: FacadeKind) => {
    let b = facadeBatches.get(kind);
    if (!b) {
      b = new BoxBatcher();
      facadeBatches.set(kind, b);
    }
    return b;
  };

  const signGroup = new THREE.Group();
  signGroup.name = "signs";
  const signTextures = SHOP_TEXTS.map((t, i) => shopSignTexture(t, SIGN_COLORS[i % SIGN_COLORS.length]));
  // one merged mesh per sign texture, so 140 signs cost 8 draw calls
  const signGeos = new Map<number, THREE.BufferGeometry[]>();
  const addSignQuad = (texIndex: number, w: number, h: number, x: number, y: number, z: number, rot: number) => {
    const geo = new THREE.PlaneGeometry(w, h);
    geo.rotateY(rot);
    geo.translate(x, y, z);
    const list = signGeos.get(texIndex) ?? [];
    list.push(geo);
    signGeos.set(texIndex, list);
  };

  // ------------------------------------------------------- road markings
  const edge = CITY_HALF - LAYOUT.road / 2;
  for (let i = 0; i <= LAYOUT.blocks; i++) {
    const c = -CITY_HALF + LAYOUT.road / 2 + i * (LAYOUT.block + LAYOUT.road);

    for (let t = -edge + 6; t < edge - 6; t += 10) {
      markBatch.addQuad(new THREE.Vector3(c, 0, t), 0.22, 4.2, 0, 0.02);
      markBatch.addQuad(new THREE.Vector3(t, 0, c), 4.2, 0.22, 0, 0.02);
    }

    for (let j = 0; j <= LAYOUT.blocks; j++) {
      const cz = -CITY_HALF + LAYOUT.road / 2 + j * (LAYOUT.block + LAYOUT.road);
      for (let k = -3; k <= 3; k++) {
        markBatch.addQuad(new THREE.Vector3(c + k * 2.2, 0, cz - LAYOUT.road / 2 - 2), 1.05, 3.2, 0, 0.021);
        markBatch.addQuad(new THREE.Vector3(c + k * 2.2, 0, cz + LAYOUT.road / 2 + 2), 1.05, 3.2, 0, 0.021);
        markBatch.addQuad(new THREE.Vector3(c - LAYOUT.road / 2 - 2, 0, cz + k * 2.2), 3.2, 1.05, 0, 0.021);
        markBatch.addQuad(new THREE.Vector3(c + LAYOUT.road / 2 + 2, 0, cz + k * 2.2), 3.2, 1.05, 0, 0.021);
      }
    }
  }

  // --------------------------------------------------------------- blocks
  const inner = innerSize();

  for (let bx = 0; bx < LAYOUT.blocks; bx++) {
    for (let bz = 0; bz < LAYOUT.blocks; bz++) {
      const ix0 = innerMin(bx);
      const iz0 = innerMin(bz);

      const sw = inner + LAYOUT.sidewalk * 2;
      const sx = ix0 - LAYOUT.sidewalk + sw / 2;
      const sz = iz0 - LAYOUT.sidewalk + sw / 2;
      walkBatch.add(sx, 0.075, sz, sw, 0.15, sw, { uvPerMeter: 1 / 3, skipBottom: true });

      // kerbs + corner markers
      const kt = 0.42;
      kerbBatch.add(sx, 0.105, sz - sw / 2 + kt / 2, sw, 0.21, kt, { uvPerMeter: 1 });
      kerbBatch.add(sx, 0.105, sz + sw / 2 - kt / 2, sw, 0.21, kt, { uvPerMeter: 1 });
      kerbBatch.add(sx - sw / 2 + kt / 2, 0.105, sz, kt, 0.21, sw, { uvPerMeter: 1 });
      kerbBatch.add(sx + sw / 2 - kt / 2, 0.105, sz, kt, 0.21, sw, { uvPerMeter: 1 });

      const blockRect: Rect = { x0: ix0, z0: iz0, x1: ix0 + inner, z1: iz0 + inner };

      // ---- landmark block
      const landmark = LANDMARKS.find((l) => l.bx === bx && l.bz === bz);
      if (landmark) {
        const cx = (blockRect.x0 + blockRect.x1) / 2;
        const cz = (blockRect.z0 + blockRect.z1) / 2;
        const h = landmark.h;
        const t = batchFor("glass");
        t.add(cx, 5, cz, 22, 10, 22, { uvPerMeter: WALL_UV, skipBottom: true, gradient: true });
        t.add(cx, 10 + (h - 10) / 2, cz, 16, h - 10, 16, { uvPerMeter: WALL_UV, skipBottom: true, gradient: true });
        t.add(cx, h + 3, cz, 10, 6, 10, { uvPerMeter: WALL_UV, skipBottom: true });
        roofBatch.add(cx, 10.2, cz, 22.6, 0.4, 22.6, { uvPerMeter: 1 / 3 });
        roofBatch.add(cx, h + 0.3, cz, 16.4, 0.6, 16.4, { uvPerMeter: 1 / 3 });
        metalD.add(cx, h + 6.4, cz, 0.7, 0.7, 0.7, { uvPerMeter: 2 });
        buildings.push({ rect: blockRect, height: h, kind: "glass", cx, cz, w: 22, d: 22, floors: Math.round(h / FLOOR_H) });
        continue;
      }

      // ---- park block
      if ((bx * 7 + bz * 5) % 11 === 3) {
        const cx = (blockRect.x0 + blockRect.x1) / 2;
        const cz = (blockRect.z0 + blockRect.z1) / 2;
        grassBatch.add(cx, 0.09, cz, inner - 1, 0.18, inner - 1, { uvPerMeter: 1 / 6, skipBottom: true });
        // fountain: stone rim + water + centre
        roofBatch.add(cx, 0.45, cz, 4.2, 0.9, 4.2, { uvPerMeter: 1 / 2 });
        roofBatch.add(cx, 0.86, cz, 3.4, 0.2, 3.4, { uvPerMeter: 1 / 2, tint: [0.5, 0.7, 0.85] });
        plasterD.add(cx, 1.5, cz, 1.1, 1.2, 1.1, { uvPerMeter: 1 });
        // hedges around the lawn
        for (let k = 0; k < 4; k++) {
          const off = (inner - 4) / 2;
          const hedge = 1.1;
          if (k % 2 === 0) {
            greenD.add(cx + (k === 0 ? -off : off), 0.45, cz, 1.2, 0.9, inner - 6, { uvPerMeter: 1 });
            void hedge;
          } else {
            greenD.add(cx, 0.45, cz + (k === 1 ? -off : off), inner - 6, 0.9, 1.2, { uvPerMeter: 1 });
          }
        }
        parks.push({ ...blockRect, cx, cz });
        continue;
      }

      // ---- regular blocks
      for (const lot of splitLots(blockRect, rand)) {
        const gap = 1.1;
        const w = lot.x1 - lot.x0 - gap * 2;
        const d = lot.z1 - lot.z0 - gap * 2;
        if (w < 6.5 || d < 6.5) continue;

        const cx = (lot.x0 + lot.x1) / 2;
        const cz = (lot.z0 + lot.z1) / 2;

        const dist = Math.min(1, Math.hypot(cx, cz) / (CITY_HALF * 0.85));
        const maxH = THREE.MathUtils.lerp(38, 10, dist);
        const height = THREE.MathUtils.clamp(maxH * (0.5 + rand() * 0.9), 7, 42);
        const floors = Math.max(2, Math.round(height / FLOOR_H));

        const kind: FacadeKind =
          height > 27
            ? "glass"
            : pick<FacadeKind>(["plaster", "brick", "concrete", "panel", "tile", "plaster", "brick"]);
        const tint = pick(PALETTES[kind]);
        const batch = batchFor(kind);

        // stepped massing: a base and a narrower shaft
        const upper = height > 18 ? height * (0.55 + rand() * 0.18) : height;
        const baseH = height - upper;

        if (baseH > 0.5) {
          batch.add(cx, baseH / 2, cz, w, baseH, d, {
            uvPerMeter: WALL_UV,
            skipBottom: true,
            tint,
            gradient: true,
          });
          // cornice between base and shaft
          plasterD.add(cx, baseH + 0.12, cz, w + 0.75, 0.26, d + 0.75, { uvPerMeter: 1 / 3 });
          const tw = w * (0.68 + rand() * 0.16);
          const td = d * (0.68 + rand() * 0.16);
          batch.add(cx, baseH + upper / 2, cz, tw, upper, td, {
            uvPerMeter: WALL_UV,
            skipBottom: true,
            tint,
            gradient: true,
          });
          if (rand() < 0.45 && upper > 8) {
            const t2h = upper * 0.4;
            batch.add(cx, baseH + upper + t2h / 2, cz, tw * 0.7, t2h, td * 0.7, {
              uvPerMeter: WALL_UV,
              skipBottom: true,
              tint,
            });
          }
        } else {
          batch.add(cx, height / 2, cz, w, height, d, {
            uvPerMeter: WALL_UV,
            skipBottom: true,
            tint,
            gradient: true,
          });
        }

        // ---- roof: parapet, tanks, stair house, vents
        roofBatch.add(cx, height + 0.2, cz, w + 0.35, 0.4, d + 0.35, { uvPerMeter: 1 / 3 });
        const clutter = 1 + Math.floor(rand() * 3);
        for (let i = 0; i < clutter; i++) {
          const uw = Math.min(w * 0.28, 3.4);
          const ud = Math.min(d * 0.28, 3.4);
          const ux = cx + (rand() - 0.5) * Math.max(0.5, w - uw - 1.2);
          const uz = cz + (rand() - 0.5) * Math.max(0.5, d - ud - 1.2);
          metalD.add(ux, height + 0.9, uz, uw, 1.4, ud, { uvPerMeter: 1 / 2 });
        }
        if (rand() < 0.35) {
          // water tank on legs
          const tx = cx + (rand() - 0.5) * w * 0.4;
          const tz = cz + (rand() - 0.5) * d * 0.4;
          metalD.add(tx, height + 2.4, tz, 2.2, 1.6, 2.2, { uvPerMeter: 1 / 2 });
          for (const [ox, oz] of [
            [-0.8, -0.8],
            [0.8, -0.8],
            [-0.8, 0.8],
            [0.8, 0.8],
          ]) {
            metalD.add(tx + ox, height + 1.1, tz + oz, 0.14, 1.2, 0.14, { uvPerMeter: 2 });
          }
        }

        // ---- facade details, floor by floor
        const detailFloors = Math.min(floors, 12);
        for (let f = 1; f <= detailFloors; f++) {
          const y = f * FLOOR_H - 0.35;
          if (y > height - 1.2) break;
          const r = rand();

          // window sills on the two street-facing sides
          if (kind !== "glass") {
            woodD.add(cx, y - 0.75, cz - d / 2 - 0.06, Math.min(w * 0.8, w - 1), 0.08, 0.16, { uvPerMeter: 2 });
            woodD.add(cx + w / 2 + 0.06, y - 0.75, cz, 0.16, 0.08, Math.min(d * 0.8, d - 1), { uvPerMeter: 2 });
          }

          // balconies with railings
          if (r < 0.42 && baseH > 6) {
            const bw = Math.min(w * 0.45, 3.2);
            const bxp = cx + (rand() - 0.5) * (w - bw - 1);
            plasterD.add(bxp, y - 0.85, cz - d / 2 - 0.5, bw, 0.14, 1.0, { uvPerMeter: 1 });
            for (let k = 0; k <= 4; k++) {
              metalD.add(bxp - bw / 2 + (bw / 4) * k, y - 0.45, cz - d / 2 - 0.95, 0.04, 0.8, 0.04, {
                uvPerMeter: 2,
              });
            }
            metalD.add(bxp, y - 0.06, cz - d / 2 - 0.95, bw, 0.05, 0.05, { uvPerMeter: 2 });
          }

          // air conditioner boxes
          if (r > 0.62 && r < 0.78) {
            metalD.add(cx + (rand() - 0.5) * (w - 1.6), y - 0.55, cz - d / 2 - 0.22, 0.8, 0.55, 0.3, {
              uvPerMeter: 2,
            });
          }

          // occasional downpipe
          if (r > 0.92) {
            metalD.add(cx + w / 2 + 0.12, (y + FLOOR_H) / 2, cz + d / 2 - 0.25, 0.12, FLOOR_H, 0.12, {
              uvPerMeter: 2,
            });
          }
        }

        // ---- ground floor: shopfronts, doors, awnings and signs
        const shopH = 3.1;
        const faces: { rot: number; x: number; z: number; len: number }[] = [
          { rot: 0, x: cx, z: cz - d / 2 - 0.07, len: Math.max(2, w - 1) },
          { rot: Math.PI, x: cx, z: cz + d / 2 + 0.07, len: Math.max(2, w - 1) },
          { rot: Math.PI / 2, x: cx + w / 2 + 0.07, z: cz, len: Math.max(2, d - 1) },
          { rot: -Math.PI / 2, x: cx - w / 2 - 0.07, z: cz, len: Math.max(2, d - 1) },
        ];

        for (const face of faces) {
          const isX = Math.abs(Math.abs(face.rot) - Math.PI / 2) < 0.01;
          const sw2 = isX ? 0.12 : face.len;
          const sd = isX ? face.len : 0.12;
          shopBatch.add(face.x, shopH / 2, face.z, sw2, shopH, sd, { uvPerMeter: 1 / 6 });

          // awning over the shopfront
          woodD.add(
            isX ? face.x + Math.sign(face.x - cx) * 0.5 : face.x,
            shopH + 0.28,
            isX ? face.z : face.z + Math.sign(face.z - cz) * 0.5,
            isX ? 1.0 : face.len * 0.9,
            0.12,
            isX ? face.len * 0.9 : 1.0,
            { uvPerMeter: 2, tint: [0.9, 0.35, 0.3] }
          );

          // shop sign board
          if (rand() < 0.55) {
            const idx = Math.floor(rand() * SHOP_TEXTS.length);
            const signW = Math.min(face.len * 0.7, 5.5);
            addSignQuad(
              idx,
              signW,
              0.85,
              isX ? face.x + Math.sign(face.x - cx) * 0.32 : face.x,
              shopH + 0.95,
              isX ? face.z : face.z + Math.sign(face.z - cz) * 0.32,
              face.rot
            );
          }
        }

        buildings.push({ rect: lot, height, kind, cx, cz, w, d, floors });
      }
    }
  }

  // ---- bake the sign quads into one mesh per texture
  for (const [idx, geos] of signGeos) {
    const merged = mergeSimple(geos);
    const mesh = new THREE.Mesh(
      merged,
      new THREE.MeshStandardMaterial({ map: signTextures[idx], roughness: 0.6, metalness: 0.05 })
    );
    signGroup.add(mesh);
  }

  // ------------------------------------------------- hazy skyline (distance)
  const skyBatch = batchFor("concrete");
  for (let i = 0; i < 110; i++) {
    const ang = (i / 110) * Math.PI * 2 + rand() * 0.05;
    const rad = CITY_HALF + 70 + rand() * 190;
    const sx2 = Math.cos(ang) * rad;
    const sz2 = Math.sin(ang) * rad;
    const sh = 14 + rand() * 52;
    const sw2 = 14 + rand() * 22;
    skyBatch.add(sx2, sh / 2, sz2, sw2, sh, sw2, {
      uvPerMeter: WALL_UV,
      skipBottom: true,
      tint: [0.82, 0.86, 0.9],
    });
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

  const roofs = new THREE.Mesh(
    roofBatch.build(),
    new THREE.MeshStandardMaterial({ color: 0x8b8880, roughness: 0.9, vertexColors: true })
  );
  roofs.castShadow = true;
  roofs.receiveShadow = true;

  const shops = new THREE.Mesh(
    shopBatch.build(),
    new THREE.MeshStandardMaterial({
      map: shopFrontTexture(0),
      roughness: 0.5,
      metalness: 0.05,
    })
  );
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
        vertexColors: true,
      })
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `facades-${kind}`;
    facades.push({ mesh, kind });
  }

  const details = {
    plaster: new THREE.Mesh(
      plasterD.build(),
      new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.9 })
    ),
    metal: new THREE.Mesh(
      metalD.build(),
      new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.55, metalness: 0.65 })
    ),
    wood: new THREE.Mesh(
      woodD.build(),
      new THREE.MeshStandardMaterial({ color: 0x6d5340, roughness: 0.85, vertexColors: true })
    ),
    green: new THREE.Mesh(
      greenD.build(),
      new THREE.MeshStandardMaterial({ color: 0x4f7a3c, roughness: 0.95, flatShading: true })
    ),
    trim: new THREE.Mesh(
      trimD.build(),
      new THREE.MeshStandardMaterial({ color: 0x50545a, roughness: 0.8 })
    ),
  };
  for (const m of Object.values(details)) {
    m.castShadow = true;
    m.receiveShadow = true;
  }

  void FACADE_KINDS;

  return {
    ground,
    sidewalks,
    markings,
    facades,
    shops,
    roofs,
    grass,
    kerbs,
    details,
    signs: signGroup,
    buildings,
    parks,
  };
}

/** Merge plain position/normal/uv geometries (planes) into one buffer. */
function mergeSimple(geos: THREE.BufferGeometry[]) {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (const g of geos) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const u = g.attributes.uv;
    const idx = g.index;
    const count = idx ? idx.count : p.count;
    for (let i = 0; i < count; i++) {
      const vi = idx ? idx.getX(i) : i;
      pos.push(p.getX(vi), p.getY(vi), p.getZ(vi));
      nor.push(n.getX(vi), n.getY(vi), n.getZ(vi));
      uv.push(u.getX(vi), u.getY(vi));
    }
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  return geo;
}

/** Flat sign board: shop name on a coloured plate. */
function shopSignTexture(text: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(0, 82, 512, 14);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 46px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 46);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
    rects.push({ x0: p.cx - 2.1, x1: p.cx + 2.1, z0: p.cz - 2.1, z1: p.cz + 2.1, height: 2.4 });
  }
  return rects;
}
