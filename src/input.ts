/**
 * Keyboard + mouse + touch input. Touch is first-class: the game is meant for
 * phones, so a virtual stick and a look area are built into the page.
 */
export class Input {
  private keys = new Set<string>();
  private pressedOnce = new Set<string>();

  /** virtual stick vector (-1..1) */
  stick = { x: 0, y: 0 };
  /** camera look delta accumulated this frame (pixels) */
  lookX = 0;
  lookY = 0;
  /** touch look is active (finger on the right half) */
  looking = false;

  zoomDelta = 0;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (!this.keys.has(e.code)) this.pressedOnce.add(e.code);
      this.keys.add(e.code);
      if (
        ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)
      ) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());

    // mouse look: drag on the canvas
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    canvas.addEventListener("mousedown", (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    window.addEventListener("mouseup", () => (dragging = false));
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      this.lookX += e.clientX - lastX;
      this.lookY += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        this.zoomDelta += e.deltaY * 0.01;
        e.preventDefault();
      },
      { passive: false }
    );

    this.bindTouchStick();
    this.bindTouchLook();
  }

  private bindTouchStick() {
    const stickEl = document.getElementById("stick")!;
    const knob = document.getElementById("stick-knob")!;
    let active: number | null = null;
    let cx = 0;
    let cy = 0;

    const start = (t: Touch) => {
      active = t.identifier;
      const r = stickEl.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      move(t);
    };
    const move = (t: Touch) => {
      const max = 46;
      let dx = t.clientX - cx;
      let dy = t.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.stick.x = dx / max;
      this.stick.y = dy / max;
    };
    const end = () => {
      active = null;
      knob.style.transform = "translate(0px, 0px)";
      this.stick.x = 0;
      this.stick.y = 0;
    };

    stickEl.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      start(t);
      e.preventDefault();
    });
    stickEl.addEventListener("touchmove", (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === active) move(t);
      }
      e.preventDefault();
    });
    const stop = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === active) end();
      }
    };
    stickEl.addEventListener("touchend", stop);
    stickEl.addEventListener("touchcancel", stop);
  }

  private bindTouchLook() {
    const lookEl = document.getElementById("look-zone")!;
    let active: number | null = null;
    let lastX = 0;
    let lastY = 0;

    lookEl.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      active = t.identifier;
      lastX = t.clientX;
      lastY = t.clientY;
      this.looking = true;
    });
    lookEl.addEventListener("touchmove", (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== active) continue;
        this.lookX += t.clientX - lastX;
        this.lookY += t.clientY - lastY;
        lastX = t.clientX;
        lastY = t.clientY;
      }
      e.preventDefault();
    });
    const stop = () => {
      active = null;
      this.looking = false;
    };
    lookEl.addEventListener("touchend", stop);
    lookEl.addEventListener("touchcancel", stop);
  }

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
    return this.down("ShiftLeft") || this.down("ShiftRight");
  }
}
