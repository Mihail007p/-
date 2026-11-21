import { JSDOM } from "jsdom";
import * as THREE from "three";
const dom = new JSDOM(`<!doctype html><html><body><canvas id="scene"></canvas><div id="stick"><div id="stick-knob"></div></div><div id="look-zone"></div><button id="run-btn"></button></body></html>`);
globalThis.window = dom.window; globalThis.document = dom.window.document;
const D = (r) => (r * 180) / Math.PI;
const { Input } = await import("../.test-build/input.js");
const { CameraRig } = await import("../.test-build/camera.js");

const input = new Input(document.getElementById("scene"));
const cam = new THREE.PerspectiveCamera(60, 1.5, 0.1, 500);
let rig = new CameraRig(cam, { mobile: false });
const focus = new THREE.Vector3(0, 1.45, 0);
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? "  " + info : ""}`); };

function fresh() {
  // the app creates Input once and CameraRig once; mirror that: only reset the rig
  rig.resetBehind(0);
  rig.yaw = rig.targetYaw;
  rig.pitch = rig.targetPitch;
  input.lookX = 0; input.lookY = 0;
}
function step(dt = 1/60, heading = 0, moving = false) {
  rig.update(dt, focus, { x: input.lookX, y: input.lookY }, 0, heading, moving, [], false);
  input.endFrame();
}
function swipe(seconds, pxPerSec, fps = 60) {
  input.pointerLocked = true;
  const frames = Math.round(seconds * fps);
  for (let i = 0; i < frames; i++) {
    const ev = new dom.window.MouseEvent("mousemove", { clientX: 0, clientY: 0, bubbles: true });
    Object.defineProperty(ev, "movementX", { value: pxPerSec / fps });
    Object.defineProperty(ev, "movementY", { value: 0 });
    window.dispatchEvent(ev);
    step(1 / fps);
  }
}

// A. long steady turn must stay proportional (no runaway, no stall)
fresh();
const y0 = rig.yaw; swipe(2, 400);
const turned = D(rig.yaw - y0);
// 2s of 400px/s at the base sensitivity should give ~160°, i.e. 1:1 with the hand
check("2s turn @400px/s is 1:1 with the hand", Math.abs(Math.abs(turned) - 160) < 25, `turned ${turned.toFixed(1)}°`);

// B. fast flick is smooth but controlled
fresh();
const flickStart = rig.yaw;
swipe(0.08, 3000);
const flickTurned = D(rig.yaw - flickStart);
check("80ms flick is tamed to <30°", Math.abs(flickTurned) < 30, `turned ${flickTurned.toFixed(1)}°`);

// C. no creep while the finger rests still
fresh();
const before = rig.yaw;
for (let i = 0; i < 180; i++) step();  // 3 seconds, zero input
check("no drift with zero input (3s)", D(rig.yaw - before) === 0, `drift ${D(rig.yaw - before).toFixed(4)}°`);

// D. auto-recentre only while walking, and it stops at the target
fresh();
rig.targetYaw = 0.6; rig.yaw = 0.6;
for (let i = 0; i < 600; i++) step(1/60, 0, true);  // 10s of walking
check("auto-recentre reaches behind the player", Math.abs(D(rig.yaw - Math.PI)) < 8, `yaw ${D(rig.yaw).toFixed(1)}° (target 180°)`);

// E. auto-recentre does NOT run when standing still
fresh();
rig.targetYaw = 0.6; rig.yaw = 0.6;
for (let i = 0; i < 300; i++) step(1/60, 0, false);
check("no auto-recentre while standing", Math.abs(D(rig.yaw - 0.6)) < 0.01, `yaw ${D(rig.yaw).toFixed(2)}°`);

// F. after the user looks, auto-recentre waits ~2.4s
fresh();
swipe(0.3, 300);
const afterLook = rig.yaw;
for (let i = 0; i < 100; i++) step(1/60, 1.5, true); // 1.6s walking, below the quiet threshold
check("auto-recentre respects quiet time", Math.abs(D(rig.yaw - afterLook)) < 0.5, `moved ${D(rig.yaw - afterLook).toFixed(2)}° in 1.6s`);

// G. pitch clamps, no flip
fresh();
for (let i = 0; i < 240; i++) { rig.update(1/60, focus, { x: 0, y: 60 }, 0, 0, false, [], false); input.endFrame(); }
const p1 = rig.pitch;
for (let i = 0; i < 600; i++) { rig.update(1/60, focus, { x: 0, y: -60 }, 0, 0, false, [], false); input.endFrame(); }
const p2 = rig.pitch;
check("pitch stays in range", p1 <= 1.001 && p2 >= 0.059, `max ${p1.toFixed(2)}, min ${p2.toFixed(2)}`);

// H. frame rate independence of the rate limiter
fresh();
swipe(0.5, 900); const at60 = D(rig.yaw);
fresh();
swipe(0.5, 900, 30);
const at30 = D(rig.yaw);
check("30 vs 60 fps results are close", Math.abs(at60 - at30) < 3, `60fps ${at60.toFixed(1)}° vs 30fps ${at30.toFixed(1)}°`);

console.log(fails ? `\n${fails} FAILED` : "\nall 8 camera behaviour tests passed");
