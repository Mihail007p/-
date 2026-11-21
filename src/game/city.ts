import * as THREE from "three";
import {
  createAsphalt,
  createAsphaltRoughness,
  createSidewalk,
  createFacade,
  createGlowTexture,
  createNeonSign,
} from "./textures";

export const CITY = {
  size: 460, // city spans from -size/2 .. size/2
  road: 26, // road width
  sidewalk: 4,
  grid: 4, // grid x grid blocks
  /** distance between adjacent road centre lines */
  block: (460 - 26) / 4,
};

export const CITY_HALF = CITY.size / 2;

export type BuildingBox = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
};

export type LightSpot = { x: number; z: number; color: THREE.Color; intensity: number };

export type CityData = {
  group: THREE.Group;
  buildings: BuildingBox[];
  streetLamps: LightSpot[];
  /** A road-aligned start position for a car (lane center). */
  spawnPoints: { x: number; z: number; heading: number }[];
  neonSigns: THREE.Mesh[];
  /** Meshes that blink on/off (aviation lights). */
  blinkers: THREE.Mesh[];
};

type FacadeKind = "cold" | "warm" | "concrete" | "glass";
type FacadeMats = { wall: THREE.MeshStandardMaterial; roof: THREE.MeshStandardMaterial };

/**
 * Materials are shared between all buildings: window tiling is baked into the
 * geometry UVs instead of cloning textures per building, which would blow up
 * GPU memory (hundreds of 512x512 uploads).
 */
const facadeMats = new Map<FacadeKind, FacadeMats>();
const WINDOW_TILE = 13; // world units per texture tile (4 windows)

function getFacadeMaterials(kind: FacadeKind): FacadeMats {
  let mats = facadeMats.get(kind);
  if (mats) return mats;

  const { map, emissive } = createFacade(kind);
  const glass = kind === "glass";
  mats = {
    wall: new THREE.MeshStandardMaterial({
      map,
      emissiveMap: emissive,
      emissive: 0xffffff,
      emissiveIntensity: 1.35,
      roughness: glass ? 0.18 : 0.66,
      metalness: glass ? 0.75 : 0.22,
      envMapIntensity: glass ? 1.9 : 0.8,
    }),
    roof: new THREE.MeshStandardMaterial({ color: 0x10131a, roughness: 0.88, metalness: 0.2 }),
  };
  facadeMats.set(kind, mats);
  return mats;
}

/** Scale the box UVs so windows keep a constant real-world size on every wall. */
function bakeFacadeUVs(geo: THREE.BoxGeometry, w: number, h: number, d: number) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  // BoxGeometry face order: px, nx, py, ny, pz, nz (4 vertices each)
  for (let i = 0; i < 24; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    let su: number;
    if (i < 8) su = d / WINDOW_TILE; // +x / -x walls span the depth
    else if (i < 16) su = w / WINDOW_TILE; // roof/floor, unused
    else su = w / WINDOW_TILE; // +z / -z walls span the width
    uv.setXY(i, u * su, v * (h / 9.6));
  }
  uv.needsUpdate = true;
  geo.computeBoundingSphere();
}

const SIGN_WORDS = [
  "NIGHT OWL", "MOTEL", "RAMEN", "PAWN", "LIQUOR", "ARCADE", "CASINO", "DINER",
  "24/7", "TATTOO", "GARAGE", "NOODLE", "BAR", "CLUB", "VAPE", "HOTEL",
  "ДРАЙВ", "НЕОН", "РОК", "ПИЦЦА",
];
const SIGN_COLORS = ["#22e1ff", "#ff2fa0", "#ffb545", "#8f7bff", "#5cffb1", "#ff5d3a"];

function randWord() {
  return SIGN_WORDS[Math.floor(Math.random() * SIGN_WORDS.length)];
}

function randColor() {
  return SIGN_COLORS[Math.floor(Math.random() * SIGN_COLORS.length)];
}

const neonPool = new Map<string, THREE.Texture>();
function neonTexture(text: string, color: string, vertical: boolean) {
  const key = `${text}|${color}|${vertical}`;
  let t = neonPool.get(key);
  if (!t) {
    t = createNeonSign(text, color, vertical);
    neonPool.set(key, t);
  }
  return t;
}

/**
 * Builds the whole city into a THREE.Group using shared materials.
 * Also returns collision boxes so player/cars don't drive through walls.
 */
export function buildCity(): CityData {
  const group = new THREE.Group();
  group.name = "city";

  const buildings: BuildingBox[] = [];
  const streetLamps: LightSpot[] = [];
  const blinkers: THREE.Mesh[] = [];
  const spawnPoints: { x: number; z: number; heading: number }[] = [];
  const neonSigns: THREE.Mesh[] = [];

  const { block, road, sidewalk, grid, size } = CITY;
  const half = size / 2;

  // ---------- ground: wet asphalt ----------
  const asphaltMap = createAsphalt();
  asphaltMap.repeat.set(size / 12, size / 12);
  const asphaltRough = createAsphaltRoughness();
  asphaltRough.repeat.set(size / 40, size / 40);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 1.6, size * 1.6),
    new THREE.MeshStandardMaterial({
      map: asphaltMap,
      roughnessMap: asphaltRough,
      color: 0x6d7580,
      roughness: 0.42,
      metalness: 0.55,
      envMapIntensity: 1.6,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // ---------- sidewalks ----------
  const walkMap = createSidewalk();
  const walkMat = new THREE.MeshStandardMaterial({
    map: walkMap,
    color: 0x8a929c,
    roughness: 0.62,
    metalness: 0.25,
    envMapIntensity: 0.9,
  });

  const kerbMat = new THREE.MeshStandardMaterial({
    color: 0x2a2e35,
    roughness: 0.55,
    metalness: 0.3,
  });

  const sidewalkGeos: THREE.BufferGeometry[] = [];
  const kerbGeos: THREE.BufferGeometry[] = [];

  // ---------- road markings ----------
  const markMat = new THREE.MeshStandardMaterial({
    color: 0xf2f5ff,
    emissive: 0x33405a,
    emissiveIntensity: 0.6,
    roughness: 0.5,
    metalness: 0.1,
  });
  const markGeos: THREE.BufferGeometry[] = [];

  const laneCenters: number[] = [];
  for (let i = 0; i <= grid; i++) {
    laneCenters.push(-half + road / 2 + i * block);
  }

  // blocks start right after the outer road; each block runs up to the next road
  const blockStart = (i: number) => -half + road + i * block;
  const blockInner = block - road;

  // ---------- blocks ----------
  for (let bx = 0; bx < grid; bx++) {
    for (let bz = 0; bz < grid; bz++) {
      const x0 = blockStart(bx);
      const z0 = blockStart(bz);
      const x1 = x0 + blockInner;
      const z1 = z0 + blockInner;

      // sidewalk slab per block
      const sw = new THREE.BoxGeometry(blockInner, 0.18, blockInner);
      sw.translate(x0 + blockInner / 2, 0.09, z0 + blockInner / 2);
      sidewalkGeos.push(sw);

      const kerbH = 0.22;
      const kerbT = 0.5;
      const kerbDefs: [number, number, number, number][] = [
        [x0 + blockInner / 2, z0, blockInner + kerbT, kerbT],
        [x0 + blockInner / 2, z1, blockInner + kerbT, kerbT],
        [x0, z0 + blockInner / 2, kerbT, blockInner],
        [x1, z0 + blockInner / 2, kerbT, blockInner],
      ];
      for (const [cx, cz, w, d] of kerbDefs) {
        const g = new THREE.BoxGeometry(w, kerbH, d);
        g.translate(cx, kerbH / 2, cz);
        kerbGeos.push(g);
      }

      // park block? (1 in 7 becomes a plaza with trees/benches)
      const isPark = (bx * 7 + bz * 13) % 11 === 3;

      if (isPark) {
        buildPark(group, x0, z0, blockInner);
        continue;
      }

      // subdivide block into building lots
      const pad = sidewalk + 1.2;
      const innerX0 = x0 + pad;
      const innerZ0 = z0 + pad;
      const innerW = blockInner - pad * 2;
      const innerD = blockInner - pad * 2;

      const lots = splitLots(innerX0, innerZ0, innerW, innerD);

      for (const lot of lots) {
        const margin = 1.4;
        const w = lot.w - margin * 2;
        const d = lot.d - margin * 2;
        if (w < 8 || d < 8) continue;

        const cx = lot.x + lot.w / 2;
        const cz = lot.z + lot.d / 2;

        // downtown is taller near the middle of the map
        const distFromCenter = Math.hypot(cx, cz) / half;
        const maxH = THREE.MathUtils.lerp(96, 26, THREE.MathUtils.clamp(distFromCenter, 0, 1));
        const height = THREE.MathUtils.clamp(
          maxH * (0.35 + Math.random() * 0.9),
          10,
          maxH
        );

        const kind = pickFacadeKind(height);
        const mats = getFacadeMaterials(kind);

        const geo = new THREE.BoxGeometry(w, height, d);
        bakeFacadeUVs(geo, w, height, d);

        // BoxGeometry material order: +x, -x, +y, -y, +z, -z
        const mesh = new THREE.Mesh(geo, [
          mats.wall, mats.wall, mats.roof, mats.roof, mats.wall, mats.wall,
        ]);
        mesh.position.set(cx, height / 2, cz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);

        // rooftop details
        if (height > 30 && Math.random() < 0.75) {
          const box = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.3, 3 + Math.random() * 5, d * 0.3),
            mats.roof
          );
          box.position.set(
            cx + (Math.random() - 0.5) * w * 0.35,
            height + 2,
            cz + (Math.random() - 0.5) * d * 0.35
          );
          box.castShadow = true;
          group.add(box);
        }
        if (height > 55) {
          // antenna with blinking aviation light
          const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, 12, 6), mats.roof);
          mast.position.set(cx, height + 6, cz);
          group.add(mast);
          const bulb = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xff2b3a, toneMapped: false })
          );
          bulb.position.set(cx, height + 12, cz);
          blinkers.push(bulb);
          group.add(bulb);
        }

        buildings.push({
          minX: cx - w / 2,
          maxX: cx + w / 2,
          minZ: cz - d / 2,
          maxZ: cz + d / 2,
          height,
        });

        // Neon sign on a facade facing the street
        if (height > 14 && Math.random() < 0.55) {
          const vertical = Math.random() < 0.35;
          const text = randWord();
          const color = randColor();
          const tex = neonTexture(text, color, vertical);
          const sw = vertical ? 2.6 : 8;
          const sh = vertical ? 7 : 3;
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(sw, sh),
            new THREE.MeshBasicMaterial({
              map: tex,
              transparent: true,
              side: THREE.DoubleSide,
              toneMapped: false,
            })
          );

          const face = Math.random() < 0.5 ? "x" : "z";
          const y = height > 20 ? 8 + Math.random() * (height - 14) : 6;
          if (face === "z") {
            const dir = Math.random() < 0.5 ? 1 : -1;
            sign.position.set(cx + (Math.random() - 0.5) * w * 0.5, y, cz + dir * (d / 2 + 0.12));
            sign.rotation.y = dir > 0 ? 0 : Math.PI;
          } else {
            const dir = Math.random() < 0.5 ? 1 : -1;
            sign.position.set(cx + dir * (w / 2 + 0.12), y, cz + (Math.random() - 0.5) * d * 0.5);
            sign.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          }
          sign.userData.flicker = Math.random() < 0.22;
          group.add(sign);
          neonSigns.push(sign);

          // a small pool of coloured light spilling from some signs
          if (neonSigns.length % 3 === 0) {
            streetLamps.push({
              x: sign.position.x,
              z: sign.position.z,
              color: new THREE.Color(color),
              intensity: 1.1,
            });
          }
        }
      }
    }
  }

  // ---------- street lamps at intersections ----------
  const lampPostMat = new THREE.MeshStandardMaterial({
    color: 0x1b1f26,
    roughness: 0.5,
    metalness: 0.8,
  });
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe6b8, toneMapped: false });

  const postGeos: THREE.BufferGeometry[] = [];
  const headGeos: THREE.BufferGeometry[] = [];

  for (let i = 0; i <= grid; i++) {
    for (let j = 0; j <= grid; j++) {
      const x = laneCenters[i];
      const z = laneCenters[j];
      // four corners around each intersection (excluding outer ring sometimes)
      const offs: [number, number][] = [
        [-road / 2 - 1, -road / 2 - 1],
        [road / 2 + 1, road / 2 + 1],
        [-road / 2 - 1, road / 2 + 1],
        [road / 2 + 1, -road / 2 - 1],
      ];
      for (const [ox, oz] of offs) {
        const px = x + ox;
        const pz = z + oz;
        if (Math.abs(px) > half + 6 || Math.abs(pz) > half + 6) continue;
        if (Math.random() < 0.55) continue;

        const post = new THREE.CylinderGeometry(0.12, 0.16, 7.2, 6);
        post.translate(px, 3.6, pz);
        postGeos.push(post);

        const arm = new THREE.BoxGeometry(1.9, 0.12, 0.12);
        arm.translate(px, 7.1, pz);
        postGeos.push(arm);

        const head = new THREE.SphereGeometry(0.34, 8, 8);
        head.translate(px, 7.0, pz);
        headGeos.push(head);

        if (streetLamps.length < 26) {
          streetLamps.push({
            x: px,
            z: pz,
            color: new THREE.Color(0xffc98a),
            intensity: 1.35,
          });
        }
      }
    }
  }

  group.add(new THREE.Mesh(mergeGeos(postGeos), lampPostMat));
  group.add(new THREE.Mesh(mergeGeos(headGeos), lampHeadMat));

  // ---------- crosswalk stripes ----------
  for (let i = 1; i < grid; i++) {
    for (let j = 1; j < grid; j++) {
      const x = laneCenters[i];
      const z = laneCenters[j];
      for (let s = -2; s <= 2; s++) {
        const g1 = new THREE.PlaneGeometry(1.2, road * 0.7);
        g1.rotateX(-Math.PI / 2);
        g1.translate(x + s * 2.6, 0.021, z - road / 2 - 1.2);
        markGeos.push(g1);
      }
    }
  }

  // dashed center lines along each road
  for (let i = 0; i <= grid; i++) {
    const x = laneCenters[i];
    for (let z = -half + road; z < half - road; z += 9) {
      const g = new THREE.PlaneGeometry(0.35, 4);
      g.rotateX(-Math.PI / 2);
      g.translate(x, 0.02, z);
      markGeos.push(g);
    }
    const z2 = laneCenters[i];
    for (let x2 = -half + road; x2 < half - road; x2 += 9) {
      const g = new THREE.PlaneGeometry(4, 0.35);
      g.rotateX(-Math.PI / 2);
      g.translate(x2, 0.02, z2);
      markGeos.push(g);
    }
  }

  group.add(new THREE.Mesh(mergeGeos(markGeos), markMat));

  const walks = new THREE.Mesh(mergeGeos(sidewalkGeos), walkMat);
  walks.receiveShadow = true;
  group.add(walks);

  const kerbs = new THREE.Mesh(mergeGeos(kerbGeos), kerbMat);
  kerbs.receiveShadow = true;
  kerbs.castShadow = true;
  group.add(kerbs);

  // ---------- car spawn points along the ring road ----------
  for (let i = 1; i < grid; i++) {
    const x = laneCenters[i] + road * 0.25;
    spawnPoints.push({ x, z: -half + road * 0.75, heading: 0 });
    spawnPoints.push({ x, z: half - road * 0.75, heading: Math.PI });
    const z = laneCenters[i] - road * 0.25;
    spawnPoints.push({ x: -half + road * 0.75, z, heading: Math.PI / 2 });
    spawnPoints.push({ x: half - road * 0.75, z, heading: -Math.PI / 2 });
  }

  // outer perimeter road lamps glow via emissive ground strips
  return { group, buildings, streetLamps, spawnPoints, neonSigns, blinkers };
}

function pickFacadeKind(height: number): "cold" | "warm" | "concrete" | "glass" {
  const r = Math.random();
  if (height > 55) return r < 0.65 ? "glass" : "cold";
  if (r < 0.4) return "cold";
  if (r < 0.7) return "warm";
  return "concrete";
}

function splitLots(x: number, z: number, w: number, d: number) {
  // recursive binary split to fill the block with a few buildings
  const lots: { x: number; z: number; w: number; d: number }[] = [];
  const queue = [{ x, z, w, d, depth: 0 }];
  while (queue.length) {
    const lot = queue.pop()!;
    const tooSmall = lot.w < 34 || lot.d < 34;
    const stop = lot.depth > 2 || (tooSmall && Math.random() < 0.75);
    if (stop) {
      if (lot.w >= 14 && lot.d >= 14) lots.push(lot);
      continue;
    }
    if (lot.w > lot.d) {
      const cut = lot.w * THREE.MathUtils.randFloat(0.38, 0.62);
      queue.push({ x: lot.x, z: lot.z, w: cut, d: lot.d, depth: lot.depth + 1 });
      queue.push({ x: lot.x + cut, z: lot.z, w: lot.w - cut, d: lot.d, depth: lot.depth + 1 });
    } else {
      const cut = lot.d * THREE.MathUtils.randFloat(0.38, 0.62);
      queue.push({ x: lot.x, z: lot.z, w: lot.w, d: cut, depth: lot.depth + 1 });
      queue.push({ x: lot.x, z: lot.z + cut, w: lot.w, d: lot.d - cut, depth: lot.depth + 1 });
    }
  }
  return lots;
}

function buildPark(group: THREE.Group, x0: number, z0: number, size: number) {
  const cx = x0 + size / 2;
  const cz = z0 + size / 2;

  const grass = new THREE.Mesh(
    new THREE.BoxGeometry(size - 12, 0.2, size - 12),
    new THREE.MeshStandardMaterial({ color: 0x14281e, roughness: 0.95 })
  );
  grass.position.set(cx, 0.1, cz);
  grass.receiveShadow = true;
  group.add(grass);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x22190f, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x1d3b28,
    roughness: 0.9,
    flatShading: true,
  });

  const trunkGeos: THREE.BufferGeometry[] = [];
  const leafGeos: THREE.BufferGeometry[] = [];

  const count = 9;
  for (let i = 0; i < count; i++) {
    const tx = cx + (Math.random() - 0.5) * (size - 24);
    const tz = cz + (Math.random() - 0.5) * (size - 24);
    const h = 3 + Math.random() * 2.5;
    const trunk = new THREE.CylinderGeometry(0.28, 0.42, h, 6);
    trunk.translate(tx, h / 2, tz);
    trunkGeos.push(trunk);

    const leaf = new THREE.IcosahedronGeometry(2.2 + Math.random() * 1.6, 0);
    leaf.translate(tx, h + 1.6, tz);
    leafGeos.push(leaf);
  }

  const trunks = new THREE.Mesh(mergeGeos(trunkGeos), trunkMat);
  const leaves = new THREE.Mesh(mergeGeos(leafGeos), leafMat);
  leaves.castShadow = true;
  group.add(trunks, leaves);

  // park lamp
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false })
  );
  glow.position.set(cx, 3.6, cz);
  group.add(glow);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.12, 3.6, 6),
    new THREE.MeshStandardMaterial({ color: 0x1b1f26, metalness: 0.8, roughness: 0.5 })
  );
  pole.position.set(cx, 1.8, cz);
  group.add(pole);
}

/** Minimal geometry merge (positions, normals, uvs) to keep draw calls low. */
function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const total = geos.reduce((acc, g) => acc + (g.index ? g.index.count : g.attributes.position.count), 0);
  const pos = new Float32Array(total * 3);
  const norm = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of geos) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const u = g.attributes.uv;
    const idx = g.index;
    const count = idx ? idx.count : p.count;
    for (let i = 0; i < count; i++) {
      const vi = idx ? idx.getX(i) : i;
      pos[o * 3] = p.getX(vi);
      pos[o * 3 + 1] = p.getY(vi);
      pos[o * 3 + 2] = p.getZ(vi);
      if (n) {
        norm[o * 3] = n.getX(vi);
        norm[o * 3 + 1] = n.getY(vi);
        norm[o * 3 + 2] = n.getZ(vi);
      }
      if (u) {
        uv[o * 2] = u.getX(vi);
        uv[o * 2 + 1] = u.getY(vi);
      }
      o++;
    }
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(norm, 3));
  merged.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  merged.computeBoundingSphere();
  return merged;
}

export function makeGlowSprite(color: string | number, size: number, opacity = 0.8) {
  const tex = createGlowTexture();
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(size, size, 1);
  return s;
}
