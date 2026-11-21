import "./styles.css";
import * as THREE from "three";
import { createWorld, installWorld, updateSunShadow, WORLD_LIMITS } from "./world/world";
import { Player } from "./player";
import { Input } from "./input";
import { Hud } from "./ui/hud";

/** Detect a mobile GPU budget and scale quality down accordingly. */
function isMobile() {
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    window.matchMedia("(pointer: coarse)").matches
  );
}

const canvas = document.getElementById("scene") as HTMLCanvasElement;
const loading = document.getElementById("loading")!;
const overlay = document.getElementById("overlay")!;
const startBtn = document.getElementById("start") as HTMLButtonElement;

const mobile = isMobile();

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = mobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  58,
  window.innerWidth / window.innerHeight,
  0.15,
  700
);

// -------------------------------------------------------------------- world
const world = createWorld();
installWorld(scene, world);

const player = new Player();
player.place(world.spawn.x, world.spawn.z, world.spawn.heading);
scene.add(player.group);

const input = new Input(canvas);
const hud = new Hud();

// --------------------------------------------------------------- camera rig
let camYaw = world.spawn.heading + Math.PI; // look down the avenue
let camPitch = 0.28;
let camDist = mobile ? 7.5 : 6.8;
const camTarget = new THREE.Vector3();
const camDesired = new THREE.Vector3();
camera.position.set(world.spawn.x, 8, world.spawn.z + 10);

function updateCamera(dt: number) {
  // look input
  const sens = 0.0042;
  camYaw -= input.lookX * sens;
  camPitch = THREE.MathUtils.clamp(camPitch + input.lookY * sens * 0.8, -0.15, 1.05);
  camDist = THREE.MathUtils.clamp(camDist + input.zoomDelta, 3.2, 13);

  player.focus(camTarget);

  const cosP = Math.cos(camPitch);
  camDesired.set(
    camTarget.x + Math.sin(camYaw) * camDist * cosP,
    camTarget.y + Math.sin(camPitch) * camDist + 0.6,
    camTarget.z + Math.cos(camYaw) * camDist * cosP
  );

  pullCameraOutOfWalls(camTarget, camDesired);

  const lerp = 1 - Math.pow(0.001, dt);
  camera.position.lerp(camDesired, lerp);
  camera.lookAt(camTarget);
}

/** Keeps the camera from ending up inside a building. */
function pullCameraOutOfWalls(target: THREE.Vector3, out: THREE.Vector3) {
  const dir = out.clone().sub(target);
  const dist = dir.length();
  if (dist < 0.01) return;
  dir.divideScalar(dist);

  for (let d = 0.5; d <= dist; d += 0.5) {
    const x = target.x + dir.x * d;
    const y = target.y + dir.y * d;
    const z = target.z + dir.z * d;
    let hit = false;
    for (const c of world.colliders) {
      if (x > c.x0 - 0.25 && x < c.x1 + 0.25 && z > c.z0 - 0.25 && z < c.z1 + 0.25 && y < c.height) {
        hit = true;
        break;
      }
    }
    if (hit) {
      out.copy(target).addScaledVector(dir, Math.max(1.1, d - 0.6));
      return;
    }
  }
}

// ------------------------------------------------------------------- resize
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  // keep a wider view on tall phone screens
  camera.fov = w / h < 0.8 ? 74 : 58;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener("resize", resize);
resize();

// --------------------------------------------------------------------- loop
const clock = new THREE.Clock();
let running = false;
const wish = new THREE.Vector3();

function frame() {
  if (!running) return;
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);

  // movement relative to the camera
  const axis = input.moveAxis();
  const forward = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  wish.set(0, 0, 0).addScaledVector(forward, axis.y).addScaledVector(right, axis.x);
  if (wish.lengthSq() > 0) wish.normalize();

  const sprint = input.sprint || (mobile && Math.abs(input.stick.x) + Math.abs(input.stick.y) > 0.92);
  const speed = sprint ? 6.2 : 3.4;

  player.update(
    dt,
    wish,
    wish.lengthSq() > 0 ? speed : 0,
    world.colliders,
    world.blockers,
    WORLD_LIMITS.playable
  );

  updateCamera(dt);
  updateSunShadow(world, player.position);
  renderer.render(scene, camera);
}

function start() {
  overlay.classList.add("fade");
  setTimeout(() => overlay.classList.add("hidden"), 450);
  running = true;
  clock.start();
  hud.show();
  frame();
}

startBtn.addEventListener("click", start);
window.addEventListener("keydown", (e) => {
  if (e.code === "Enter" && !overlay.classList.contains("hidden")) start();
});

// show the FPS / draw-call readout on desktop for tuning
if (!mobile) {
  const stats = document.getElementById("stats")!;
  stats.classList.remove("hidden");
  let acc = 0;
  let frames = 0;
  setInterval(() => {
    if (!running) return;
    acc = frames > 0 ? 1000 / (acc / frames) : 0;
    void acc;
    frames = 0;
  }, 1000);
  const tick = () => {
    acc += performance.now();
    frames++;
    requestAnimationFrame(tick);
  };
  tick();
}

loading.classList.add("done");

// expose for debugging
(window as unknown as { game: unknown }).game = { scene, renderer, world, player, camera };
