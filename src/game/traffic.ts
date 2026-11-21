import * as THREE from "three";
import { Car, CAR_COLORS } from "./vehicle";
import { CITY, CITY_HALF } from "./city";

type Node = { x: number; z: number };

/** Lane offset from the road centre line. */
const LANE = CITY.road / 4;

/**
 * Ambient traffic: cars drive lane-to-lane along the grid, loop forever.
 * Cheap kinematic movement (no full physics) keeps it reliable.
 */
export class Traffic {
  cars: Car[] = [];
  private routes: { from: Node; to: Node; t: number; speed: number }[] = [];
  private smooth = new Map<Car, number>();

  constructor(private scene: THREE.Scene, count = 14) {
    for (let i = 0; i < count; i++) {
      const taxi = Math.random() < 0.22;
      const car = new Car(taxi ? 0xe0b53c : CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0], { taxi });
      const route = this.makeRoute();
      this.routes.push(route);
      car.place(route.from.x, route.from.z, headingBetween(route.from, route.to));
      this.scene.add(car.group);
      this.cars.push(car);
    }
  }

  /** A random straight run along one road, in the correct lane for its direction. */
  private makeRoute(): { from: Node; to: Node; t: number; speed: number } {
    const axis = Math.random() < 0.5 ? "x" : "z";
    const laneCenters: number[] = [];
    for (let i = 0; i <= CITY.grid; i++) {
      laneCenters.push(-CITY_HALF + CITY.road / 2 + i * CITY.block);
    }
    const lane = laneCenters[(Math.random() * laneCenters.length) | 0];
    const forward = Math.random() < 0.5;
    const start = -CITY_HALF + LANE;
    const end = CITY_HALF - LANE;
    const offset = forward ? -LANE : LANE;
    const speed = 8 + Math.random() * 7;

    if (axis === "x") {
      return {
        from: { x: start, z: lane + offset },
        to: { x: end, z: lane + offset },
        t: Math.random(),
        speed,
      };
    }
    return {
      from: { x: lane + offset, z: start },
      to: { x: lane + offset, z: end },
      t: Math.random(),
      speed,
    };
  }

  update(dt: number, playerPos: THREE.Vector3) {
    this.cars.forEach((car, i) => {
      const r = this.routes[i];

      const segLen = Math.max(1, Math.hypot(r.to.x - r.from.x, r.to.z - r.from.z));
      const targetSpeed = r.speed * (car.position.distanceTo(playerPos) < 9 ? 0.4 : 1);
      const speed = THREE.MathUtils.lerp(this.smooth.get(car) ?? r.speed, targetSpeed, Math.min(1, dt * 1.4));
      this.smooth.set(car, speed);

      r.t += (speed * dt) / segLen;

      if (r.t >= 1) {
        // Reached the end of the lane. Only recycle the car once it is far from
        // the player (so nobody sees it teleport); it re-enters a random lane.
        if (car.position.distanceTo(playerPos) > 55) {
          const fresh = this.makeRoute();
          r.from = fresh.from;
          r.to = fresh.to;
          r.speed = fresh.speed;
          r.t = Math.random() * 0.25;
        } else {
          // wait at the edge of the map until the player moves away
          r.t = 1;
        }
      }

      const cx = THREE.MathUtils.lerp(r.from.x, r.to.x, r.t);
      const cz = THREE.MathUtils.lerp(r.from.z, r.to.z, r.t);
      car.group.position.x = cx;
      car.group.position.z = cz;

      let diff = headingBetween(r.from, r.to) - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += diff * Math.min(1, dt * 3);
      car.group.rotation.y = car.heading;
      car.speedKmh = speed * 3.6;
      car.wheels.forEach((w) => (w.rotation.x += (speed / 0.36) * dt));
    });
  }

  /** Nearest ambient car to a point (for hijacking). */
  nearest(pos: THREE.Vector3, maxDist = 4.5) {
    let best: { car: Car; d: number } | null = null;
    for (const car of this.cars) {
      const d = car.position.distanceTo(pos);
      if (d < maxDist && (!best || d < best.d)) best = { car, d };
    }
    return best?.car ?? null;
  }

  /** Put an abandoned car back on the road as ambient traffic (no teleporting). */
  add(car: Car) {
    // drive from where it was left towards the far end of the current road
    const fx = -Math.sin(car.heading);
    const fz = -Math.cos(car.heading);
    const alongX = Math.abs(fx) > Math.abs(fz);
    const from = { x: car.position.x, z: car.position.z };
    const to = alongX
      ? { x: fx > 0 ? CITY_HALF - LANE : -CITY_HALF + LANE, z: car.position.z }
      : { x: car.position.x, z: fz > 0 ? CITY_HALF - LANE : -CITY_HALF + LANE };

    this.routes.push({ from, to, t: 0, speed: 9 });
    this.cars.push(car);
    this.scene.add(car.group);
  }

  remove(car: Car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) {
      this.cars.splice(i, 1);
      this.routes.splice(i, 1);
      this.scene.remove(car.group);
      this.smooth.delete(car);
    }
  }
}

function headingBetween(a: Node, b: Node) {
  return Math.atan2(-(b.x - a.x), -(b.z - a.z));
}
