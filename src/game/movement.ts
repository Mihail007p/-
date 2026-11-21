import * as THREE from "three";

/**
 * Turns a stick/keyboard axis (x = right, y = forward, length <= 1) into a
 * world-space direction, relative to where the camera looks.
 *
 * Kept in its own module because the sign of the strafe axis is easy to get
 * wrong (it was mirrored once: pushing the stick left made the player go right).
 * There is a unit test for it: tests/movement.mjs
 */
/**
 * Movement schemes:
 *  - "camera": stick is relative to where the camera looks (default, GTA-style);
 *  - "character": stick is relative to the character's facing (tank controls).
 */
export type MoveScheme = "camera" | "character";

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

/**
 * Resolves the scheme: in "character" mode the stick is applied to the
 * character's own heading (so pushing left turns the character, not the world).
 */
export function resolveWish(
  scheme: MoveScheme,
  cameraYaw: number,
  characterHeading: number,
  axis: { x: number; y: number },
  out = new THREE.Vector3()
) {
  // Both headings use the same convention: forward = (-sin h, 0, -cos h).
  // A character heading of π therefore faces +Z, so the offset of +π that was
  // here made "up" walk backwards — there is no offset needed.
  return wishDirection(scheme === "character" ? characterHeading : cameraYaw, axis, out);
}
