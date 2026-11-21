import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

import { buildCity, CITY, CITY_HALF, makeGlowSprite, type CityData } from "./city";
import { createSkyTexture } from "./textures";
import { Car, CAR_COLORS } from "./vehicle";
import { Character } from "./character";
import { Input } from "./input";
import { Rain, createMist } from "./rain";
import { GameAudio } from "./audio";
import { Police } from "./police";
import { Traffic } from "./traffic";
import { Pedestrians } from "./pedestrians";
import { Effects } from "./effects";
import { Hud } from "../ui/hud";

type Mode = "foot" | "car";

/** Centre of the middle ring road (where the two main avenues cross). */
const CITY_LANE = -CITY_HALF + CITY.road / 2 + CITY.block * 2;
const CITY_LANE_INNER = CITY_LANE + CITY.road / 4;

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  bloom: UnrealBloomPass;

  city!: CityData;
  player!: Character;
  playerCar: Car;
  input: Input;
  audio = new GameAudio();
  rain: Rain;
  mist: THREE.Group;
  police!: Police;
  traffic!: Traffic;
  ped!: Pedestrians;
  effects!: Effects;
  hud: Hud;

  mode: Mode = "foot";
  activeCar: Car | null = null;
  cameraYaw = 0;
  /** lagging copy of the car heading, so the camera eases instead of snapping */
  private chaseYaw = 0;
  cameraPitch = 0.18;
  cameraDistance = 6.4;

  clock = new THREE.Clock();
  running = false;
  private accum = 0;
  private hitCooldown = 0;
  private pedHitCooldown = 0;
  private lastSpeed = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.25, 900);
    this.camera.position.set(0, 6, 12);

    // ---------- sky & fog ----------
    const sky = createSkyTexture();
    this.scene.background = sky;
    this.scene.environment = sky;
    this.scene.environmentIntensity = 0.7;
    this.scene.fog = new THREE.FogExp2(0x0a1120, 0.0085);

    // ---------- lights ----------
    const hemi = new THREE.HemisphereLight(0x2a4a7a, 0x0a0d12, 0.55);
    this.scene.add(hemi);

    const moon = new THREE.DirectionalLight(0x9dc4ff, 0.55);
    moon.position.set(-80, 140, 60);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const d = 140;
    moon.shadow.camera.left = -d;
    moon.shadow.camera.right = d;
    moon.shadow.camera.top = d;
    moon.shadow.camera.bottom = -d;
    moon.shadow.camera.far = 400;
    moon.shadow.bias = -0.0012;
    this.scene.add(moon);
    this.scene.add(moon.target);

    // ---------- HUD ----------
    this.hud = new Hud();

    // ---------- post ----------
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.72,
      0.85,
      0.58
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // ---------- world ----------
    this.city = buildCity();
    this.scene.add(this.city.group);

    // street lamp point lights (a small budget for perf)
    this.addCityLights();

    this.rain = new Rain(6000);
    this.scene.add(this.rain.points);

    this.mist = createMist(110);
    this.scene.add(this.mist);

    // ---------- player ----------
    // stand on the central crossroad, where the two main roads meet
    const spawn = { x: CITY_LANE, z: CITY_LANE_INNER };
    this.player = new Character(0x243447, 0x11151b, 0x9a6d52, 1);
    this.player.place(spawn.x, spawn.z, Math.PI);
    this.scene.add(this.player.group);
    this.addPlayerRimLight();

    // player's car parked on the near lane, facing down the road
    this.playerCar = new Car(CAR_COLORS[0], { player: true });
    this.playerCar.place(spawn.x + CITY.road / 4, spawn.z + 9, Math.PI);
    this.scene.add(this.playerCar.group);

    this.traffic = new Traffic(this.scene, 16);
    this.ped = new Pedestrians(this.scene, this.city.buildings, 28);
    this.police = new Police(this.scene, this.city.buildings);
    this.effects = new Effects(this.scene, this.city.buildings);

    this.input = new Input(canvas);

    window.addEventListener("resize", () => this.resize());
    this.resize();

    // animate the loading screen away
    requestAnimationFrame(() => {
      document.getElementById("loading")?.classList.add("done");
    });
  }

  private cityLights: THREE.PointLight[] = [];

  private addCityLights() {
    // Pick a handful of lamp positions and give them real point lights.
    const spots = [...this.city.streetLamps].sort(() => Math.random() - 0.5).slice(0, 14);
    for (const s of spots) {
      const p = new THREE.PointLight(s.color, s.intensity * 12, 34, 2);
      p.position.set(s.x, 6.6, s.z);
      this.scene.add(p);
      this.cityLights.push(p);
    }
  }

  private addPlayerRimLight() {
    const rim = new THREE.PointLight(0x6fa8ff, 3.5, 9, 2);
    rim.position.set(0, 2.2, 0);
    this.player.group.add(rim);
    const glow = makeGlowSprite(0x5b8fd6, 2.2, 0.16);
    glow.position.y = 1.1;
    this.player.group.add(glow);
  }

  start() {
    this.audio.init();
    this.running = true;
    this.clock.start();
    this.hud.show();
    this.hud.setCash(250);
    this.hud.toast("Добро пожаловать в Neon District");
    this.canvas.requestPointerLock?.();
    this.loop();
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);
  }

  private loop = () => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const raw = Math.min(this.clock.getDelta(), 0.05);
    this.update(raw);
    this.composer.render();
  };

  private update(dt: number) {
    this.accum += dt;

    this.handleInput(dt);
    this.updateCamera(dt);

    const playerPos = this.player.position;

    // cars
    if (this.mode === "car" && this.activeCar) {
      this.activeCar.update(
        dt,
        {
          throttle: this.input.throttle,
          steer: this.input.steer,
          handbrake: this.input.handbrake,
        },
        this.city.buildings
      );

      // collision impact sound + a little heat if it was a hard one
      const speedDrop = Math.abs(this.lastSpeed - this.activeCar.velocity.length());
      if (speedDrop > 3.5 && this.hitCooldown <= 0) {
        this.audio.thump(Math.min(2, speedDrop / 8));
        this.hitCooldown = 0.35;
        if (speedDrop > 7) {
          this.hud.shake(0.6);
          this.addHeat(0.55);
        }
      }
      this.lastSpeed = this.activeCar.velocity.length();

      // hitting pedestrians or ambient traffic raises heat
      for (const car of this.traffic.cars) {
        if (car.position.distanceTo(this.activeCar.position) < 2.6 && this.activeCar.speedKmh > 18) {
          this.addHeat(0.35 * dt * 6);
          break;
        }
      }
      if (this.pedHitCooldown <= 0) {
        for (const p of this.ped.people) {
          if (p.position.distanceTo(this.activeCar.position) < 1.5 && this.activeCar.speedKmh > 12) {
            this.addHeat(1.1);
            this.audio.thump(1.4);
            this.hud.shake(0.5);
            this.hud.toast("Свидетель вызвал копов");
            this.pedHitCooldown = 3;
            break;
          }
        }
      }
      this.pedHitCooldown -= dt;

      this.hud.setSpeed(this.activeCar.speedKmh, this.activeCar.gear);
      this.hud.setInCar(true);
    } else {
      this.audio.updateEngine(this.player.velocity.length(), 0, false);
      this.audio.updateTyres(0);
      this.hud.setInCar(false);
      this.hud.setSpeed(0, 1);
    }

    if (this.mode === "car" && this.activeCar) {
      this.audio.updateEngine(this.activeCar.velocity.length(), this.input.throttle, true);
      this.audio.updateTyres(this.activeCar.slip * 0.25);
    }

    this.traffic.update(dt, playerPos);
    this.ped.update(
      dt,
      this.mode === "car" && this.activeCar ? this.activeCar.position : null,
      this.mode === "car" && this.activeCar ? this.activeCar.speedKmh : 0
    );
    this.police.update(dt, this.mode === "car" && this.activeCar ? this.activeCar.position : playerPos, this.mode === "car");
    this.hud.setWanted(this.police.level);

    this.hitCooldown -= dt;

    this.effects.update(
      dt,
      this.mode === "car" && this.activeCar ? this.activeCar.position : null,
      this.mode === "car" && this.activeCar ? this.activeCar.speedKmh : 0
    );
    this.rain.update(dt, this.camera.position);
    this.updateMist(dt);
    this.updateBlinking();

    this.hud.drawMinimap(this.player.position, this.cameraYaw, this.city.buildings, this.mode === "car" ? this.activeCar?.position ?? null : null);
    this.hud.tick(dt);

    this.input.endFrame();
  }

  private updateMist(dt: number) {
    for (const m of this.mist.children) {
      const drift = m.userData.drift as THREE.Vector2;
      m.position.x += drift.x * dt * 2;
      m.position.z += drift.y * dt * 2;
      m.userData.bob = (m.userData.bob as number) + dt * 0.4;
      m.position.y = 1.4 + Math.sin(m.userData.bob) * 0.45;
      if (m.position.x - this.camera.position.x > 70) m.position.x -= 140;
      if (m.position.x - this.camera.position.x < -70) m.position.x += 140;
      if (m.position.z - this.camera.position.z > 70) m.position.z -= 140;
      if (m.position.z - this.camera.position.z < -70) m.position.z += 140;
    }
  }

  private updateBlinking() {
    const t = performance.now() * 0.001;
    const on = Math.sin(t * 3) > 0;
    for (const b of this.city.blinkers) b.visible = on;
    // neon flicker
    for (const sign of this.city.neonSigns) {
      if (sign.userData.flicker) {
        const f = 0.72 + Math.random() * 0.28;
        (sign.material as THREE.MeshBasicMaterial).opacity = Math.random() < 0.02 ? 0.25 : f;
      }
    }
  }

  private handleInput(dt: number) {
    const { input } = this;

    // camera look (mouse)
    const m = input.consumeMouse();
    if (input.locked || m.x !== 0 || m.y !== 0) {
      this.cameraYaw -= m.x * 0.0026;
      this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch + m.y * 0.002, -0.25, 0.85);
    }

    if (this.mode === "foot") {
      this.updateOnFoot(dt);
    } else {
      // exit vehicle
      if (input.wasPressed("KeyF")) this.exitCar();
      if (input.touchAction) {
        input.touchAction = false;
        this.exitCar();
      }
      if (input.wasPressed("KeyR")) {
        if (this.activeCar) {
          this.activeCar.velocity.set(0, 0, 0);
          this.activeCar.group.position.y = 0;
          this.hud.toast("Машина в порядке");
        }
      }
    }

    // audio toggle
    if (input.wasPressed("KeyM")) {
      this.audio.setEnabled(!this.audio.enabled);
      this.hud.toast(this.audio.enabled ? "Звук включён" : "Звук выключен");
    }

    // hijack prompt
    if (this.mode === "foot") {
      const near = this.findNearestCar();
      if (near) {
        this.hud.setPrompt('<kbd>F</kbd> угнать машину');
        if (input.wasPressed("KeyF") || input.touchAction) {
          input.touchAction = false;
          this.enterCar(near);
        }
      } else {
        this.hud.setPrompt(null);
      }
    } else {
      this.hud.setPrompt(null);
    }
  }

  private findNearestCar(): Car | null {
    let best: { car: Car; d: number } | null = null;
    const candidates: Car[] = [this.playerCar, ...this.traffic.cars];
    for (const car of candidates) {
      const d = car.position.distanceTo(this.player.position);
      if (d < 5 && (!best || d < best.d)) best = { car, d };
    }
    return best?.car ?? null;
  }

  private updateOnFoot(dt: number) {
    const { input } = this;
    const move = new THREE.Vector3();

    const fwd = new THREE.Vector3(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);

    const throttle = input.throttle;
    const steer = input.steer;

    move.addScaledVector(fwd, throttle);
    move.addScaledVector(right, -steer);

    const running = input.sprint && move.lengthSq() > 0;
    const speed = running ? 6.8 : 3.1;

    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);

    const heading = move.lengthSq() > 0.01 ? Math.atan2(-move.x, -move.z) : this.player.heading;
    this.player.update(dt, move, heading, running, this.city.buildings);

    // keep the player inside the city limits
    const limit = CITY_HALF - 4;
    this.player.position.x = THREE.MathUtils.clamp(this.player.position.x, -limit, limit);
    this.player.position.z = THREE.MathUtils.clamp(this.player.position.z, -limit, limit);
  }

  /** Cars the player stole from ambient traffic; given back when abandoned. */
  private stolenCars: Car[] = [];

  enterCar(car: Car) {
    this.mode = "car";
    this.activeCar = car;
    this.player.group.visible = false;

    // if it's a traffic car, take it out of ambient circulation
    const wasTraffic = this.traffic.cars.includes(car);
    if (wasTraffic) {
      this.traffic.remove(car);
      this.stolenCars.push(car);
      this.hud.setWanted(Math.max(this.police.level, 1));
      this.addHeat(1.1);
      this.hud.toast("Угон! Свидетели уже звонят");
    }

    if (car === this.playerCar) {
      // enable headlight beams the first time the player drives it
      if (car.headlights.length === 0) {
        for (const sx of [-1, 1]) {
          const spot = new THREE.SpotLight(0xfff0cc, 90, 55, 0.6, 0.65, 1.3);
          spot.position.set(sx * (car.spec.width / 2 - 0.3), 0.8, -car.spec.length / 2);
          spot.target.position.set(sx * 1.5, -1.6, -28);
          car.group.add(spot);
          car.group.add(spot.target);
          car.headlights.push(spot);
        }
      }
    }

    this.cameraYaw = car.heading + Math.PI;
    this.chaseYaw = car.heading;
    this.audio.blip(520, 0.09);
    if (!wasTraffic) this.hud.toast("Машина заведена");
  }

  exitCar() {
    if (!this.activeCar) return;
    const car = this.activeCar;
    this.mode = "foot";
    this.activeCar = null;

    const offset = new THREE.Vector3(Math.cos(car.heading) * 2.4, 0, -Math.sin(car.heading) * 2.4);
    const p = car.position.clone().add(offset);
    this.player.place(p.x, p.z, car.heading);

    // a stolen car goes back into ambient traffic after being abandoned
    if (this.stolenCars.includes(car)) {
      this.stolenCars = this.stolenCars.filter((c) => c !== car);
      this.traffic.add(car);
    }
    this.player.group.visible = true;
    this.hud.setInCar(false);
    this.hud.setSpeed(0, 1);
    this.audio.blip(380, 0.08);
  }

  private updateCamera(dt: number) {
    if (this.mode === "car" && this.activeCar) {
      const car = this.activeCar;
      const speed = car.velocity.length();
      const targetDist = 7.2 + Math.min(3.2, speed * 0.13);
      this.cameraDistance = THREE.MathUtils.lerp(this.cameraDistance, targetDist, Math.min(1, dt * 2.6));

      // blend the camera behind the car using a lagging heading, so the car
      // stays visible during turns instead of being pinned under the camera
      let hd = car.heading - this.chaseYaw;
      while (hd > Math.PI) hd -= Math.PI * 2;
      while (hd < -Math.PI) hd += Math.PI * 2;
      this.chaseYaw += hd * Math.min(1, dt * 2.2);

      const behind = this.chaseYaw + Math.PI;
      let diff = behind - this.cameraYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.cameraYaw += diff * Math.min(1, dt * 2.4);

      const target = car.position.clone().add(new THREE.Vector3(0, 1.25, 0));
      const desired = new THREE.Vector3(
        target.x + Math.sin(this.cameraYaw) * this.cameraDistance * Math.cos(this.cameraPitch),
        target.y + 1.5 + Math.sin(this.cameraPitch) * this.cameraDistance,
        target.z + Math.cos(this.cameraYaw) * this.cameraDistance * Math.cos(this.cameraPitch)
      );

      this.resolveCameraObstacles(target, desired);

      this.camera.position.lerp(desired, Math.min(1, dt * 7));
      this.camera.lookAt(target);
      const fov = 62 + Math.min(16, speed * 0.65);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, fov, Math.min(1, dt * 3));
      this.camera.updateProjectionMatrix();
    } else {
      const target = this.player.position.clone().add(new THREE.Vector3(0, 1.45, 0));
      const dist = 5.4;
      const desired = new THREE.Vector3(
        target.x + Math.sin(this.cameraYaw) * dist * Math.cos(this.cameraPitch),
        target.y + 0.9 + Math.sin(this.cameraPitch) * dist,
        target.z + Math.cos(this.cameraYaw) * dist * Math.cos(this.cameraPitch)
      );

      this.resolveCameraObstacles(target, desired);

      this.camera.position.lerp(desired, Math.min(1, dt * 9));
      this.camera.lookAt(target);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 62, Math.min(1, dt * 3));
      this.camera.updateProjectionMatrix();
    }
  }

  /** Pull the camera towards its target when a building is in the way. */
  private resolveCameraObstacles(target: THREE.Vector3, out: THREE.Vector3) {
    const dir = new THREE.Vector3().subVectors(out, target);
    const dist = dir.length();
    if (dist < 0.001) return;
    dir.divideScalar(dist);

    for (let d = 0.6; d <= dist; d += 0.6) {
      const x = target.x + dir.x * d;
      const y = target.y + dir.y * d;
      const z = target.z + dir.z * d;
      let blocked = false;
      for (const b of this.city.buildings) {
        if (
          x > b.minX - 0.4 && x < b.maxX + 0.4 &&
          z > b.minZ - 0.4 && z < b.maxZ + 0.4 &&
          y < b.height + 0.4
        ) {
          blocked = true;
          break;
        }
      }
      if (blocked) {
        out.copy(target).addScaledVector(dir, Math.max(1.2, d - 0.5));
        return;
      }
    }
  }

  /** Add heat to the wanted level (called when the player does something loud). */
  addHeat(n: number) {
    if (this.police.level === 0) {
      this.hud.toast("Полиция обратила внимание");
    }
    this.police.addCrime(n);
    this.hud.setWanted(this.police.level);
  }
}

export { CITY };
