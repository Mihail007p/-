import * as THREE from "three";
import type { Collider } from "./world/world";

/**
 * Third-person character.
 *
 * Built from tapered primitives instead of boxes: the silhouette reads as a
 * person at a distance, with a two-segment walk cycle (thigh + shin, upper arm +
 * forearm), a neck, shoulders, a jaw, ears, hair and clothing that reacts to
 * speed (jacket sway, head bob, lean into the run).
 *
 * ~1.78 m tall; all limbs pivot at anatomically sensible heights.
 */
export class Player {
  group = new THREE.Group();
  private model = new THREE.Group();

  // limb chains
  private thighL = new THREE.Object3D();
  private thighR = new THREE.Object3D();
  private shinL = new THREE.Object3D();
  private shinR = new THREE.Object3D();
  private armL = new THREE.Object3D();
  private armR = new THREE.Object3D();
  private foreL = new THREE.Object3D();
  private foreR = new THREE.Object3D();

  private chest: THREE.Object3D;
  private head: THREE.Object3D;
  private hipBone: THREE.Object3D;

  velocity = new THREE.Vector3();
  heading = 0;
  radius = 0.4;

  private walkPhase = 0;
  private runAmount = 0;
  private bobPhase = 0;

  constructor(
    palette: {
      skin?: number;
      shirt?: number;
      trousers?: number;
      shoes?: number;
      hair?: number;
    } = {}
  ) {
    const skin = new THREE.MeshStandardMaterial({
      color: palette.skin ?? 0xc08a68,
      roughness: 0.62,
      metalness: 0.02,
    });
    const shirt = new THREE.MeshStandardMaterial({
      color: palette.shirt ?? 0x2f4a63,
      roughness: 0.72,
      metalness: 0.04,
      // subtle sheen so the fabric is not flat
      envMapIntensity: 0.5,
    });
    const trousers = new THREE.MeshStandardMaterial({
      color: palette.trousers ?? 0x2a3340,
      roughness: 0.85,
    });
    const shoes = new THREE.MeshStandardMaterial({
      color: palette.shoes ?? 0x1a1c1f,
      roughness: 0.55,
      metalness: 0.15,
    });
    const hair = new THREE.MeshStandardMaterial({
      color: palette.hair ?? 0x2b2119,
      roughness: 0.92,
      flatShading: true,
    });
    const eye = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.25 });

    // ------------------------------------------------------------ torso
    // pelvis
    const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.1, 4, 10), trousers);
    pelvis.scale.set(1.15, 1, 0.78);
    pelvis.position.y = 0.92;
    this.model.add(pelvis);

    const hipBone = new THREE.Object3D();
    hipBone.position.y = 0.95;
    this.model.add(hipBone);
    this.hipBone = hipBone;

    // chest: tapered capsule, wider at the shoulders
    const chestGeo = new THREE.CapsuleGeometry(0.19, 0.22, 5, 12);
    const chest = new THREE.Mesh(chestGeo, shirt);
    chest.scale.set(1.12, 1, 0.72);
    chest.position.y = 1.3;
    this.model.add(chest);
    this.chest = chest;

    // shoulder caps to hide the arm joints
    for (const side of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.088, 10, 8), shirt);
      cap.position.set(side * 0.185, 1.43, 0);
      cap.scale.set(1, 0.9, 0.9);
      this.model.add(cap);
    }

    // collar
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.095, 0.06, 12),
      new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.8 })
    );
    collar.position.y = 1.47;
    this.model.add(collar);

    // ------------------------------------------------------------- neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.062, 0.08, 10), skin);
    neck.position.y = 1.5;
    this.model.add(neck);

    // ------------------------------------------------------------- head
    const headGroup = new THREE.Object3D();
    headGroup.position.y = 1.56;
    this.model.add(headGroup);
    this.head = headGroup;

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.108, 18, 16), skin);
    skull.scale.set(0.92, 1.06, 0.95);
    skull.position.y = 0.075;
    headGroup.add(skull);

    // jaw / chin
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.082, 14, 12), skin);
    jaw.scale.set(0.86, 0.72, 0.9);
    jaw.position.set(0, 0.022, 0.014);
    headGroup.add(jaw);

    // nose
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.019, 0.05, 6), skin);
    nose.rotation.x = Math.PI / 2.05;
    nose.position.set(0, 0.062, 0.1);
    headGroup.add(nose);

    // ears
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), skin);
      ear.scale.set(0.5, 1, 0.8);
      ear.position.set(side * 0.098, 0.07, -0.005);
      headGroup.add(ear);
    }

    // eyes
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), eye);
      e.position.set(side * 0.036, 0.082, 0.088);
      headGroup.add(e);
    }

    // hair: a cap plus a small swept fringe
    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.113, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.66),
      hair
    );
    hairCap.position.y = 0.08;
    hairCap.scale.set(0.95, 1.05, 0.98);
    headGroup.add(hairCap);

    const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.032, 0.05), hair);
    fringe.position.set(0.012, 0.135, 0.075);
    fringe.rotation.z = -0.16;
    headGroup.add(fringe);

    // ------------------------------------------------------------- legs
    // thigh -> knee -> shin -> ankle -> shoe
    const buildLeg = (side: 1 | -1) => {
      const thighPivot = new THREE.Object3D();
      thighPivot.position.set(side * 0.085, 0.95, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.3, 4, 10), trousers);
      thigh.position.y = -0.21;
      thigh.scale.set(1, 1, 0.92);
      thighPivot.add(thigh);

      const shinPivot = new THREE.Object3D();
      shinPivot.position.y = -0.45;
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.32, 4, 10), trousers);
      shin.position.y = -0.19;
      shin.scale.set(1, 1, 0.95);
      shinPivot.add(shin);

      // ankle + shoe (sole slightly wider, toe box forward)
      // ankle sits at the end of the shin, the sole rests exactly on y = 0
      // hip 0.95 = thigh 0.44 + shin 0.45 + shoe 0.06, so the sole sits on y = 0
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.078, 0.26), shoes);
      shoe.position.set(0, -0.458, 0.05);
      shinPivot.add(shoe);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.106, 0.018, 0.27), shoes);
      sole.position.set(0, -0.494, 0.05);
      shinPivot.add(sole);

      this.model.add(thighPivot);
      thighPivot.add(shinPivot);
      return { thighPivot, shinPivot };
    };

    const left = buildLeg(-1);
    const right = buildLeg(1);
    this.thighL = left.thighPivot;
    this.shinL = left.shinPivot;
    this.thighR = right.thighPivot;
    this.shinR = right.shinPivot;

    // ------------------------------------------------------------- arms
    const buildArm = (side: 1 | -1) => {
      const armPivot = new THREE.Object3D();
      armPivot.position.set(side * 0.185, 1.41, 0);

      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.2, 4, 10), shirt);
      upper.position.y = -0.12;
      armPivot.add(upper);

      const forePivot = new THREE.Object3D();
      forePivot.position.y = -0.26;
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.044, 0.19, 4, 10), shirt);
      fore.position.y = -0.11;
      forePivot.add(fore);

      // hand
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), skin);
      hand.scale.set(0.85, 1.15, 0.6);
      hand.position.y = -0.235;
      forePivot.add(hand);

      armPivot.add(forePivot);
      this.model.add(armPivot);
      return { armPivot, forePivot };
    };

    const armLeft = buildArm(-1);
    const armRight = buildArm(1);
    this.armL = armLeft.armPivot;
    this.foreL = armLeft.forePivot;
    this.armR = armRight.armPivot;
    this.foreR = armRight.forePivot;

    // a slight rest pose: arms hang a little away from the body
    this.armL.rotation.z = 0.08;
    this.armR.rotation.z = -0.08;

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

      // look around slightly when standing still
      this.head.rotation.y = Math.sin(performance.now() * 0.00035) * 0.22;
    }

    if (spd > 0.25) this.head.rotation.y = THREE.MathUtils.lerp(this.head.rotation.y, 0, Math.min(1, dt * 4));
  }

  focus(out = new THREE.Vector3()) {
    return out.copy(this.group.position).add(new THREE.Vector3(0, 1.45, 0));
  }
}
