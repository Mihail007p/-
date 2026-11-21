/**
 * Keyboard + mouse + touch input.
 *
 * Look input is buffered in device pixels and normalised later, so a mouse and
 * a finger at the same physical speed produce the same rotation.
 */
export class Input {
  private keys = new Set<string>();
  private pressedOnce = new Set<string>();

  /** virtual stick vector (-1..1) */
  stick = { x: 0, y: 0 };
  /** accumulated look delta for this frame, in CSS pixels */
  lookX = 0;
  lookY = 0;
  zoomDelta = 0;
  /** raw counter of touch taps for double-tap recentre */
  private lastTapTime = 0;
  private tapCount = 0;
  recenterRequested = false;
  pointerLocked = false;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (!this.keys.has(e.code)) this.pressedOnce.add(e.code);
      this.keys.add(e.code);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());

    // ---------------------------------------------------------- mouse look
    let lastX = 0;
    let lastY = 0;
    canvas.addEventListener("mousedown", (e) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (document.pointerLockElement !== canvas) {
        // pointer lock is the comfortable way to look around on desktop;
        // dragging still works as a fallback if the browser refuses
        canvas.requestPointerLock?.();
      }
    });
    document.addEventListener("pointerlockchange", () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    window.addEventListener("mousemove", (e) => {
      if (this.pointerLocked) {
        this.lookX += e.movementX;
        this.lookY += e.movementY;
      } else if (e.buttons & 1) {
        this.lookX += e.clientX - lastX;
        this.lookY += e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
      }
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        // one notch = one small step, independent of the wheel's raw delta
        this.zoomDelta += Math.sign(e.deltaY) * 0.55;
        e.preventDefault();
      },
      { passive: false }
    );
    // keep touch from scrolling/zooming the page
    canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

    this.bindStick();
    this.bindLookZone();
    this.bindRunButton();
  }

  // ------------------------------------------------------------ virtual stick
  private bindStick() {
    const stickEl = document.getElementById("stick")!;
    const knob = document.getElementById("stick-knob")!;
    let active: number | null = null;
    let cx = 0;
    let cy = 0;
    const max = 46;

    const move = (t: Touch) => {
      let dx = t.clientX - cx;
      let dy = t.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      // small dead zone in the centre so the character doesn't creep
      const nx = dx / max;
      const ny = dy / max;
      const mag = Math.hypot(nx, ny);
      const dz = 0.16;
      if (mag < dz) {
        this.stick.x = 0;
        this.stick.y = 0;
      } else {
        const scaled = (mag - dz) / (1 - dz);
        this.stick.x = (nx / mag) * scaled;
        this.stick.y = (ny / mag) * scaled;
      }
    };

    const reset = () => {
      active = null;
      knob.style.transform = "translate(0px, 0px)";
      this.stick.x = 0;
      this.stick.y = 0;
    };

    stickEl.addEventListener(
      "touchstart",
      (e) => {
        const t = e.changedTouches[0];
        active = t.identifier;
        const r = stickEl.getBoundingClientRect();
        cx = r.left + r.width / 2;
        cy = r.top + r.height / 2;
        move(t);
        e.preventDefault();
      },
      { passive: false }
    );
    stickEl.addEventListener(
      "touchmove",
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === active) move(t);
        }
        e.preventDefault();
      },
      { passive: false }
    );
    const stop = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === active) reset();
      }
    };
    stickEl.addEventListener("touchend", stop);
    stickEl.addEventListener("touchcancel", stop);
  }

  // ------------------------------------------------------------ look on touch
  private bindLookZone() {
    const zone = document.getElementById("look-zone")!;
    let active: number | null = null;
    let lastX = 0;
    let lastY = 0;
    let moved = 0;
    let startTime = 0;

    const end = () => {
      // a quick tap without movement = potential double-tap recentre
      if (moved < 12 && performance.now() - startTime < 220) {
        const now = performance.now();
        if (now - this.lastTapTime < 320) {
          this.tapCount++;
          this.recenterRequested = true;
        } else {
          this.tapCount = 0;
        }
        this.lastTapTime = now;
      }
      active = null;
      moved = 0;
    };

    zone.addEventListener(
      "touchstart",
      (e) => {
        const t = e.changedTouches[0];
        active = t.identifier;
        lastX = t.clientX;
        lastY = t.clientY;
        moved = 0;
        startTime = performance.now();
      },
      { passive: true }
    );
    zone.addEventListener(
      "touchmove",
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier !== active) continue;
          const dx = t.clientX - lastX;
          const dy = t.clientY - lastY;
          moved += Math.abs(dx) + Math.abs(dy);
          this.lookX += dx;
          this.lookY += dy;
          lastX = t.clientX;
          lastY = t.clientY;
        }
        e.preventDefault();
      },
      { passive: false }
    );
    zone.addEventListener("touchend", () => end());
    zone.addEventListener("touchcancel", () => end());

    // desktop: double click also recentres
    zone.addEventListener("dblclick", () => (this.recenterRequested = true));
  }

  private bindRunButton() {
    const btn = document.getElementById("run-btn")!;
    let pressed = false;
    btn.addEventListener("touchstart", () => {
      pressed = true;
      btn.classList.add("active");
    });
    const up = () => {
      pressed = false;
      btn.classList.remove("active");
    };
    btn.addEventListener("touchend", up);
    btn.addEventListener("touchcancel", up);
    btn.addEventListener("click", () => {
      pressed = !pressed;
      btn.classList.toggle("active", pressed);
    });
    this.isRunHeld = () => pressed;
  }

  isRunHeld: () => boolean = () => false;

  down(code: string) {
    return this.keys.has(code);
  }

  pressed(code: string) {
    return this.pressedOnce.has(code);
  }

  endFrame() {
    this.pressedOnce.clear();
    this.lookX = 0;
    this.lookY = 0;
    this.zoomDelta = 0;
  }

  /** Movement wish vector: x = right, y = forward, magnitude <= 1 */
  moveAxis() {
    let x = 0;
    let y = 0;
    if (this.down("KeyW") || this.down("ArrowUp")) y += 1;
    if (this.down("KeyS") || this.down("ArrowDown")) y -= 1;
    if (this.down("KeyD") || this.down("ArrowRight")) x += 1;
    if (this.down("KeyA") || this.down("ArrowLeft")) x -= 1;
    if (x === 0 && y === 0) {
      x = this.stick.x;
      y = -this.stick.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  get sprint() {
    if (this.isRunHeld()) return true;
    if (this.down("ShiftLeft") || this.down("ShiftRight")) return true;
    // pushing the stick all the way also runs
    return Math.hypot(this.stick.x, this.stick.y) > 0.94;
  }
}
