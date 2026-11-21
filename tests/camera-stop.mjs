/**
 * Real-input camera test: jsdom + the actual Input and CameraRig classes.
 * Simulates a mouse drag / finger swipe and reports what the camera does
 * AFTER the input stops — that is where "it never stops turning" shows up.
 */
import { JSDOM } from "jsdom";
import * as THREE from "three";

const dom = new JSDOM(`<!doctype html><html><body>
  <canvas id="scene"></canvas>
  <div id="stick"><div id="stick-knob"></div></div>
  <div id="look-zone"></div>
  <button id="run-btn"></button>
</body></html>`, { pretendToBeVisual: true });

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Touch = dom.window.Touch;

const { Input } = await import("../.test-build/input.js");
const { CameraRig } = await import("../.test-build/camera.js");

const D = (r) => (r * 180) / Math.PI;

function makeRig() {
  const cam = new THREE.PerspectiveCamera(60, 1.5, 0.1, 500);
  const rig = new CameraRig(cam, { mobile: false });
  rig.resetBehind(0);
  rig.yaw = rig.targetYaw;
  rig.pitch = rig.targetPitch;
  return { cam, rig, focus: new THREE.Vector3(0, 1.45, 0) };
}

function frame(rig, focus, input, frames = 1, dt = 1 / 60) {
  for (let i = 0; i < frames; i++) {
    rig.update(dt, focus, { x: input.lookX, y: input.lookY }, input.zoomDelta, 0, false, [], false);
    input.endFrame();
  }
}

// ---------------------------------------------------------------- mouse drag
export function mouseDrag({ px = 120, steps = 12, mode = "drag" }) {
  const { rig, focus } = makeRig();
  const canvas = document.getElementById("scene");
  const input = new Input(canvas);

  // mouse down, then a few mousemove events
  canvas.dispatchEvent(new dom.window.MouseEvent("mousedown", { clientX: 400, clientY: 300, bubbles: true }));
  const perStep = px / steps;
  let x = 400;
  for (let i = 0; i < steps; i++) {
    x += perStep;
    const ev = new dom.window.MouseEvent("mousemove", { clientX: x, clientY: 300, buttons: 1, bubbles: true });
    // pointer lock is not available in jsdom, so movementX/movementY are absent
    if (mode === "lock") {
      Object.defineProperty(ev, "movementX", { value: perStep });
      input.pointerLocked = true;
    }
    window.dispatchEvent(ev);
    frame(rig, focus, input, 1);
  }
  window.dispatchEvent(new dom.window.MouseEvent("mouseup", { buttons: 0, bubbles: true }));

  const yawAtRelease = rig.yaw;
  const targetAtRelease = rig.targetYaw;
  // let the world run with NO input at all for a second
  frame(rig, focus, input, 60);
  const driftAfter = D(rig.yaw - yawAtRelease);
  const targetDrift = D(rig.targetYaw - targetAtRelease);
  return { yawAtRelease: D(yawAtRelease), driftAfter, targetDrift, settled: D(rig.yaw), target: D(rig.targetYaw) };
}

// --------------------------------------------------------------- touch swipe
export function touchSwipe({ px = 120, steps = 12 }) {
  const { rig, focus } = makeRig();
  const canvas = document.getElementById("scene");
  const input = new Input(canvas);
  const zone = document.getElementById("look-zone");

  // jsdom has no Touch constructor: dispatch a plain event with touch lists
  const mk = (type, x) => {
    const t = { identifier: 1, target: zone, clientX: x, clientY: 300, pageX: x, pageY: 300 };
    const ev = new dom.window.Event(type, { bubbles: true, cancelable: true });
    ev.changedTouches = [t];
    ev.touches = type === "touchend" ? [] : [t];
    return ev;
  };

  zone.dispatchEvent(mk("touchstart", 300));
  let x = 300;
  const perStep = px / steps;
  for (let i = 0; i < steps; i++) {
    x += perStep;
    zone.dispatchEvent(mk("touchmove", x));
    frame(rig, focus, input, 1);
  }
  zone.dispatchEvent(mk("touchend", x));

  const yawAtRelease = rig.yaw;
  frame(rig, focus, input, 60);
  return { yawAtRelease: D(yawAtRelease), driftAfter: D(rig.yaw - yawAtRelease), settled: D(rig.yaw), target: D(rig.targetYaw) };
}

// ------------------------------------------------------------------- results
const results = [
  ["mouse drag 120px (12 steps)", mouseDrag({})],
  ["mouse drag 120px (2 steps, fast)", mouseDrag({ steps: 2 })],
  ["mouse drag with pointer lock", mouseDrag({ mode: "lock" })],
  ["touch swipe 120px", touchSwipe({})],
];

let failed = 0;
for (const [name, r] of results) {
  const ok = Math.abs(r.driftAfter) < 0.05;
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name.padEnd(34)} yaw@release=${r.yawAtRelease.toFixed(2)}° drift-after-release=${r.driftAfter.toFixed(3)}° target=${r.target.toFixed(2)}° settled=${r.settled.toFixed(2)}°`
  );
}
console.log(failed ? `\n${failed} FAILED` : "\nall camera-stop tests passed");
