import * as THREE from "three";
import type { Collider } from "./world/world";

/**
 * Third-person character: a readable low-poly figure with a walk cycle.
 * Movement is camera-relative; collision is circle-vs-AABB against buildings.
 */
export class Player {
  group = new THREE.Group();
  private model = new THREE.Group();
  private leftLeg = new THREE.Object3D();
  private rightLeg = new THREE.Object3D();
  private leftArm = new THREE.Object3D();
  private rightArm = new THREE.Object3D();

  velocity = new THREE.Vector3();
  heading = 0;
  radius = 0.42;
  private walkPhase = 0;
  private runAmount = 0;

  constructor() {
    const skin = new THREE.MeshStandardMaterial({ color: 0xb07a5c, roughness: 0.75 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0x2c4a63, roughness: 0.7 });
    const jeans = new THREE.MeshStandardMaterial({ color: 0x27313d, roughness: 0.85 });
    const shoes = new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.6 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x2b2119, roughness: 0.9 });

    // torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.6, 0.26), shirt);
    torso.position.y = 1.16;
    torso.castShadow = true;
    this.model.add(torso);

    // hips
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.24), jeans);
    hips.position.y = 0.84;
    hips.castShadow = true;
    this.model.add(hips);

    // neck + head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 8), skin);
    neck.position.y = 1.5;
    this.model.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), skin);
    head.position.y = 1.66;
    head.scale.set(0.92, 1.06, 0.94);
    head.castShadow = true;
    this.model.add(head);

    const hairMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.178, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
      hair
    );
    hairMesh.position.y = 1.68;
    this.model.add(hairMesh);

    // legs pivot at the hips
    for (const side of [-1, 1]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * 0.12, 0.78, 0);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.72, 0.18), jeans);
      leg.position.y = -0.36;
      leg.castShadow = true;
      pivot.add(leg);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.3), shoes);
      shoe.position.set(0, -0.74, -0.04);
      pivot.add(shoe);
      this.model.add(pivot);
      if (side < 0) this.leftLeg = pivot;
      else this.rightLeg = pivot;
    }

    // arms pivot at the shoulders
    for (const side of [-1, 1]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * 0.29, 1.4, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.56, 0.14), shirt);
      arm.position.y = -0.27;
      arm.castShadow = true;
      pivot.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), skin);
      hand.position.y = -0.57;
      pivot.add(hand);
      this.model.add(pivot);
      if (side < 0) this.leftArm = pivot;
      else this.rightArm = pivot;
    }

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

  /**
   * @param wishDir normalised desired direction in world space (may be zero)
   * @param speed  target speed in m/s
   */
  update(
    dt: number,
    wishDir: THREE.Vector3,
    speed: number,
    colliders: Collider[],
    blockers: { x: number; z: number; r: number }[],
    limit: number
  ) {
    const target = wishDir.clone().multiplyScalar(speed);
    // accelerate towards the target velocity (snappy but not instant)
    const accel = wishDir.lengthSq() > 0 ? 14 : 18;
    this.velocity.x += (target.x - this.velocity.x) * Math.min(1, accel * dt);
    this.velocity.z += (target.z - this.velocity.z) * Math.min(1, accel * dt);

    const next = this.group.position.clone().addScaledVector(this.velocity, dt);
    next.x = THREE.MathUtils.clamp(next.x, -limit, limit);
    next.z = THREE.MathUtils.clamp(next.z, -limit, limit);

    // buildings
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
          // inside the box: push out through the nearest face
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

    // round blockers (trees, poles, parked cars)
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

    // face movement direction
    const moving = this.velocity.lengthSq() > 0.35;
    if (moving) {
      const wanted = Math.atan2(-this.velocity.x, -this.velocity.z);
      let diff = wanted - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += diff * Math.min(1, dt * 12);
      this.group.rotation.y = this.heading;
    }

    // animation
    const spd = this.velocity.length();
    this.runAmount = THREE.MathUtils.lerp(this.runAmount, Math.min(1, spd / 5), Math.min(1, dt * 6));
    if (spd > 0.3) {
      this.walkPhase += dt * (7 + spd * 1.5);
      const swing = 0.42 + this.runAmount * 0.55;
      this.leftLeg.rotation.x = Math.sin(this.walkPhase) * swing;
      this.rightLeg.rotation.x = -Math.sin(this.walkPhase) * swing;
      this.leftArm.rotation.x = -Math.sin(this.walkPhase) * swing * 0.8;
      this.rightArm.rotation.x = Math.sin(this.walkPhase) * swing * 0.8;
      this.model.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.035 * (1 + this.runAmount);
      this.model.rotation.x = 0.04 + this.runAmount * 0.1;
    } else {
      const relax = Math.min(1, dt * 8);
      for (const limb of [this.leftLeg, this.rightLeg, this.leftArm, this.rightArm]) {
        limb.rotation.x = THREE.MathUtils.lerp(limb.rotation.x, 0, relax);
      }
      this.model.position.y = THREE.MathUtils.lerp(this.model.position.y, 0, relax);
      this.model.rotation.x = THREE.MathUtils.lerp(this.model.rotation.x, 0, relax);
    }
  }

  /** Camera focus point (chest height). */
  focus(out = new THREE.Vector3()) {
    return out.copy(this.group.position).add(new THREE.Vector3(0, 1.45, 0));
  }
}
