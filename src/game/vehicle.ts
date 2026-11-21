import * as THREE from "three";
import type { BuildingBox } from "./city";

export const CAR_COLORS = [
  0xb3202a, 0x1d2b3a, 0xd8d8dc, 0x0e0f12, 0x2d4a6b, 0x6b6f74,
  0x8c1f4a, 0xc9a227, 0x26523f, 0x5a2a6b,
];

const BODY_GEOM_CACHE = new Map<string, THREE.BufferGeometry>();

export type CarSpec = {
  length: number;
  width: number;
  height: number;
  mass: number;
  engine: number;
  maxSpeed: number;
  brake: number;
};

export class Car {
  group = new THREE.Group();
  body = new THREE.Group();
  chassis: THREE.Object3D;
  wheels: THREE.Mesh[] = [];
  frontWheels: THREE.Object3D[] = [];
  headlights: THREE.SpotLight[] = [];
  headGlow: THREE.Sprite[] = [];
  tailLights: THREE.Mesh[] = [];
  brakeLights: THREE.Mesh[] = [];

  heading = 0;
  velocity = new THREE.Vector3();
  steer = 0;
  speedKmh = 0;
  /** lateral slide in m/s, used for tyre squeal audio */
  slip = 0;
  gear = 1;
  isPlayer = false;

  spec: CarSpec = {
    length: 4.4,
    width: 1.95,
    height: 1.32,
    mass: 1200,
    engine: 14,
    maxSpeed: 36,
    brake: 26,
  };

  private radius = 1.7;
  private wheelSpin = 0;

  constructor(public color = 0x222831, opts: { taxi?: boolean; player?: boolean } = {}) {
    const g = new THREE.Group();
    g.name = "body";

    const paint = new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0.85,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.8,
    });

    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x0a1016,
      metalness: 0.9,
      roughness: 0.08,
      transparent: true,
      opacity: 0.82,
      envMapIntensity: 2.2,
    });

    // lower body
    const lower = new THREE.Mesh(
      new THREE.BoxGeometry(this.spec.width, 0.62, this.spec.length),
      paint
    );
    lower.position.y = 0.62;
    lower.castShadow = true;
    g.add(lower);

    // hood + trunk wedge
    const hood = new THREE.Mesh(
      new THREE.BoxGeometry(this.spec.width * 0.96, 0.18, this.spec.length * 0.3),
      paint
    );
    hood.position.set(0, 0.95, -this.spec.length * 0.33);
    hood.castShadow = true;
    g.add(hood);

    // cabin
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(this.spec.width * 0.82, 0.52, this.spec.length * 0.42),
      glass
    );
    cabin.position.set(0, 1.14, -0.12);
    cabin.castShadow = true;
    g.add(cabin);

    // roof
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(this.spec.width * 0.78, 0.08, this.spec.length * 0.3),
      paint
    );
    roof.position.set(0, 1.41, -0.2);
    g.add(roof);

    // splitter / skirts
    const skirtMat = new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.7, metalness: 0.4 });
    const skirt = new THREE.Mesh(
      new THREE.BoxGeometry(this.spec.width * 1.01, 0.12, this.spec.length * 0.86),
      skirtMat
    );
    skirt.position.y = 0.34;
    g.add(skirt);

    // lights
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfff6da,
      emissive: 0xfff2c8,
      emissiveIntensity: 4.5,
      toneMapped: false,
    });
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0x3a0308,
      emissive: 0xff1020,
      emissiveIntensity: 2.6,
      toneMapped: false,
    });

    for (const sx of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.08), headMat);
      hl.position.set(sx * (this.spec.width / 2 - 0.3), 0.72, -this.spec.length / 2 - 0.01);
      g.add(hl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 0.07), tailMat.clone());
      tl.position.set(sx * (this.spec.width / 2 - 0.28), 0.76, this.spec.length / 2 + 0.01);
      g.add(tl);
      this.tailLights.push(tl);
      this.brakeLights.push(tl);

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: CAR_GLOW(),
          color: 0xfff0c0,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        })
      );
      glow.scale.set(2.6, 2.6, 1);
      glow.position.set(sx * (this.spec.width / 2 - 0.3), 0.74, -this.spec.length / 2 - 0.2);
      g.add(glow);
      this.headGlow.push(glow);
    }

    // wheels
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0b0d, roughness: 0.88, metalness: 0.1 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x8b929c, roughness: 0.25, metalness: 1 });
    const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.28, 10);
    rimGeo.rotateZ(Math.PI / 2);

    const wheelPos: [number, number, number][] = [
      [-this.spec.width / 2 + 0.06, 0.36, -this.spec.length * 0.31],
      [this.spec.width / 2 - 0.06, 0.36, -this.spec.length * 0.31],
      [-this.spec.width / 2 + 0.06, 0.36, this.spec.length * 0.31],
      [this.spec.width / 2 - 0.06, 0.36, this.spec.length * 0.31],
    ];

    wheelPos.forEach(([x, y, z], i) => {
      const holder = new THREE.Object3D();
      holder.position.set(x, y, z);
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.castShadow = true;
      const rim = new THREE.Mesh(rimGeo, rimMat);
      w.add(rim);
      holder.add(w);
      g.add(holder);
      this.wheels.push(w);
      if (i < 2) this.frontWheels.push(holder);
    });

    // taxi roof sign
    if (opts.taxi) {
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.28, 0.34),
        new THREE.MeshBasicMaterial({ color: 0xffd15c, toneMapped: false })
      );
      sign.position.set(0, 1.58, -0.2);
      g.add(sign);
    }

    this.chassis = lower;
    this.body = g;
    this.group.add(g);
    this.isPlayer = !!opts.player;

    if (opts.player) {
      // Real headlight beams, only for the player's car (perf).
      for (const sx of [-1, 1]) {
        const spot = new THREE.SpotLight(0xfff0cc, 60, 42, 0.55, 0.6, 1.4);
        spot.position.set(sx * (this.spec.width / 2 - 0.3), 0.75, -this.spec.length / 2);
        spot.target.position.set(sx * 1.4, -1.4, -22);
        this.group.add(spot);
        this.group.add(spot.target);
        this.headlights.push(spot);
      }
      const tail = new THREE.PointLight(0xff2030, 6, 9, 2);
      tail.position.set(0, 0.7, this.spec.length / 2 + 0.2);
      this.group.add(tail);
    }
  }

  setColor(color: number) {
    (this.chassis as THREE.Mesh).material = new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0.85,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.8,
    });
  }

  place(x: number, z: number, heading: number) {
    this.group.position.set(x, 0, z);
    this.heading = heading;
    this.group.rotation.y = heading;
    this.velocity.set(0, 0, 0);
    this.steer = 0;
  }

  get position() {
    return this.group.position;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
  }

  update(dt: number, input: { throttle: number; steer: number; handbrake: boolean }, buildings: BuildingBox[]) {
    const spec = this.spec;
    const fwd = this.forward(TMP_FWD);

    // current forward / lateral speed
    let vForward = this.velocity.dot(fwd);
    const right = TMP_RIGHT.set(fwd.z, 0, -fwd.x);
    let vLateral = this.velocity.dot(right);

    // engine / brake (queued so acceleration feels punchy but controllable)
    const throttle = input.throttle;
    if (throttle > 0.01) {
      if (vForward < 0) vForward += spec.brake * dt;
      else vForward += spec.engine * throttle * dt * (1 - Math.min(1, vForward / spec.maxSpeed));
    } else if (throttle < -0.01) {
      if (vForward > 1.2) vForward -= spec.brake * dt;
      else vForward += throttle * 8 * dt; // reverse
    } else {
      const drag = 1.6 * dt;
      if (Math.abs(vForward) < drag) vForward = 0;
      else vForward -= Math.sign(vForward) * drag;
    }

    // rolling resistance & top speed clamp
    vForward -= vForward * (0.22 + Math.max(0, vForward) * 0.012) * dt;
    vForward = THREE.MathUtils.clamp(vForward, -12, spec.maxSpeed);

    // steering: less lock at speed so the car doesn't snap around
    const speedT = Math.min(1, Math.abs(vForward) / spec.maxSpeed);
    const maxLock = THREE.MathUtils.lerp(0.58, 0.2, speedT);
    const steerTarget = input.steer * maxLock;
    const steerSpeed = 3.4;
    this.steer += THREE.MathUtils.clamp(steerTarget - this.steer, -steerSpeed * dt, steerSpeed * dt);

    const speedFactor = THREE.MathUtils.clamp(Math.abs(vForward) / 3.2, 0, 1);
    const yawRate = (vForward / 2.7) * Math.tan(this.steer) * 0.62 * speedFactor;
    this.heading += yawRate * dt;

    // grip: lateral velocity decays fast, slower when handbraking -> drift
    const grip = input.handbrake ? 1.4 : 7.5;
    vLateral -= vLateral * Math.min(1, grip * dt);

    if (input.handbrake) {
      vForward -= vForward * 0.9 * dt;
      // add slide from rotation
      vLateral += yawRate * Math.abs(vForward) * 0.06;
    }

    this.slip = Math.abs(vLateral);

    // rebuild velocity
    const nfwd = this.forward(TMP_FWD);
    const nright = TMP_RIGHT.set(nfwd.z, 0, -nfwd.x);
    this.velocity.copy(nfwd.multiplyScalar(vForward)).addScaledVector(nright, vLateral);

    // integrate + collisions
    const next = TMP_POS.copy(this.group.position).addScaledVector(this.velocity, dt);
    this.resolveCollision(next, buildings);

    this.group.position.copy(next);
    this.group.rotation.y = this.heading;

    // visual feedback
    this.speedKmh = Math.abs(vForward) * 3.6;
    this.gear = vForward < -0.5 ? -1 : 1;
    this.wheelSpin += (vForward / 0.36) * dt;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
    for (const w of this.frontWheels) w.rotation.y = this.steer * 1.1;

    const braking = throttle < -0.01 || input.handbrake;
    for (const b of this.brakeLights) {
      const m = b.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = braking ? 11 : 2.2;
    }
    // headlight glow grows with speed for a sense of motion
    const glowSize = 2.4 + Math.min(1.4, Math.abs(vForward) * 0.03);
    for (const g of this.headGlow) g.scale.set(glowSize, glowSize, 1);

    // subtle body roll and pitch
    this.body.rotation.z = THREE.MathUtils.lerp(this.body.rotation.z, -yawRate * 0.05, 0.15);
    this.body.rotation.x = THREE.MathUtils.lerp(
      this.body.rotation.x,
      THREE.MathUtils.clamp((throttle > 0 ? -1 : 1) * 0.012 * Math.abs(vForward) * 0.1, -0.05, 0.05),
      0.1
    );
  }

  private resolveCollision(next: THREE.Vector3, buildings: BuildingBox[]) {
    const r = this.radius;
    for (const b of buildings) {
      if (b.height < 0.6) continue;
      const cx = THREE.MathUtils.clamp(next.x, b.minX, b.maxX);
      const cz = THREE.MathUtils.clamp(next.z, b.minZ, b.maxZ);
      const dx = next.x - cx;
      const dz = next.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (r - d) / d;
          next.x += dx * push;
          next.z += dz * push;
          const nx = dx / d;
          const nz = dz / d;
          const vn = this.velocity.x * nx + this.velocity.z * nz;
          if (vn < 0) {
            this.velocity.x -= nx * vn * 1.4;
            this.velocity.z -= nz * vn * 1.4;
            this.velocity.multiplyScalar(0.86);
          }
        } else {
          next.x += r;
        }
      }
    }
    this.velocity.multiplyScalar(0.999);
  }

  reset() {
    this.group.position.y = 0;
    this.velocity.set(0, 0, 0);
    this.heading = 0;
    this.group.rotation.set(0, 0, 0);
  }

  dispose() {
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh;
        m.geometry.dispose?.();
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat.dispose?.();
      }
    });
  }
}

const TMP_FWD = new THREE.Vector3();
const TMP_RIGHT = new THREE.Vector3();
const TMP_POS = new THREE.Vector3();

let glowTex: THREE.Texture | null = null;
function CAR_GLOW() {
  if (!glowTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,240,200,0.5)");
    g.addColorStop(1, "rgba(255,240,200,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    glowTex = new THREE.CanvasTexture(c);
    glowTex.colorSpace = THREE.SRGBColorSpace;
  }
  return glowTex;
}

export { BODY_GEOM_CACHE };
