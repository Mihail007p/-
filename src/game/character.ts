import * as THREE from "three";
import type { BuildingBox } from "./city";

/**
 * Low-poly pedestrian / player character built from primitives.
 * Animated by rotating limbs from walkPhase.
 */
export class Character {
  group = new THREE.Group();
  private body = new THREE.Group();
  private hips: THREE.Object3D[] = [];
  private arms: THREE.Object3D[] = [];
  private head: THREE.Mesh;
  private jacketMat: THREE.MeshStandardMaterial;

  velocity = new THREE.Vector3();
  walkPhase = 0;
  heading = 0;
  radius = 0.45;

  constructor(jacket = 0x1e2b3c, pants = 0x14181f, skin = 0x8d6249, scale = 1) {
    this.jacketMat = new THREE.MeshPhysicalMaterial({
      color: jacket,
      roughness: 0.62,
      metalness: 0.15,
      clearcoat: 0.4,
      clearcoatRoughness: 0.5,
    });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.85 });
    const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.75 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: 0.6 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.66, 0.3), this.jacketMat);
    torso.position.y = 1.22;
    torso.castShadow = true;
    this.body.add(torso);

    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.24, 0.28), pantsMat);
    hips.position.y = 0.84;
    this.body.add(hips);

    // head + neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.1, 8), skinMat);
    neck.position.y = 1.6;
    this.body.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), skinMat);
    head.position.y = 1.79;
    head.scale.set(0.92, 1.05, 0.95);
    head.castShadow = true;
    this.body.add(head);
    this.head = head;

    // hair / hood
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
      new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: 0.95 })
    );
    hair.position.y = 1.81;
    this.body.add(hair);

    // legs pivot at hips
    for (const s of [-1, 1]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(s * 0.13, 0.82, 0);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.78, 0.2), pantsMat);
      leg.position.y = -0.39;
      leg.castShadow = true;
      pivot.add(leg);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.32), shoeMat);
      shoe.position.set(0, -0.79, -0.05);
      pivot.add(shoe);
      this.body.add(pivot);
      this.hips.push(pivot);
    }

    // arms pivot at shoulders
    for (const s of [-1, 1]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(s * 0.33, 1.45, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.62, 0.16), this.jacketMat);
      arm.position.y = -0.3;
      arm.castShadow = true;
      pivot.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), skinMat);
      hand.position.y = -0.64;
      pivot.add(hand);
      this.body.add(pivot);
      this.arms.push(pivot);
    }

    this.body.scale.setScalar(scale);
    this.group.add(this.body);
  }

  setColor(jacket: number) {
    this.jacketMat.color.setHex(jacket);
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

  update(dt: number, move: THREE.Vector3, heading: number, isRunning: boolean, buildings: BuildingBox[]) {
    // move is desired direction * speed
    this.velocity.lerp(move, Math.min(1, dt * 12));
    const next = this.group.position.clone().addScaledVector(this.velocity, dt);

    for (const b of buildings) {
      if (b.height < 0.6) continue;
      const cx = THREE.MathUtils.clamp(next.x, b.minX, b.maxX);
      const cz = THREE.MathUtils.clamp(next.z, b.minZ, b.maxZ);
      const dx = next.x - cx;
      const dz = next.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < this.radius * this.radius && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (this.radius - d) / d;
        next.x += dx * push;
        next.z += dz * push;
      }
    }

    this.group.position.copy(next);
    this.heading = heading;
    this.group.rotation.y = heading;

    const speed = this.velocity.length();
    if (speed > 0.25) {
      this.walkPhase += dt * (isRunning ? 12 : 8) * Math.min(1.6, 0.5 + speed / 5);
      const swing = Math.min(1.1, speed / 4) * (isRunning ? 1.15 : 0.8);
      this.hips[0].rotation.x = Math.sin(this.walkPhase) * swing;
      this.hips[1].rotation.x = Math.sin(this.walkPhase + Math.PI) * swing;
      this.arms[0].rotation.x = Math.sin(this.walkPhase + Math.PI) * swing * 0.85;
      this.arms[1].rotation.x = Math.sin(this.walkPhase) * swing * 0.85;
      this.body.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.045;
      this.body.rotation.x = isRunning ? 0.1 : 0.03;
    } else {
      this.walkPhase *= 0.9;
      const relax = Math.min(1, dt * 6);
      this.hips[0].rotation.x = THREE.MathUtils.lerp(this.hips[0].rotation.x, 0, relax);
      this.hips[1].rotation.x = THREE.MathUtils.lerp(this.hips[1].rotation.x, 0, relax);
      this.arms[0].rotation.x = THREE.MathUtils.lerp(this.arms[0].rotation.x, 0, relax);
      this.arms[1].rotation.x = THREE.MathUtils.lerp(this.arms[1].rotation.x, 0, relax);
      this.body.position.y = THREE.MathUtils.lerp(this.body.position.y, 0, relax);
      this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, 0, relax);
    }

    // idle breathing
    this.head.rotation.y = Math.sin(performance.now() * 0.0004) * 0.12;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat.dispose();
      }
    });
  }
}
