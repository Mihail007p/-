import * as THREE from "three";
import { buildWorld, collisionRects, type WorldMeshes } from "./buildings";
import { buildProps, type PropsWorld } from "./props";
import { createDaylightSky } from "./sky";
import { asphaltNormal, asphaltTexture, grassTexture, sidewalkTexture } from "./textures";
import { CITY_HALF, SPAWN } from "./layout";

export type Collider = { x0: number; x1: number; z0: number; z1: number; height: number };

export type World = {
  meshes: WorldMeshes;
  props: PropsWorld;
  colliders: Collider[];
  /** circular blockers (trees, poles) for walk collision */
  blockers: { x: number; z: number; r: number }[];
  sun: THREE.DirectionalLight;
  spawn: { x: number; z: number; heading: number };
};

/**
 * Builds the whole daylight city and returns everything the game needs.
 * All static geometry is merged into a handful of draw calls, which keeps
 * this playable on a phone.
 */
export function createWorld(): World {
  const meshes = buildWorld();
  const props = buildProps(meshes);

  // ---------------------------------------------------------- textures
  const asphalt = asphaltTexture();
  asphalt.repeat.set(90, 90);
  const asphaltNorm = asphaltNormal();
  asphaltNorm.repeat.set(90, 90);

  (meshes.ground.material as THREE.MeshStandardMaterial).map = asphalt;
  (meshes.ground.material as THREE.MeshStandardMaterial).normalMap = asphaltNorm;
  (meshes.ground.material as THREE.MeshStandardMaterial).normalScale.set(0.35, 0.35);
  (meshes.ground.material as THREE.MeshStandardMaterial).color.setHex(0xffffff);
  (meshes.ground.material as THREE.MeshStandardMaterial).needsUpdate = true;

  const walk = sidewalkTexture();
  walk.repeat.set(1, 1);
  const walkMat = meshes.sidewalks.material as THREE.MeshStandardMaterial;
  walkMat.map = walk;
  walkMat.color.setHex(0xffffff);
  walkMat.needsUpdate = true;

  const grassTex = grassTexture();
  const grassMat = meshes.grass.material as THREE.MeshStandardMaterial;
  grassMat.map = grassTex;
  grassMat.color.setHex(0xffffff);
  grassMat.needsUpdate = true;

  // ---------------------------------------------------------------- sun
  const sunDir = new THREE.Vector3(-0.55, 0.72, 0.42).normalize();
  const sun = new THREE.DirectionalLight(0xfff0d0, 3.1);
  sun.position.copy(sunDir).multiplyScalar(90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const d = 70;
  sun.shadow.camera.left = -d;
  sun.shadow.camera.right = d;
  sun.shadow.camera.top = d;
  sun.shadow.camera.bottom = -d;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 260;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 2;

  return {
    meshes,
    props,
    colliders: collisionRects(meshes),
    blockers: props.blockers,
    sun,
    spawn: { ...SPAWN },
  };
}

/** Adds the world to a scene, with sky, lights and fog matching daylight. */
export function installWorld(scene: THREE.Scene, world: World) {
  const sunDir = world.sun.position.clone().normalize();
  const sky = createDaylightSky(sunDir);

  scene.background = sky;
  scene.environment = sky;
  scene.environmentIntensity = 0.85;
  scene.fog = new THREE.Fog(0xc3d2dc, 120, 420);

  scene.add(world.meshes.ground, world.meshes.sidewalks, world.meshes.markings);
  for (const f of world.meshes.facades) scene.add(f.mesh);
  scene.add(world.meshes.shops, world.meshes.roofs, world.meshes.grass, world.meshes.kerbs);
  scene.add(world.props.group);

  scene.add(world.sun);
  scene.add(world.sun.target);

  scene.add(new THREE.HemisphereLight(0xbfd8f0, 0x6e6a5e, 1.15));
  scene.add(new THREE.AmbientLight(0xffffff, 0.18));

  return { sky, sunDir };
}

/** Keeps the shadow camera centred on the player for crisp shadows on phones. */
export function updateSunShadow(world: World, target: THREE.Vector3) {
  world.sun.position.set(target.x - 55, target.y + 72, target.z + 42);
  world.sun.target.position.copy(target);
  world.sun.target.updateMatrixWorld();
}

export const WORLD_LIMITS = { half: CITY_HALF, playable: CITY_HALF - 2 };
