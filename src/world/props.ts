import * as THREE from "three";
import { BoxBatcher, createRng } from "./build/geom";
import { blockMax, blockMin, CITY_HALF, LAYOUT, roadCenter } from "./layout";
import type { WorldMeshes } from "./buildings";

/**
 * Street furniture: trees, lamps, traffic lights, benches, bins, cars.
 * Everything static is batched; the few meshes that need to be separate
 * (cars) stay individual so they can be moved later.
 */
export type PropsWorld = {
  group: THREE.Group;
  /** tree trunk + crown instances */
  trees: THREE.InstancedMesh[];
  /** street-lamp head positions for the minimap / lighting */
  lamps: THREE.Vector3[];
  trafficLights: THREE.Object3D[];
  cars: THREE.Object3D[];
  /** collision cylinders: trees and lamp posts */
  blockers: { x: number; z: number; r: number }[];
};

export function buildProps(world: WorldMeshes): PropsWorld {
  const rand = createRng(777);
  const group = new THREE.Group();
  group.name = "props";

  const blockers: PropsWorld["blockers"] = [];
  const lamps: THREE.Vector3[] = [];

  // ---------------------------------------------------------------- trees
  const treeSpots: { x: number; z: number; s: number }[] = [];
  for (const park of world.parks) {
    for (let i = 0; i < 8; i++) {
      treeSpots.push({
        x: park.x0 + 2 + rand() * (park.x1 - park.x0 - 4),
        z: park.z0 + 2 + rand() * (park.z1 - park.z0 - 4),
        s: 0.85 + rand() * 0.5,
      });
    }
  }
  // trees along some sidewalks
  for (let i = 0; i < 90; i++) {
    const axis = rand() < 0.5;
    const bi = Math.floor(rand() * LAYOUT.blocks);
    const line = rand() < 0.5 ? blockMin(bi) + 1.4 : blockMax(bi) - 1.4;
    const along = -CITY_HALF + 20 + rand() * (CITY_HALF * 2 - 40);
    treeSpots.push({ x: axis ? line : along, z: axis ? along : line, s: 0.8 + rand() * 0.4 });
  }

  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 2.6, 6);
  trunkGeo.translate(0, 1.3, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 });
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
  trunkMesh.castShadow = true;

  const crownGeo = new THREE.IcosahedronGeometry(1.7, 1);
  // squash and lift a bit so it reads as a canopy
  crownGeo.scale(1, 0.85, 1);
  crownGeo.translate(0, 3.3, 0);
  const crownMat = new THREE.MeshStandardMaterial({
    color: 0x4b7a3a,
    roughness: 0.92,
    flatShading: true,
  });
  const crownMesh = new THREE.InstancedMesh(crownGeo, crownMat, treeSpots.length);
  crownMesh.castShadow = true;

  const m = new THREE.Matrix4();
  // a second, smaller crown layer gives the trees a fuller, less "ball" look
  const crown2Geo = new THREE.IcosahedronGeometry(1.15, 0);
  crown2Geo.scale(1, 0.8, 1);
  crown2Geo.translate(0, 4.35, 0);
  const crown2Mesh = new THREE.InstancedMesh(crown2Geo, crownMat, treeSpots.length);
  crown2Mesh.castShadow = true;

  const q = new THREE.Quaternion();
  const rot = new THREE.Euler();
  treeSpots.forEach((t, i) => {
    m.makeScale(t.s, t.s, t.s);
    m.setPosition(t.x, 0.15, t.z);
    trunkMesh.setMatrixAt(i, m);

    rot.set(0, rand() * Math.PI * 2, 0);
    q.setFromEuler(rot);
    m.compose(new THREE.Vector3(t.x, 0.15, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
    crownMesh.setMatrixAt(i, m);
    crown2Mesh.setMatrixAt(i, m);
    blockers.push({ x: t.x, z: t.z, r: 0.45 * t.s });
  });
  trunkMesh.instanceMatrix.needsUpdate = true;
  crownMesh.instanceMatrix.needsUpdate = true;
  crown2Mesh.instanceMatrix.needsUpdate = true;
  group.add(trunkMesh, crownMesh, crown2Mesh);

  // ---------------------------------------------------------------- lamps
  const poleBatch = new BoxBatcher();
  const headBatch = new BoxBatcher();

  for (let i = 0; i <= LAYOUT.blocks; i++) {
    for (let j = 0; j <= LAYOUT.blocks; j++) {
      const cx = roadCenter(i);
      const cz = roadCenter(j);
      const corners: [number, number][] = [
        [-1, -1],
        [1, 1],
      ];
      for (const [sx, sz] of corners) {
        const px = cx + sx * (LAYOUT.road / 2 + 3.4);
        const pz = cz + sz * (LAYOUT.road / 2 + 3.4);
        if (Math.abs(px) > CITY_HALF + 4 || Math.abs(pz) > CITY_HALF + 4) continue;

        poleBatch.add(px, 3.1, pz, 0.22, 6.2, 0.22, { uvPerMeter: 1 });
        poleBatch.add(px + sx * 0.8, 6.1, pz, 1.8, 0.16, 0.16, { uvPerMeter: 1 });
        headBatch.add(px + sx * 1.6, 6.0, pz, 0.75, 0.22, 0.4, { uvPerMeter: 1 });
        lamps.push(new THREE.Vector3(px + sx * 1.6, 6, pz));
        blockers.push({ x: px, z: pz, r: 0.35 });
      }
    }
  }

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.6, metalness: 0.55 });
  const poles = new THREE.Mesh(poleBatch.build(), poleMat);
  poles.castShadow = true;
  group.add(poles);

  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff6df,
    emissive: 0xffe9b8,
    emissiveIntensity: 0.35,
    roughness: 0.4,
  });
  group.add(new THREE.Mesh(headBatch.build(), headMat));

  // -------------------------------------------------------- traffic lights
  const tlBatch = new BoxBatcher();
  const lightPoints: { x: number; y: number; z: number }[] = [];

  for (const [x, z, rot] of trafficLightSpots()) {
    tlBatch.add(x, 2.8, z, 0.24, 5.6, 0.24, { uvPerMeter: 1 });
    // horizontal arm
    tlBatch.add(x + Math.cos(rot) * 1.7, 5.4, z - Math.sin(rot) * 1.7, 3.4, 0.14, 0.14, {
      uvPerMeter: 1,
      rotY: rot,
    });
    // signal head at the end of the arm
    const hx = x + Math.cos(rot) * 3.2;
    const hz = z - Math.sin(rot) * 3.2;
    tlBatch.add(hx, 5.0, hz, 0.34, 1.05, 0.34, { uvPerMeter: 1, rotY: rot });
    lightPoints.push({ x: hx, y: 5.28, z: hz });
    blockers.push({ x, z, r: 0.32 });
  }

  const tlMesh = new THREE.Mesh(
    tlBatch.build(),
    new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.65, metalness: 0.4 })
  );
  tlMesh.castShadow = true;
  group.add(tlMesh);

  // the glowing lamps: one instanced mesh for every red/amber/green dot
  const lampGeo = new THREE.SphereGeometry(0.1, 6, 5);
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x203028,
    emissive: 0x39ff6a,
    emissiveIntensity: 1.6,
  });
  const tlLamps = new THREE.InstancedMesh(lampGeo, lampMat, lightPoints.length);
  const mtx = new THREE.Matrix4();
  lightPoints.forEach((p, i) => {
    mtx.makeTranslation(p.x, p.y, p.z);
    tlLamps.setMatrixAt(i, mtx);
  });
  tlLamps.instanceMatrix.needsUpdate = true;
  group.add(tlLamps);

  // ---------------------------------------------------------------- benches / bins
  const smallBatch = new BoxBatcher();
  const metalBatch = new BoxBatcher();
  const bushBatch = new BoxBatcher();
  for (const park of world.parks) {
    for (let i = 0; i < 4; i++) {
      const bx = park.x0 + 3 + rand() * (park.x1 - park.x0 - 6);
      const bz = park.z0 + 3 + rand() * (park.z1 - park.z0 - 6);
      smallBatch.add(bx, 0.45, bz, 1.7, 0.12, 0.5, { uvPerMeter: 1 });
      smallBatch.add(bx - 0.75, 0.22, bz, 0.1, 0.44, 0.45, { uvPerMeter: 1 });
      smallBatch.add(bx + 0.75, 0.22, bz, 0.1, 0.44, 0.45, { uvPerMeter: 1 });
    }
  }
  // street furniture along every sidewalk: bins, bollards, bushes, manholes
  for (let i = 0; i <= LAYOUT.blocks; i++) {
    const c = roadCenter(i);
    for (let k = 0; k < 10; k++) {
      const along = -CITY_HALF + 24 + rand() * (CITY_HALF * 2 - 48);
      // bins on both sides of the road
      for (const side of [-1, 1]) {
        const bx = c + side * (LAYOUT.road / 2 + 2.2);
        if (rand() < 0.5) {
          metalBatch.add(bx, 0.45, along + side * 6, 0.42, 0.9, 0.42, { uvPerMeter: 2 });
        }
        // bollards near junctions
        if (Math.abs(along) < CITY_HALF - 40 && rand() < 0.35) {
          metalBatch.add(bx, 0.4, along + 14, 0.12, 0.8, 0.12, { uvPerMeter: 2 });
        }
      }
      // bushes at block corners
      if (rand() < 0.3) {
        bushBatch.add(along, 0.55, c + (rand() < 0.5 ? 1 : -1) * (LAYOUT.road / 2 + 3), 1.6, 1.1, 1.6, {
          uvPerMeter: 1,
        });
      }
    }
  }

  // manhole covers and drains on the road surface
  for (let i = 0; i <= LAYOUT.blocks; i++) {
    const c = roadCenter(i);
    for (let k = 0; k < 8; k++) {
      const along = -CITY_HALF + 30 + rand() * (CITY_HALF * 2 - 60);
      metalBatch.add(c + (rand() - 0.5) * 6, 0.015, along, 0.85, 0.03, 0.85, { uvPerMeter: 2 });
    }
  }

  const benches = new THREE.Mesh(
    smallBatch.build(),
    new THREE.MeshStandardMaterial({ color: 0x6b5138, roughness: 0.9 })
  );
  benches.castShadow = true;
  benches.receiveShadow = true;
  group.add(benches);

  const metalProps = new THREE.Mesh(
    metalBatch.build(),
    new THREE.MeshStandardMaterial({ color: 0x7d838a, roughness: 0.5, metalness: 0.7 })
  );
  metalProps.castShadow = true;
  group.add(metalProps);

  const bushes = new THREE.Mesh(
    bushBatch.build(),
    new THREE.MeshStandardMaterial({ color: 0x49713a, roughness: 0.95, flatShading: true })
  );
  bushes.castShadow = true;
  bushes.receiveShadow = true;
  group.add(bushes);

  // ---------------------------------------------------------------- cars
  const bodies = new BoxBatcher();
  const glassBatch = new BoxBatcher();
  const darkBatch = new BoxBatcher();
  const lightsBatch = new BoxBatcher();
  const cars: THREE.Object3D[] = [];
  const spots = parkedCarSpots(rand);

  for (const spot of spots) {
    batchCar(bodies, glassBatch, darkBatch, lightsBatch, spot.x, spot.z, spot.rot);
    blockers.push({ x: spot.x, z: spot.z, r: 1.4 });
  }

  const paintMats = [
    new THREE.MeshStandardMaterial({ color: 0x9a2f2f, roughness: 0.35, metalness: 0.45 }),
    new THREE.MeshStandardMaterial({ color: 0x2c4258, roughness: 0.35, metalness: 0.45 }),
    new THREE.MeshStandardMaterial({ color: 0xd6d6cf, roughness: 0.35, metalness: 0.4 }),
    new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.35, metalness: 0.45 }),
  ];
  void paintMats;

  const carBodyMesh = new THREE.Mesh(
    bodies.build(),
    new THREE.MeshStandardMaterial({ color: 0x8f9499, roughness: 0.4, metalness: 0.5 })
  );
  carBodyMesh.castShadow = true;
  carBodyMesh.receiveShadow = true;
  group.add(carBodyMesh);

  group.add(
    new THREE.Mesh(
      glassBatch.build(),
      new THREE.MeshStandardMaterial({ color: 0x2b3b45, roughness: 0.15, metalness: 0.65 })
    )
  );
  group.add(
    new THREE.Mesh(
      darkBatch.build(),
      new THREE.MeshStandardMaterial({ color: 0x16181b, roughness: 0.85 })
    )
  );
  group.add(
    new THREE.Mesh(
      lightsBatch.build(),
      new THREE.MeshStandardMaterial({ color: 0xdfe6ea, roughness: 0.3, metalness: 0.4 })
    )
  );

  // a couple of representative car groups remain for future interactivity
  return { group, trees: [trunkMesh, crownMesh, crown2Mesh], lamps, trafficLights: [], cars, blockers };
}

/** Batches one parked car: body slab, cabin glass, wheels, lights. */
function batchCar(
  body: BoxBatcher,
  glass: BoxBatcher,
  dark: BoxBatcher,
  lights: BoxBatcher,
  x: number,
  z: number,
  rot: number
) {
  const ca = Math.cos(rot);
  const sa = Math.sin(rot);
  // local -> world helper (car faces -z in local space)
  const at = (lx: number, lz: number): [number, number] => [
    x + lx * ca - lz * sa,
    z + lx * sa + lz * ca,
  ];

  const [bx, bz] = at(0, 0);
  body.add(bx, 0.62, bz, 1.78, 0.62, 4.2, { uvPerMeter: 1 / 2, rotY: rot });
  // bonnet + boot shoulders for a less boxy silhouette
  const [hx, hz] = at(0, -1.5);
  body.add(hx, 0.93, hz, 1.7, 0.16, 1.2, { uvPerMeter: 1 / 2, rotY: rot });
  const [kx, kz] = at(0, 1.55);
  body.add(kx, 0.95, kz, 1.72, 0.14, 1.0, { uvPerMeter: 1 / 2, rotY: rot });

  const [gx, gz] = at(0, -0.15);
  glass.add(gx, 1.16, gz, 1.6, 0.56, 2.1, { uvPerMeter: 1 / 2, rotY: rot });

  const [rx, rz] = at(0, -0.2);
  body.add(rx, 1.45, rz, 1.46, 0.1, 1.6, { uvPerMeter: 1 / 2, rotY: rot });

  // mirrors
  for (const sx of [-1, 1]) {
    const [mx, mz] = at(sx * 0.95, -0.75);
    dark.add(mx, 1.1, mz, 0.22, 0.12, 0.1, { uvPerMeter: 2, rotY: rot });
  }
  // bumpers and number plates
  for (const [pz, py] of [[-2.14, 0.5], [2.14, 0.5]] as [number, number][]) {
    const [px2, pz2] = at(0, pz);
    dark.add(px2, py, pz2, 1.8, 0.22, 0.08, { uvPerMeter: 2, rotY: rot });
    lights.add(px2, py + 0.18, pz2, 0.5, 0.13, 0.04, { uvPerMeter: 3, rotY: rot });
  }
  // roof rails on some cars
  if (Math.random() < 0.35) {
    for (const sx of [-0.6, 0.6]) {
      const [lxp, lzp] = at(sx, -0.2);
      dark.add(lxp, 1.53, lzp, 0.07, 0.08, 1.5, { uvPerMeter: 3, rotY: rot });
    }
  }

  for (const [wx, wz] of [
    [-0.86, -1.35],
    [0.86, -1.35],
    [-0.86, 1.35],
    [0.86, 1.35],
  ] as [number, number][]) {
    const [px, pz] = at(wx, wz);
    dark.add(px, 0.33, pz, 0.24, 0.66, 0.66, { uvPerMeter: 2, rotY: rot });
  }

  for (const sx of [-1, 1]) {
    const [hx, hz] = at(sx * 0.58, -2.08);
    lights.add(hx, 0.72, hz, 0.4, 0.14, 0.06, { uvPerMeter: 2, rotY: rot });
  }
}

function trafficLightSpots(): [number, number, number][] {
  const spots: [number, number, number][] = [];
  for (let i = 1; i < LAYOUT.blocks; i++) {
    for (let j = 1; j < LAYOUT.blocks; j++) {
      if ((i + j) % 2 !== 0) continue;
      const cx = roadCenter(i);
      const cz = roadCenter(j);
      spots.push([cx - LAYOUT.road / 2 - 1.2, cz + LAYOUT.road / 2 + 1.2, Math.PI / 2]);
      spots.push([cx + LAYOUT.road / 2 + 1.2, cz - LAYOUT.road / 2 - 1.2, -Math.PI / 2]);
    }
  }
  return spots;
}

/** Cars parked along kerbs, aligned with the road direction. */
function parkedCarSpots(rand: () => number) {
  const spots: { x: number; z: number; rot: number }[] = [];
  for (let i = 0; i <= LAYOUT.blocks; i++) {
    const c = roadCenter(i);
    for (let k = 0; k < 3; k++) {
      const along = -CITY_HALF + 30 + rand() * (CITY_HALF * 2 - 60);
      spots.push({ x: c - LAYOUT.road / 2 + 2.0, z: along, rot: 0 });
      spots.push({ x: c + LAYOUT.road / 2 - 2.0, z: along + 12, rot: Math.PI });
      spots.push({ x: along, z: c + LAYOUT.road / 2 - 2.0, rot: Math.PI / 2 });
      spots.push({ x: along + 12, z: c - LAYOUT.road / 2 + 2.0, rot: -Math.PI / 2 });
    }
  }
  return spots
    .filter(() => rand() < 0.55)
    .slice(0, 34);
}

const CAR_COLORS = [0x9a2f2f, 0x22354a, 0xd8d8d2, 0x2b2b2f, 0x476b3f, 0xb08a3a, 0x6b6f76];

/** A simple but well-proportioned hatchback/sedan silhouette. */
export function makeParkedCar(
  colorIndex: number,
  x: number,
  z: number,
  rot: number,
  rand: () => number
) {
  const g = new THREE.Group();
  const color = CAR_COLORS[colorIndex % CAR_COLORS.length];

  const paint = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.35,
    metalness: 0.45,
    envMapIntensity: 0.9,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x2b3b45,
    roughness: 0.15,
    metalness: 0.6,
    envMapIntensity: 1.2,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.8 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.62, 4.2), paint);
  body.position.y = 0.62;
  body.castShadow = true;
  g.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.56, 2.1), glass);
  cabin.position.set(0, 1.16, -0.15);
  cabin.castShadow = true;
  g.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.1, 1.6), paint);
  roof.position.set(0, 1.45, -0.2);
  g.add(roof);

  const skirt = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.16, 4.0), dark);
  skirt.position.y = 0.34;
  g.add(skirt);

  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.9 });
  for (const [wx, wz] of [
    [-0.86, -1.35],
    [0.86, -1.35],
    [-0.86, 1.35],
    [0.86, 1.35],
  ] as [number, number][]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wx, 0.33, wz);
    w.castShadow = true;
    g.add(w);
  }

  // lights
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ea, roughness: 0.2, metalness: 0.6 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x8d2020, roughness: 0.3, metalness: 0.4 });
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.06), headMat);
    hl.position.set(sx * 0.58, 0.72, -2.11);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.13, 0.06), tailMat);
    tl.position.set(sx * 0.6, 0.74, 2.11);
    g.add(tl);
  }

  g.position.set(x, 0, z);
  g.rotation.y = rot + (rand() - 0.5) * 0.06;
  return g;
}
