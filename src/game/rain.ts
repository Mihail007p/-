import * as THREE from "three";
import { createRainTexture } from "./textures";

/**
 * Rain: GPU points with a vertical streak sprite, wrapped around the camera.
 * Plus splash ripples on the ground near the player.
 */
export class Rain {
  points: THREE.Points;
  private positions: Float32Array;
  private speeds: Float32Array;
  private readonly count: number;
  private readonly area = 120;
  private readonly height = 60;

  constructor(count = 7000) {
    this.count = count;
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(count * 3);
    this.speeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      this.positions[i * 3] = (Math.random() - 0.5) * this.area;
      this.positions[i * 3 + 1] = Math.random() * this.height;
      this.positions[i * 3 + 2] = (Math.random() - 0.5) * this.area;
      this.speeds[i] = 32 + Math.random() * 26;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));

    const mat = new THREE.PointsMaterial({
      map: createRainTexture(),
      color: 0xa8c8e8,
      size: 1.15,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      toneMapped: false,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  update(dt: number, center: THREE.Vector3, windX = 1.6) {
    const pos = this.positions;
    const half = this.area / 2;
    for (let i = 0; i < this.count; i++) {
      const iy = i * 3 + 1;
      pos[iy] -= this.speeds[i] * dt;
      pos[i * 3] += windX * dt;
      if (pos[iy] < 0) {
        pos[iy] = this.height;
        pos[i * 3] = center.x + (Math.random() - 0.5) * this.area;
        pos[i * 3 + 2] = center.z + (Math.random() - 0.5) * this.area;
      } else {
        // keep the volume centered on the camera
        if (pos[i * 3] - center.x > half) pos[i * 3] -= this.area;
        if (pos[i * 3] - center.x < -half) pos[i * 3] += this.area;
        if (pos[i * 3 + 2] - center.z > half) pos[i * 3 + 2] -= this.area;
        if (pos[i * 3 + 2] - center.z < -half) pos[i * 3 + 2] += this.area;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

/** Soft ground mist planes drifting at street level. */
export function createMist(radius = 90) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(150,180,220,0.20)");
  g.addColorStop(0.5, "rgba(120,150,190,0.08)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(radius, radius);
  for (let i = 0; i < 7; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((Math.random() - 0.5) * 120, 1.2 + Math.random() * 3, (Math.random() - 0.5) * 120);
    m.userData.drift = new THREE.Vector2((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6);
    m.userData.bob = Math.random() * Math.PI * 2;
    group.add(m);
  }
  return group;
}
