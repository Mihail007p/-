/**
 * Third-person camera rig.
 *
 * Design goals (learned from the first version being too twitchy):
 *  - raw mouse/touch deltas never touch the camera directly: they move a
 *    *target* yaw/pitch which the camera chases with exponential smoothing;
 *  - per-frame deltas are clamped and small jitter is ignored (dead zone);
 *  - sensitivity is separate for mouse and touch and user-adjustable;
 *  - auto-recentre only nudges gently, and pauses for a while after any manual look;
 *  - obstacle handling eases the distance in and out instead of snapping.
 */
import * as THREE from "three";

export type CameraSettings = {
  /** 0.4 .. 2.2 multiplier */
  sensitivity: number;
  invertY: boolean;
  autoCenter: boolean;
};

export const DEFAULT_SETTINGS: CameraSettings = {
  sensitivity: 1,
  invertY: false,
  autoCenter: true,
};

export type Collider = { x0: number; x1: number; z0: number; z1: number; height: number };

const _dir = new THREE.Vector3();
const _pos = new THREE.Vector3();

/** Frame-rate independent smoothing factor. */
function damp(lambda: number, dt: number) {
  return 1 - Math.exp(-lambda * dt);
}

export class CameraRig {
  yaw: number;
  pitch = 0.34;
  distance: number;

  private targetYaw: number;
  private targetPitch = 0.34;
  private targetDistance: number;
  /** smoothed distance after obstacle checks */
  private safeDistance: number;

  private focus = new THREE.Vector3();
  private smoothedFocus = new THREE.Vector3();
  private lookQuiet = 10; // seconds since the player last moved the camera
  settings: CameraSettings = { ...DEFAULT_SETTINGS };
  /** true while the player is actively dragging/swiping this frame */
  movingInput = false;

  /** optional hook so the game can fade low props the camera passes through */
  fadeProp: ((c: Collider, opacity: number) => void) | null = null;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private opts: { mobile: boolean; minDistance?: number; maxDistance?: number }
  ) {
    this.yaw = 0;
    this.targetYaw = 0;
    this.distance = opts.mobile ? 7.6 : 6.6;
    this.targetDistance = this.distance;
    this.safeDistance = this.distance;
  }

  /** Hard reset behind the player (also used by the "C" key and double tap). */
  resetBehind(heading: number) {
    this.targetYaw = heading + Math.PI;
    this.targetPitch = 0.34;
    this.targetDistance = this.opts.mobile ? 7.6 : 6.6;
    this.lookQuiet = 10;
  }

  setSettings(s: CameraSettings) {
    this.settings = { ...s };
  }

  update(
    dt: number,
    focus: THREE.Vector3,
    look: { x: number; y: number },
    zoom: number,
    playerHeading: number,
    moving: boolean,
    colliders: Collider[],
    recenterRequested: boolean
  ) {
    const minD = this.opts.minDistance ?? 3.0;
    const maxD = this.opts.maxDistance ?? 12;

    if (recenterRequested) this.resetBehind(playerHeading);

    // ---------------------------------------------------------- look input
    // Pixel deltas are turned into an angle and rate-limited *in degrees per
    // second*, so a twitchy finger and a fast mouse both feel smooth, and the
    // result never depends on the frame rate.
    let dx = look.x;
    let dy = look.y;

    // Ignore sub-pixel tremor, and anything beyond a sane single frame.
    if (Math.abs(dx) < 0.5) dx = 0;
    if (Math.abs(dy) < 0.5) dy = 0;
    const frameMax = this.opts.mobile ? 160 : 420;
    dx = THREE.MathUtils.clamp(dx, -frameMax, frameMax);
    dy = THREE.MathUtils.clamp(dy, -frameMax, frameMax);

    if (dx !== 0 || dy !== 0) this.lookQuiet = 0;
    else this.lookQuiet += dt;
    this.movingInput = dt > 0 && (dx !== 0 || dy !== 0);

    // Touch uses a slightly lower base because fingers travel further than a
    // mouse; both are multiplied by the user's sensitivity setting.
    const pxToDeg = (this.opts.mobile ? 0.16 : 0.2) * this.settings.sensitivity;
    const eased = (d: number) => Math.sign(d) * THREE.MathUtils.clamp(Math.abs(d) * 0.92, 0, 28);
    const wantYaw = (-eased(dx) * pxToDeg * Math.PI) / 180;
    const wantPitch = ((this.settings.invertY ? -eased(dy) : eased(dy)) * pxToDeg * 0.7 * Math.PI) / 180;

    // angular speed limit: a flick can never whip the camera around
    // Angular speed cap. It must stay above what a normal drag produces
    // (~300 px/s ≈ 1 rad/s) or the camera starts "chasing" the hand, but a
    // violent flick must not spin the view: see the soft compressor below.
    const maxSpeed = (this.opts.mobile ? 5.2 : 6.0) * this.settings.sensitivity; // rad/s ≈ 300-345 °/s
    // Soft knee: up to 45% of the cap the response is 1:1 with the hand, and
    // only beyond that does it compress. A hard clamp made fast drags feel as
    // if the camera was chasing the finger.
    const softLimit = (v: number, max: number) => {
      const a = Math.abs(v);
      const knee = max * 0.45;
      if (a <= knee) return v;
      const rest = max - knee;
      return Math.sign(v) * (knee + rest * (1 - Math.exp(-(a - knee) / rest)));
    };
    const yawStep = softLimit(wantYaw, maxSpeed * dt);
    const pitchStep = softLimit(wantPitch, maxSpeed * dt * 0.8);

    this.targetYaw += yawStep;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + pitchStep, 0.06, 1.0);

    // ------------------------------------------------------- auto-recentre
    // Gentle: only when the player walks forward and has not touched the camera.
    if (this.settings.autoCenter && this.lookQuiet > 2.4 && moving) {
      let diff = playerHeading + Math.PI - this.targetYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      // ease towards "behind the player", but a gentle one: at most ~1 rad/s
      // and it stops as soon as the player looks around again
      this.targetYaw += THREE.MathUtils.clamp(diff, -1.0 * dt, 1.0 * dt);
    }

    // -------------------------------------------------------- zoom smoothing
    this.targetDistance = THREE.MathUtils.clamp(
      this.targetDistance + zoom,
      minD,
      maxD
    );

    // ------------------------------------------------------------ smoothing
    // IMPORTANT: the visible angle is driven straight to the target every frame.
    // The target is already rate-limited above, and that is where all the
    // smoothness comes from. Any extra lag here made the view keep turning for
    // a moment after the finger/mouse stopped — that was the reported bug.
    this.yaw = this.targetYaw;
    this.pitch = this.targetPitch;

    // Focus point: follows the player with a slight lag, so walking doesn't
    // jitter the camera on small bumps / animation bobbing.
    this.focus.copy(focus);
    this.smoothedFocus.lerp(this.focus, damp(18, dt));

    // ------------------------------------------------------- obstacle avoid
    const cosP = Math.cos(this.pitch);
    const dir = _dir
      .set(Math.sin(this.yaw) * cosP, Math.sin(this.pitch) + 0.12, Math.cos(this.yaw) * cosP)
      .normalize();

    let allowed = this.targetDistance;
    const origin = this.smoothedFocus;
    for (let d = 0.6; d <= this.targetDistance; d += 0.35) {
      const x = origin.x + dir.x * d;
      const y = origin.y + dir.y * d;
      const z = origin.z + dir.z * d;
      let blocked = false;
      for (const c of colliders) {
        if (
          x > c.x0 - 0.35 &&
          x < c.x1 + 0.35 &&
          z > c.z0 - 0.35 &&
          z < c.z1 + 0.35 &&
          y < c.height + 0.3
        ) {
          // Tall walls pull the camera in. Low things (park monuments, benches)
          // are simply faded out, which is far less jarring than a zoom jump.
          if (c.height < 3.2) {
            this.fadeProp?.(c, THREE.MathUtils.clamp(1 - (y / 2.2), 0.1, 1));
            continue;
          }
          blocked = true;
          break;
        }
      }
      if (blocked) {
        allowed = Math.max(minD * 0.55, d - 0.45);
        break;
      }
    }

    // Pull in fast, release slowly: feels natural and never "pops".
    const rate = allowed < this.safeDistance ? 22 : 5;
    this.safeDistance += (allowed - this.safeDistance) * damp(rate, dt);

    const pos = _pos.copy(this.smoothedFocus).addScaledVector(dir, this.safeDistance);
    // never let the camera dip below knee height
    pos.y = Math.max(pos.y, 0.55);

    this.camera.position.copy(pos);
    this.camera.lookAt(this.smoothedFocus);
  }

  /** Called once on start so the first frame is already correct. */
  snap(focus: THREE.Vector3) {
    this.smoothedFocus.copy(focus);
    const cosP = Math.cos(this.pitch);
    const dir = _dir
      .set(Math.sin(this.yaw) * cosP, Math.sin(this.pitch) + 0.12, Math.cos(this.yaw) * cosP)
      .normalize();
    this.camera.position.copy(focus).addScaledVector(dir, this.safeDistance);
    this.camera.lookAt(focus);
  }
}
