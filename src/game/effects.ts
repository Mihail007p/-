import * as THREE from "three";
import type { BuildingBox } from "./city";
import { CITY, CITY_HALF } from "./city";

/**
 * Wet-street dressing: mirrored puddles that reflect the sky env map,
 * plus tyre spray particles behind a fast car.
 */
export class Effects {
  puddles: THREE.Mesh[] = [];
  spray: THREE.Points;
  private sprayPositions: Float32Array;
  private sprayLife: Float32Array;
  private sprayVel: Float32Array;
  private readonly sprayCount = 260;
  private cursor = 0;
  private spawnAcc = 0;

  constructor(private scene: THREE.Scene, buildings: BuildingBox[]) {
    this.addPuddles(buildings);

    const geo = new THREE.BufferGeometry();
    this.sprayPositions = new Float32Array(this.sprayCount * 3);
    this.sprayLife = new Float32Array(this.sprayCount);
    this.sprayVel = new Float32Array(this.sprayCount * 3);
    for (let i = 0; i < this.sprayCount; i++) this.sprayPositions[i * 3 + 1] = -100;
    geo.setAttribute("position", new THREE.BufferAttribute(this.sprayPositions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xbfd4ea,
      size: 0.16,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.spray = new THREE.Points(geo, mat);
    this.spray.frustumCulled = false;
    this.scene.add(this.spray);
  }

  private addPuddles(buildings: BuildingBox[]) {
    const geo = new THREE.CircleGeometry(1, 18);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a1220,
      roughness: 0.04,
      metalness: 1,
      envMapIntensity: 2.4,
      transparent: true,
      opacity: 0.9,
    });

    // puddles sit on the asphalt ring roads
    let placed = 0;
    let guard = 0;
    while (placed < 90 && guard < 1400) {
      guard++;
      const axis = Math.random() < 0.5;
      const laneIdx = Math.floor(Math.random() * (CITY.grid + 1));
      const laneCenter = -CITY_HALF + CITY.road / 2 + laneIdx * CITY.block;
      const along = (Math.random() - 0.5) * (CITY.size - CITY.road);
      const x = axis ? laneCenter + (Math.random() - 0.5) * CITY.road * 0.8 : along;
      const z = axis ? along : laneCenter + (Math.random() - 0.5) * CITY.road * 0.8;

      let inside = false;
      for (const b of buildings) {
        if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) {
          inside = true;
          break;
        }
      }
      if (inside) continue;

      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, 0.028, z);
      const s = 0.8 + Math.random() * 2.6;
      m.scale.set(s, 1, s * (0.6 + Math.random() * 0.8));
      m.rotation.y = Math.random() * Math.PI;
      this.scene.add(m);
      this.puddles.push(m);
      placed++;
    }
  }

  /** Emit tyre spray behind a speeding car and update existing droplets. */
  update(dt: number, carPos: THREE.Vector3 | null, speedKmh: number) {
    if (carPos && speedKmh > 28 && dt > 0) {
      this.spawnAcc += dt * Math.min(90, speedKmh * 1.5);
      while (this.spawnAcc > 1) {
        this.spawnAcc -= 1;
        const i = this.cursor;
        this.cursor = (this.cursor + 1) % this.sprayCount;
        this.sprayPositions[i * 3] = carPos.x + (Math.random() - 0.5) * 1.8;
        this.sprayPositions[i * 3 + 1] = 0.15;
        this.sprayPositions[i * 3 + 2] = carPos.z + (Math.random() - 0.5) * 1.8;
        this.sprayVel[i * 3] = (Math.random() - 0.5) * 3;
        this.sprayVel[i * 3 + 1] = 1.2 + Math.random() * 2.2;
        this.sprayVel[i * 3 + 2] = (Math.random() - 0.5) * 3;
        this.sprayLife[i] = 0.5 + Math.random() * 0.4;
      }
    }

    for (let i = 0; i < this.sprayCount; i++) {
      if (this.sprayLife[i] <= 0) continue;
      this.sprayLife[i] -= dt;
      this.sprayVel[i * 3 + 1] -= 9.8 * dt;
      this.sprayPositions[i * 3] += this.sprayVel[i * 3] * dt;
      this.sprayPositions[i * 3 + 1] += this.sprayVel[i * 3 + 1] * dt;
      this.sprayPositions[i * 3 + 2] += this.sprayVel[i * 3 + 2] * dt;
      if (this.sprayPositions[i * 3 + 1] < 0 || this.sprayLife[i] <= 0) {
        this.sprayPositions[i * 3 + 1] = -100;
        this.sprayLife[i] = 0;
      }
    }
    this.spray.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    for (const p of this.puddles) this.scene.remove(p);
  }
}
