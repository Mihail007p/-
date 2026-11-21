/**
 * Skeleton / animation sanity checks for the player model.
 * Catches the classic rigging bugs: knees bending the wrong way, limbs
 * detached from the body, feet below the ground, wrong overall height.
 */
import * as THREE from "three";

const dom = new (await import("jsdom")).JSDOM(`<!doctype html><body></body>`, { url: "https://example.com/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.performance = performance;


// jsdom has no 2D canvas: give it a no-op context so the procedural fabric and
// face textures can be generated (the geometry is what we test, not the pixels).
const ctxStub = () => ({
  canvas: {},
  fillStyle: "", strokeStyle: "", lineWidth: 1, lineCap: "", globalAlpha: 1, font: "",
  fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, closePath() {},
  moveTo() {}, lineTo() {}, arc() {}, ellipse() {}, quadraticCurveTo() {},
  bezierCurveTo() {}, fill() {}, stroke() {}, save() {}, restore() {},
  translate() {}, rotate() {}, scale() {}, drawImage() {},
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
  createPattern: () => null,
  getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  putImageData() {},
  measureText: () => ({ width: 0 }),
  fillText() {}, strokeText() {},
});
dom.window.HTMLCanvasElement.prototype.getContext = () => ctxStub();
globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;

const { Player } = await import("../.test-build/player.js");
const { CHARACTER_PALETTE } = await import("../.test-build/character/model.js");

let fails = 0;
const check = (name, ok, info = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? "  " + info : ""}`);
};

const p = new Player();
p.place(0, 0, 0);
p.group.updateMatrixWorld(true);

// ---------------------------------------------------------------- proportions
const box = new THREE.Box3().setFromObject(p.group);
const height = box.max.y - box.min.y;
check("height is human (1.65–1.90 m)", height > 1.65 && height < 1.9, `${height.toFixed(3)} m`);
check("feet are on the ground", Math.abs(box.min.y) < 0.02, `min y = ${box.min.y.toFixed(3)}`);
check("body is centred on x", Math.abs((box.max.x + box.min.x) / 2) < 0.02);

// shoulder width should be plausible (0.35–0.55 m)
const shoulderW = box.max.x - box.min.x;
check("shoulder/body width is plausible", shoulderW > 0.3 && shoulderW < 0.6, `${shoulderW.toFixed(3)} m`);

// ------------------------------------------------------------- hidden internals
const rig = p;
const bones = ["thighL", "thighR", "shinL", "shinR", "armL", "armR", "foreL", "foreR", "chest", "head"];
check("all rig bones exist", bones.every((b) => rig[b] && rig[b].isObject3D));

// hip pivot heights: a human hip is ~0.95 m up on a 1.78 m body
for (const b of ["thighL", "thighR"]) {
  const y = rig[b].position.y;
  check(`${b} hip height ~0.90–1.00 m`, y > 0.9 && y < 1.0, `${y.toFixed(2)} m`);
}
check("shoulder height ~1.35–1.42 m", rig.armL.position.y > 1.35 && rig.armL.position.y < 1.42, `${rig.armL.position.y.toFixed(2)} m`);
check("head sits above the shoulders", rig.head.position.y > rig.armL.position.y, `${rig.head.position.y.toFixed(2)} m`);

// ------------------------------------------------------------------ animation
const COLLIDERS = [];
const BLOCKERS = [];
const step = (n, dir, speed = 4) => {
  for (let i = 0; i < n; i++) p.update(1 / 60, dir, speed, COLLIDERS, BLOCKERS, 1000);
};

// walking forward: knees may only bend backwards (positive rotation.x here)
const forward = new THREE.Vector3(0, 0, -1);
let minKnee = 0;
for (let i = 0; i < 120; i++) {
  p.update(1 / 60, forward, 3.2, COLLIDERS, BLOCKERS, 1000);
  minKnee = Math.min(minKnee, p.shinL.rotation.x, p.shinR.rotation.x);
}
check("knees never bend forwards", minKnee >= -0.02, `min knee rotation = ${minKnee.toFixed(3)} rad`);

// the walk cycle must actually move the legs
p.update(1 / 60, new THREE.Vector3(), 0, COLLIDERS, BLOCKERS, 1000);
step(20, forward, 3.2);
const thighMoved = Math.abs(p.thighL.rotation.x) + Math.abs(p.thighR.rotation.x);
check("legs swing while walking", thighMoved > 0.15, `sum = ${thighMoved.toFixed(2)} rad`);

// running swings wider than walking
for (let i = 0; i < 41; i++) p.update(1 / 60, forward, 6.2, COLLIDERS, BLOCKERS, 1000);
let runSwing = 0;
for (let i = 0; i < 40; i++) {
  p.update(1 / 60, forward, 6.2, COLLIDERS, BLOCKERS, 1000);
  runSwing = Math.max(runSwing, Math.abs(p.thighL.rotation.x));
}
check("running stride is wider than walking", runSwing > 0.6, `max thigh = ${runSwing.toFixed(2)} rad`);

// arms must swing opposite the legs
let opposite = true;
for (let i = 0; i < 60; i++) {
  p.update(1 / 60, forward, 4, COLLIDERS, BLOCKERS, 1000);
  if (p.thighL.rotation.x * p.armL.rotation.x > 0.02) opposite = false;
}
check("left arm swings opposite the left leg", opposite);

// when standing still the pose relaxes towards neutral
step(180, new THREE.Vector3(), 0);
const relaxed =
  Math.abs(p.thighL.rotation.x) < 0.06 &&
  Math.abs(p.thighR.rotation.x) < 0.06 &&
  Math.abs(p.armL.rotation.x) < 0.12 &&
  Math.abs(p.model.rotation.x) < 0.05;
check("idle pose relaxes to neutral", relaxed,
  `thigh ${p.thighL.rotation.x.toFixed(3)}, arm ${p.armL.rotation.x.toFixed(3)}, lean ${p.model.rotation.x.toFixed(3)}`);

// the model never sinks into the ground while animating
let minY = Infinity;
for (let i = 0; i < 200; i++) {
  p.update(1 / 60, forward, 6.2, COLLIDERS, BLOCKERS, 1000);
  const b = new THREE.Box3().setFromObject(p.group);
  minY = Math.min(minY, b.min.y);
}
check("never sinks below the ground when running", minY > -0.06, `min y = ${minY.toFixed(3)}`);

// facing: moving towards +X must turn the character to face +X
p.place(0, 0, 0);
for (let i = 0; i < 60; i++) p.update(1 / 60, new THREE.Vector3(1, 0, 0), 4, COLLIDERS, BLOCKERS, 1000);
const facing = Math.atan2(-Math.sin(p.heading), -Math.cos(p.heading));
check("turns to face the movement direction", Math.abs(Math.abs(facing) - Math.PI / 2) < 0.2,
  `heading = ${(p.heading * 180 / Math.PI).toFixed(1)}°`);

// collision still works
p.place(0, 0, 0);
const wall = [{ x0: 2, x1: 4, z0: -4, z1: 4, height: 20 }];
for (let i = 0; i < 120; i++) p.update(1 / 60, new THREE.Vector3(1, 0, 0), 4, wall, BLOCKERS, 1000);
check("cannot walk through a wall", p.position.x < 2 - 0.3, `x = ${p.position.x.toFixed(2)}`);

console.log(fails ? `\n${fails} FAILED` : "\nall character tests passed");
process.exit(fails ? 1 : 0);
