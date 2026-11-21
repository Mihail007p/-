import * as THREE from "three";
import type { Collider } from "./world/world";
import { createCharacter } from "./character/model";

/**
 * Third-person character.
 *
 * The figure itself is built in `src/character/model.ts` from measurements taken
 * off the concept illustration (`art/character.png`): 1.76 m tall, real joint
 * heights, textured denim/cotton/leather and a painted face. This class only
 * moves and animates it — physics, facing, and a two-segment walk cycle.
 */
export class Player {
  group = new THREE.Group();
  private model = new THREE.Group();

  height: number;
  palette: Record<string, number>;

  // limb chains
  private thighL: THREE.Object3D;
  private thighR: THREE.Object3D;
  private shinL: THREE.Object3D;
  private shinR: THREE.Object3D;
  private armL: THREE.Object3D;
  private armR: THREE.Object3D;
  private foreL: THREE.Object3D;
  private foreR: THREE.Object3D;
  private footL: THREE.Object3D;
  private footR: THREE.Object3D;

  private chest: THREE.Object3D;
  private head: THREE.Object3D;
  private hipBone: THREE.Object3D;

  velocity = new THREE.Vector3();
  heading = 0;
  radius = 0.4;

  private walkPhase = 0;
  private runAmount = 0;
  private bobPhase = 0;

  constructor(palette: Record<string, number> = {}, height = 1.78) {
    this.height = height;
    this.palette = palette;

    const rig = createCharacter(this.height, palette);
    this.model.add(rig.model);
    this.model = rig.model;

    this.chest = rig.chest;
    this.head = rig.head;
    this.hipBone = rig.hipBone;
    this.thighL = rig.thighL;
    this.thighR = rig.thighR;
    this.shinL = rig.shinL;
    this.shinR = rig.shinR;
    this.armL = rig.armL;
    this.armR = rig.armR;
    this.foreL = rig.foreL;
    this.foreR = rig.foreR;
    this.footL = rig.footL;
    this.footR = rig.footR;

      // shadows for everything at once
      this.model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });

      this.group.add(this.model);
  }

  place(x: number, z: number, heading = 0) {
    this.group.position.set(x, 0, z);
    this.heading = heading;
    this.group.rotation.y = heading;
    this.velocity.set(0, 0, 0);
  }

  get position() {
    return this.group.position;
  }

  update(
    dt: number,
    wishDir: THREE.Vector3,
    speed: number,
    colliders: Collider[],
    blockers: { x: number; z: number; r: number }[],
    limit: number
  ) {
    // ---- velocity, with acceleration and a little inertia ----------------
    const target = wishDir.clone().multiplyScalar(speed);
    const accel = wishDir.lengthSq() > 0 ? 13 : 17;
    this.velocity.x += (target.x - this.velocity.x) * Math.min(1, accel * dt);
    this.velocity.z += (target.z - this.velocity.z) * Math.min(1, accel * dt);

    const next = this.group.position.clone().addScaledVector(this.velocity, dt);
    next.x = THREE.MathUtils.clamp(next.x, -limit, limit);
    next.z = THREE.MathUtils.clamp(next.z, -limit, limit);

    // ---- collisions ------------------------------------------------------
    for (const c of colliders) {
      if (c.height < 0.8) continue;
      const cx = THREE.MathUtils.clamp(next.x, c.x0, c.x1);
      const cz = THREE.MathUtils.clamp(next.z, c.z0, c.z1);
      const dx = next.x - cx;
      const dz = next.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < this.radius * this.radius) {
        if (d2 > 1e-5) {
          const d = Math.sqrt(d2);
          next.x += (dx / d) * (this.radius - d);
          next.z += (dz / d) * (this.radius - d);
        } else {
          const toLeft = Math.abs(next.x - c.x0);
          const toRight = Math.abs(c.x1 - next.x);
          const toNear = Math.abs(next.z - c.z0);
          const toFar = Math.abs(c.z1 - next.z);
          const min = Math.min(toLeft, toRight, toNear, toFar);
          if (min === toLeft) next.x = c.x0 - this.radius;
          else if (min === toRight) next.x = c.x1 + this.radius;
          else if (min === toNear) next.z = c.z0 - this.radius;
          else next.z = c.z1 + this.radius;
        }
      }
    }

    for (const b of blockers) {
      const dx = next.x - b.x;
      const dz = next.z - b.z;
      const rr = b.r + this.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-5) {
        const d = Math.sqrt(d2);
        next.x += (dx / d) * (rr - d);
        next.z += (dz / d) * (rr - d);
      }
    }

    this.group.position.copy(next);

    // ---- facing: turn towards movement, faster when running ---------------
    const spd = this.velocity.length();
    if (spd > 0.25) {
      const wanted = Math.atan2(-this.velocity.x, -this.velocity.z);
      let diff = wanted - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += diff * Math.min(1, dt * (7 + Math.min(8, spd * 1.6)));
      this.group.rotation.y = this.heading;
    }

    // ---- animation -------------------------------------------------------
    this.runAmount = THREE.MathUtils.lerp(
      this.runAmount,
      THREE.MathUtils.clamp((spd - 1.6) / 3.4, 0, 1),
      Math.min(1, dt * 5)
    );

    if (spd > 0.25) {
      // stride frequency grows with speed: ~1.8 steps/s walking, 3.2 running
      const cadence = 1.75 + this.runAmount * 1.5;
      this.walkPhase = (this.walkPhase + dt * cadence * Math.PI * 2) % (Math.PI * 2);
      this.bobPhase = (this.bobPhase + dt * cadence * Math.PI * 4) % (Math.PI * 2);

      const s = Math.sin(this.walkPhase);
      const c = Math.cos(this.walkPhase);
      // amplitude in radians: modest walk, big run
      const hipSwing = 0.42 + this.runAmount * 0.42;
      const kneeBend = 0.25 + this.runAmount * 0.75;

      this.thighL.rotation.x = -s * hipSwing;
      this.thighR.rotation.x = s * hipSwing;

      // knees only bend backwards, strongest as the leg swings forward
      this.shinL.rotation.x = Math.max(0, c * 0.5 + 0.5) * kneeBend + 0.06;
      this.shinR.rotation.x = Math.max(0, -c * 0.5 + 0.5) * kneeBend + 0.06;

      // arms swing opposite to the legs, elbows bend while running
      this.armL.rotation.x = s * (0.4 + this.runAmount * 0.55);
      this.armR.rotation.x = -s * (0.4 + this.runAmount * 0.55);
      const elbow = 0.18 + this.runAmount * 0.85;
      this.foreL.rotation.x = -elbow - Math.max(0, s) * 0.35;
      this.foreR.rotation.x = -elbow - Math.max(0, -s) * 0.35;

      // torso: counter-rotation and forward lean, plus a vertical bob
      this.chest.rotation.y = -s * 0.1;
      this.hipBone.rotation.y = s * 0.07;
      this.model.rotation.x = 0.03 + this.runAmount * 0.14;
      this.model.position.y = Math.abs(Math.sin(this.bobPhase)) * (0.02 + this.runAmount * 0.035);

      // head stabilises against the body bob
      // ankles: the toe points down as the leg pushes off (heel–toe roll)
      this.footL.rotation.x = -Math.max(0, Math.sin(this.walkPhase - 0.9)) * 0.5 * (0.6 + this.runAmount);
      this.footR.rotation.x = -Math.max(0, Math.sin(this.walkPhase + Math.PI - 0.9)) * 0.5 * (0.6 + this.runAmount);

      this.head.rotation.x = -0.4 * this.model.rotation.x;
      this.head.rotation.z = s * 0.03 * (1 - this.runAmount);
    } else {
      // idle: relaxed pose with slow breathing
      const relax = Math.min(1, dt * 6);
      for (const limb of [this.thighL, this.thighR, this.shinL, this.shinR]) {
        limb.rotation.x = THREE.MathUtils.lerp(limb.rotation.x, limb === this.shinL || limb === this.shinR ? 0.05 : 0, relax);
      }
      for (const limb of [this.armL, this.armR]) {
        limb.rotation.x = THREE.MathUtils.lerp(limb.rotation.x, 0, relax);
      }
      this.foreL.rotation.x = THREE.MathUtils.lerp(this.foreL.rotation.x, -0.12, relax);
      this.foreR.rotation.x = THREE.MathUtils.lerp(this.foreR.rotation.x, -0.12, relax);

      const breathe = Math.sin(performance.now() * 0.0016);
      this.chest.scale.y = 0.72 + breathe * 0.008;
      this.chest.rotation.y = THREE.MathUtils.lerp(this.chest.rotation.y, 0, relax);
      this.hipBone.rotation.y = THREE.MathUtils.lerp(this.hipBone.rotation.y, 0, relax);
      this.model.rotation.x = THREE.MathUtils.lerp(this.model.rotation.x, 0, relax);
      this.model.position.y = THREE.MathUtils.lerp(this.model.position.y, 0, relax);
      this.head.rotation.x = THREE.MathUtils.lerp(this.head.rotation.x, 0, relax);
      this.footL.rotation.x = THREE.MathUtils.lerp(this.footL.rotation.x, 0, relax);
      this.footR.rotation.x = THREE.MathUtils.lerp(this.footR.rotation.x, 0, relax);

      // look around slightly when standing still
      this.head.rotation.y = Math.sin(performance.now() * 0.00035) * 0.22;
    }

    if (spd > 0.25) this.head.rotation.y = THREE.MathUtils.lerp(this.head.rotation.y, 0, Math.min(1, dt * 4));
  }

  focus(out = new THREE.Vector3()) {
    return out.copy(this.group.position).add(new THREE.Vector3(0, 1.45, 0));
  }
}
