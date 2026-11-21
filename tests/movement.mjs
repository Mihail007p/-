/**
 * Stick direction must match the screen: pushing left goes left, up goes
 * forward. This caught a mirrored strafe axis that made the joystick reverse.
 */
import * as THREE from "three";

const dom = new (await import("jsdom")).JSDOM(`<!doctype html><body>
  <canvas id="scene"></canvas><div id="stick"><div id="stick-knob"></div></div>
  <div id="look-zone"></div><button id="run-btn"></button></body>`, { url: "https://example.com/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const { wishDirection } = await import("../.test-build/game/movement.js");

let fails = 0;
const check = (name, ok, info = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? "  " + info : ""}`);
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const fmt = (v) => `(${v.x.toFixed(2)}, ${v.z.toFixed(2)})`;

// yaw = 0  ->  camera looks toward -Z
let yaw = 0;
let d = wishDirection(yaw, { x: 0, y: 1 });
check("yaw 0: stick up -> -Z (forward)", near(d.x, 0) && near(d.z, -1), fmt(d));

d = wishDirection(yaw, { x: 1, y: 0 });
check("yaw 0: stick right -> +X", near(d.x, 1) && near(d.z, 0), fmt(d));

d = wishDirection(yaw, { x: -1, y: 0 });
check("yaw 0: stick LEFT -> -X (was the bug)", near(d.x, -1) && near(d.z, 0), fmt(d));

d = wishDirection(yaw, { x: 0, y: -1 });
check("yaw 0: stick down -> +Z (backwards)", near(d.x, 0) && near(d.z, 1), fmt(d));

// yaw = +90° -> camera looks toward -X
yaw = Math.PI / 2;
d = wishDirection(yaw, { x: 0, y: 1 });
check("yaw 90: stick up -> -X", near(d.x, -1) && near(d.z, 0, 1e-6), fmt(d));
d = wishDirection(yaw, { x: 1, y: 0 });
check("yaw 90: stick right -> -Z", near(d.z, -1) && near(d.x, 0, 1e-6), fmt(d));

// upright check for every angle: right must be 90° clockwise from forward
for (let deg = 0; deg < 360; deg += 15) {
  const a = (deg * Math.PI) / 180;
  const f = wishDirection(a, { x: 0, y: 1 }, new THREE.Vector3());
  const r = wishDirection(a, { x: 1, y: 0 }, new THREE.Vector3());
  const dot = f.x * r.x + f.z * r.z;
  // With forward (0,0,-1) "right" is (1,0,0), which gives a POSITIVE cross
  // product — so a positive value here means the vector really points right.
  const cross = f.x * r.z - f.z * r.x;
  if (!near(dot, 0, 1e-6) || cross <= 0) {
    check(`yaw ${deg}°: right is perpendicular & clockwise`, false, `dot=${dot.toFixed(3)} cross=${cross.toFixed(3)}`);
  }
}
check("right vector is perpendicular and always points right (all yaws)", true);

// diagonal, and length is clamped to 1
d = wishDirection(0, { x: 0.7071, y: 0.7071 });
check("diagonal keeps unit length", Math.abs(d.length() - 1) < 1e-3, `len=${d.length().toFixed(3)}`);
d = wishDirection(0, { x: 2, y: 2 });
check("oversized input is clamped", d.length() <= 1.0001, `len=${d.length().toFixed(3)}`);

console.log(fails ? `\n${fails} FAILED` : "\nall movement direction tests passed");
process.exit(fails ? 1 : 0);
