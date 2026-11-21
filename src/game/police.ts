import * as THREE from "three";
import { Car } from "./vehicle";
import { CITY, CITY_HALF, type BuildingBox } from "./city";

export type CrimeLevel = 0 | 1 | 2 | 3 | 4 | 5;

export class Police {
  units: Car[] = [];
  lights: { red: THREE.Sprite; blue: THREE.Sprite; redLight: THREE.PointLight; blueLight: THREE.PointLight }[] = [];
  heat = 0;

  constructor(
    private scene: THREE.Scene,
    private buildings: BuildingBox[]
  ) {}

  spawnCop(target: THREE.Vector3, heading: number) {
    const car = new Car(0x0d1118, { player: false });
    car.spec = {
      length: 4.7,
      width: 2.0,
      height: 1.35,
      mass: 1600,
      engine: 16,
      maxSpeed: 40,
      brake: 30,
    };

    // police livery: white doors + black hood
    const white = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, roughness: 0.4, metalness: 0.5 });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.34, 2.0), white);
    strip.position.y = 0.7;
    car.body.add(strip);

    const lightBar = new THREE.Group();
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff1b2e, toneMapped: false });
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2b6bff, toneMapped: false });
    const redMesh = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.28), redMat);
    redMesh.position.x = -0.32;
    const blueMesh = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.28), blueMat);
    blueMesh.position.x = 0.32;
    lightBar.add(redMesh, blueMesh);
    lightBar.position.set(0, 1.52, -0.15);
    car.body.add(lightBar);

    const mkGlow = (color: number) => {
      const tex = makeGlow();
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex,
          color,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        })
      );
      sp.scale.set(4.5, 4.5, 1);
      sp.position.set(color === 0xff1b2e ? -0.4 : 0.4, 1.6, -0.15);
      car.body.add(sp);
      return sp;
    };

    const red = mkGlow(0xff2038);
    const blue = mkGlow(0x2f7bff);

    const redLight = new THREE.PointLight(0xff1430, 0, 16, 2);
    redLight.position.set(-0.4, 1.7, -0.2);
    car.body.add(redLight);
    const blueLight = new THREE.PointLight(0x2f66ff, 0, 16, 2);
    blueLight.position.set(0.4, 1.7, -0.2);
    car.body.add(blueLight);

    // spawn out of sight: 55-80m away, snapped to the nearest road lane
    const angle = Math.random() * Math.PI * 2;
    const dist = 55 + Math.random() * 25;
    const x = clamp(target.x + Math.cos(angle) * dist, -CITY_HALF + 8, CITY_HALF - 8);
    const z = clamp(target.z + Math.sin(angle) * dist, -CITY_HALF + 8, CITY_HALF - 8);
    // move towards the player along whichever axis is closer to a road
    const snapped = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))
      ? snapToLane(x, z, "z")
      : snapToLane(x, z, "x");
    car.place(snapped.x, snapped.z, heading);

    this.scene.add(car.group);
    this.units.push(car);
    this.lights.push({ red, blue, redLight, blueLight });
    void heading;
  }

  /** Spawn the units a wanted level asks for, once. */
  private desiredUnits(): number {
    const wanted = this.level;
    if (wanted === 0) return 0;
    return Math.min(4, wanted + 1);
  }

  clear() {
    for (const u of this.units) {
      this.scene.remove(u.group);
      u.dispose();
    }
    this.units.length = 0;
    this.lights.length = 0;
  }

  addCrime(amount: number) {
    this.heat = THREE.MathUtils.clamp(this.heat + amount, 0, 5);
  }

  get level(): CrimeLevel {
    return Math.round(this.heat) as CrimeLevel;
  }

  update(dt: number, player: THREE.Vector3, playerInCar: boolean) {
    this.heat = Math.max(0, this.heat - dt * 0.06);

    const desired = this.desiredUnits();
    while (this.units.length < desired) {
      this.spawnCop(player, Math.random() * Math.PI * 2);
    }
    while (this.units.length > desired) {
      const u = this.units.pop()!;
      this.scene.remove(u.group);
      u.dispose();
      this.lights.pop();
    }

    const t = performance.now() * 0.004;
    this.units.forEach((car, i) => {
      // simple pursuit: aim at the player, steer toward the target heading
      const to = TMP.subVectors(player, car.position);
      to.y = 0;
      const dist = to.length();
      const desiredHeading = Math.atan2(-to.x, -to.z);
      let diff = desiredHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      const throttle = dist > 14 ? 1 : dist > 8 ? 0.4 : -0.2;
      const steer = THREE.MathUtils.clamp(diff * 1.6, -1, 1);
      car.update(dt, { throttle, steer, handbrake: false }, this.buildings);

      // avoid piling into each other
      for (const other of this.units) {
        if (other === car) continue;
        const d = car.position.distanceTo(other.position);
        if (d < 5.5 && d > 0.001) {
          const push = TMP2.subVectors(car.position, other.position).setY(0).normalize().multiplyScalar((5.5 - d) * 0.5);
          car.position.add(push);
        }
      }

      // push player's car away if we hit it (rough shove)
      if (dist < 3.2) {
        car.velocity.multiplyScalar(0.6);
      }

      const phase = Math.sin(t + i * 0.9);
      const l = this.lights[i];
      if (l) {
        const redOn = phase > 0;
        l.red.material.opacity = redOn ? 0.95 : 0.12;
        l.blue.material.opacity = redOn ? 0.12 : 0.95;
        l.redLight.intensity = redOn ? 22 : 0;
        l.blueLight.intensity = redOn ? 0 : 22;
      }
    });

    void playerInCar;
  }

  get inPursuit() {
    return this.units.length > 0;
  }
}

const TMP = new THREE.Vector3();
const TMP2 = new THREE.Vector3();

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Snap a point onto the closest road: `axis` tells which coordinate to pull
 * towards a road centre line, the other one stays free so the car sits *on* the road.
 */
function snapToLane(x: number, z: number, axis: "x" | "z") {
  const lanes: number[] = [];
  for (let i = 0; i <= CITY.grid; i++) {
    lanes.push(-CITY_HALF + CITY.road / 2 + i * CITY.block);
  }
  let best = lanes[0];
  const value = axis === "x" ? x : z;
  for (const l of lanes) {
    if (Math.abs(l - value) < Math.abs(best - value)) best = l;
  }
  return axis === "x"
    ? { x: best + CITY.road / 4, z }
    : { x, z: best + CITY.road / 4 };
}

let glow: THREE.Texture | null = null;
function makeGlow() {
  if (!glow) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.4)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    glow = new THREE.CanvasTexture(c);
  }
  return glow;
}
