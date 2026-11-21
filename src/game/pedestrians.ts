import * as THREE from "three";
import { Character } from "./character";
import { CITY, CITY_HALF, type BuildingBox } from "./city";

const JACKETS = [0x1e2b3c, 0x3b1f2a, 0x2a3320, 0x2b2b33, 0x442d18, 0x1b3340, 0x50303f];
const PANTS = [0x14181f, 0x1b2430, 0x22201c, 0x101215, 0x2c3440];
const SKINS = [0x8d6249, 0x6b4632, 0xc9997a, 0x9d7358, 0x513424];

/**
 * Pedestrians wander the sidewalks. They react (and run) when a car is near.
 */
export class Pedestrians {
  people: Character[] = [];
  private targets: THREE.Vector3[] = [];

  constructor(
    private scene: THREE.Scene,
    private buildings: BuildingBox[] = [],
    count = 26
  ) {
    for (let i = 0; i < count; i++) {
      const ch = new Character(
        JACKETS[(Math.random() * JACKETS.length) | 0],
        PANTS[(Math.random() * PANTS.length) | 0],
        SKINS[(Math.random() * SKINS.length) | 0],
        0.95 + Math.random() * 0.12
      );
      const p = this.randomSidewalkPoint();
      ch.place(p.x, p.z, Math.random() * Math.PI * 2);
      this.scene.add(ch.group);
      this.people.push(ch);
      this.targets.push(this.randomSidewalkPoint());
    }
  }

  private randomSidewalkPoint() {
    // walk on the sidewalk ring inside a random block
    const b = CITY.block;
    const bx = (Math.random() * CITY.grid) | 0;
    const bz = (Math.random() * CITY.grid) | 0;
    const x0 = -CITY_HALF + CITY.road + bx * b + 2;
    const z0 = -CITY_HALF + CITY.road + bz * b + 2;
    const inner = b - CITY.road;
    const side = (Math.random() * 4) | 0;
    switch (side) {
      case 0: return new THREE.Vector3(x0 + Math.random() * inner, 0, z0);
      case 1: return new THREE.Vector3(x0 + Math.random() * inner, 0, z0 + inner);
      case 2: return new THREE.Vector3(x0, 0, z0 + Math.random() * inner);
      default: return new THREE.Vector3(x0 + inner, 0, z0 + Math.random() * inner);
    }
  }

  update(dt: number, playerCarPos: THREE.Vector3 | null, carSpeed = 0) {
    this.people.forEach((ch, i) => {
      const target = this.targets[i];
      const to = TMP.subVectors(target, ch.position);
      to.y = 0;
      const dist = to.length();

      let fleeing = false;
      if (playerCarPos) {
        const dCar = ch.position.distanceTo(playerCarPos);
        // only panic when the car is actually moving towards them
        if (dCar < 12 && (carSpeed > 0.5 || dCar < 4)) {
          fleeing = true;
          // run away from the car
          to.subVectors(ch.position, playerCarPos).setY(0).normalize();
        }
      }

      if (!fleeing && dist < 1.5) {
        this.targets[i] = this.randomSidewalkPoint();
        return;
      }

      to.normalize();
      const speed = fleeing ? 5.4 : 1.35;
      const move = to.multiplyScalar(speed);
      const heading = Math.atan2(-to.x, -to.z);
      ch.update(dt, move, heading, fleeing, this.buildings);
    });
  }
}

const TMP = new THREE.Vector3();
