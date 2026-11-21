import "./styles.css";
import * as THREE from "three";
import { createWorld, installWorld, updateSunShadow, WORLD_LIMITS } from "./world/world";
import { Player } from "./player";
import { Input } from "./input";
import { Hud } from "./ui/hud";
import { CameraRig } from "./camera";
import { Settings } from "./ui/settings";

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
// hide the touch widgets on desktop so they never block the mouse
document.body.classList.toggle("touch", mobile);

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
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.15, 700);

// -------------------------------------------------------------------- world
const world = createWorld();
installWorld(scene, world);

const player = new Player();
player.place(world.spawn.x, world.spawn.z, world.spawn.heading);
scene.add(player.group);

const input = new Input(canvas);
const hud = new Hud();

// --------------------------------------------------------------- camera rig
const rig = new CameraRig(camera, { mobile });
rig.resetBehind(world.spawn.heading);
rig.snap(player.focus());
camera.fov = mobile ? 70 : 58;
camera.updateProjectionMatrix();

// ------------------------------------------------------------------- resize
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.fov = (mobile ? 70 : 58) + (w / h < 0.8 ? 6 : 0);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener("resize", resize);
resize();

// ---------------------------------------------------------------- settings
const settings = new Settings();
settings.onChange = (s) => rig.setSettings(s);
rig.setSettings(settings.current);
document.getElementById("settings-btn")?.addEventListener("click", () => settings.toggle());

// --------------------------------------------------------------------- loop
const clock = new THREE.Clock();
let running = false;
const wish = new THREE.Vector3();

function frame() {
  if (!running) return;
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);

  // movement relative to where the camera looks
  const axis = input.moveAxis();
  const forward = new THREE.Vector3(-Math.sin(rig.yaw), 0, -Math.cos(rig.yaw));
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  wish.set(0, 0, 0).addScaledVector(forward, axis.y).addScaledVector(right, axis.x);
  const wantsMove = wish.lengthSq() > 0.001;
  if (wantsMove) wish.normalize();

  const speed = input.sprint ? 6.2 : 3.4;
  player.update(
    dt,
    wish,
    wantsMove ? speed : 0,
    world.colliders,
    world.blockers,
    WORLD_LIMITS.playable
  );

  rig.update(
    dt,
    player.focus(),
    { x: input.lookX, y: input.lookY },
    input.zoomDelta,
    player.heading,
    wantsMove,
    world.colliders,
    input.recenterRequested
  );
  input.recenterRequested = false;

  updateSunShadow(world, player.position);
  renderer.render(scene, camera);
  input.endFrame();
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
  // C or Home: put the camera back behind the character
  if (e.code === "KeyC" || e.code === "Home") input.recenterRequested = true;
});

loading.classList.add("done");

// expose for debugging
(window as unknown as { game: unknown }).game = { scene, renderer, world, player, camera, rig };
