import * as THREE from "three";

/**
 * Turns a stick/keyboard axis (x = right, y = forward, length <= 1) into a
 * world-space direction, relative to where the camera looks.
 *
 * Kept in its own module because the sign of the strafe axis is easy to get
 * wrong (it was mirrored once: pushing the stick left made the player go right).
 * There is a unit test for it: tests/movement.mjs
 */
export function wishDirection(
  yaw: number,
  axis: { x: number; y: number },
  out = new THREE.Vector3()
): THREE.Vector3 {
  // camera forward on the ground plane
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  // the camera's right vector: rotate forward by -90° around +Y
  const rx = -fz;
  const rz = fx;

  out.set(fx * axis.y + rx * axis.x, 0, fz * axis.y + rz * axis.x);
  const len = out.length();
  if (len > 1) out.divideScalar(len);
  return out;
}
