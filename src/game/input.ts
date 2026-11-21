export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  private pointerLocked = false;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      const k = norm(e.code);
      if (!this.down.has(k)) this.pressed.add(k);
      this.down.add(k);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.down.delete(norm(e.code)));
    window.addEventListener("blur", () => this.down.clear());

    canvas.addEventListener("mousedown", (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
    });
    window.addEventListener("mouseup", () => (this.dragging = false));
    window.addEventListener("mousemove", (e) => {
      if (document.pointerLockElement === canvas) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
        this.pointerLocked = true;
      } else if (this.dragging) {
        this.mouseDX += e.clientX - this.lastX;
        this.mouseDY += e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
    document.addEventListener("pointerlockchange", () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });

    // touch fallback: virtual stick on the left half of the screen
    this.bindTouch();
  }

  private touchId: number | null = null;
  private touchOrigin = { x: 0, y: 0 };
  touchAxis = { x: 0, y: 0 };
  touchAction = false;

  private bindTouch() {
    const c = this.canvas;
    c.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      if (this.touchId === null) {
        this.touchId = t.identifier;
        this.touchOrigin = { x: t.clientX, y: t.clientY };
      } else {
        this.touchAction = true; // second finger = enter/exit vehicle
      }
    });
    c.addEventListener("touchmove", (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.touchId) {
          this.touchAxis.x = Math.max(-1, Math.min(1, (t.clientX - this.touchOrigin.x) / 60));
          this.touchAxis.y = Math.max(-1, Math.min(1, (t.clientY - this.touchOrigin.y) / 60));
        }
      }
      e.preventDefault();
    });
    c.addEventListener("touchend", (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.touchId) {
          this.touchId = null;
          this.touchAxis.x = 0;
          this.touchAxis.y = 0;
        }
      }
    });
  }

  isDown(code: string) {
    return this.down.has(norm(code));
  }

  wasPressed(code: string) {
    return this.pressed.has(norm(code));
  }

  get throttle() {
    let v = 0;
    if (this.isDown("KeyW") || this.isDown("ArrowUp")) v += 1;
    if (this.isDown("KeyS") || this.isDown("ArrowDown")) v -= 1;
    return Math.max(-1, Math.min(1, v - this.touchAxis.y));
  }

  get steer() {
    let v = 0;
    if (this.isDown("KeyA") || this.isDown("ArrowLeft")) v += 1;
    if (this.isDown("KeyD") || this.isDown("ArrowRight")) v -= 1;
    return Math.max(-1, Math.min(1, v - this.touchAxis.x));
  }

  get handbrake() {
    return this.isDown("Space");
  }

  get sprint() {
    return this.isDown("ShiftLeft") || this.isDown("ShiftRight");
  }

  consumeMouse() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  endFrame() {
    this.pressed.clear();
  }

  lock() {
    this.canvas.requestPointerLock?.();
  }

  get locked() {
    return this.pointerLocked;
  }
}

function norm(code: string) {
  return code;
}
