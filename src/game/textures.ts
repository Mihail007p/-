import * as THREE from "three";

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available");
  return [c, ctx];
}

function rnd(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function toTexture(c: HTMLCanvasElement, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Wet asphalt: dark grain with faint tire polish and speckles. */
export function createAsphalt() {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = "#0b0d11";
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 24000; i++) {
    const g = Math.floor(rnd(16, 46));
    ctx.fillStyle = `rgba(${g},${g + 2},${g + 6},${rnd(0.15, 0.6)})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, rnd(1, 2.6), rnd(1, 2.6));
  }
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = rnd(8, 46);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(120,150,180,0.05)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // subtle seams
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * 128 + 12);
    ctx.lineTo(512, i * 128 + 12);
    ctx.stroke();
  }
  return toTexture(c, 1);
}

export function createAsphaltRoughness() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = "#5a5a5a";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = rnd(10, 55);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    // dark = smooth = wet patch reflecting the neon sky
    grad.addColorStop(0, "rgba(20,20,20,0.85)");
    grad.addColorStop(1, "rgba(20,20,20,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTexture(c, 1, false);
}

/** Concrete sidewalk slabs. */
export function createSidewalk() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = "#1a1d22";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const g = Math.floor(rnd(28, 58));
    ctx.fillStyle = `rgba(${g},${g},${g + 4},${rnd(0.1, 0.5)})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 64, 0);
    ctx.lineTo(i * 64, 256);
    ctx.moveTo(0, i * 64);
    ctx.lineTo(256, i * 64);
    ctx.stroke();
  }
  return toTexture(c, 1);
}

export type Facade = { map: THREE.Texture; emissive: THREE.Texture };

/**
 * Facade tile: 4 windows wide, 4 floors high. One tile = 3.2m x 3.6m per window.
 * Emissive map lights a random subset of windows.
 */
export function createFacade(palette: "cold" | "warm" | "concrete" | "glass"): Facade {
  const W = 512;
  const H = 512;
  const [c, ctx] = canvas(W, H);
  const [e, ectx] = canvas(W, H);

  const base = {
    cold: "#141a22",
    warm: "#1b1712",
    concrete: "#191b1d",
    glass: "#0f1620",
  }[palette];

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  // panel noise
  for (let i = 0; i < 16000; i++) {
    const g = Math.floor(rnd(20, 70));
    ctx.fillStyle = `rgba(${g},${g + 3},${g + 8},${rnd(0.05, 0.35)})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }

  ectx.fillStyle = "#000";
  ectx.fillRect(0, 0, W, H);

  const cols = 4;
  const rows = 4;
  const cw = W / cols;
  const ch = H / rows;
  const insetX = cw * 0.22;
  const insetY = ch * 0.2;

  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cw + insetX;
      const y = r * ch + insetY;
      const w = cw - insetX * 2;
      const h = ch - insetY * 2;

      // window frame
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
      ctx.fillStyle = palette === "glass" ? "#101c28" : "#0a0d12";
      ctx.fillRect(x, y, w, h);

      const lit = Math.random() < 0.46;
      if (lit) {
        const warm = Math.random() < 0.62;
        const tint = warm
          ? `rgba(255,${Math.floor(rnd(180, 215))},${Math.floor(rnd(110, 150))},1)`
          : `rgba(${Math.floor(rnd(140, 190))},${Math.floor(rnd(200, 235))},255,1)`;
        ectx.fillStyle = tint;
        ectx.fillRect(x, y, w, h);
        // blinds / gradient inside the lit window
        const grad = ectx.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, "rgba(0,0,0,0.45)");
        grad.addColorStop(0.55, "rgba(0,0,0,0)");
        grad.addColorStop(1, "rgba(0,0,0,0.35)");
        ectx.fillStyle = grad;
        ectx.fillRect(x, y, w, h);
        if (Math.random() < 0.4) {
          ectx.fillStyle = "rgba(0,0,0,0.55)";
          const bh = rnd(4, h * 0.4);
          ectx.fillRect(x, y, w, bh);
        }
        ctx.fillStyle = "rgba(255,240,210,0.12)";
        ctx.fillRect(x, y, w, h);
      } else {
        // faint interior reflection
        const grad = ctx.createLinearGradient(x, y, x + w, y + h);
        grad.addColorStop(0, "rgba(90,140,190,0.10)");
        grad.addColorStop(1, "rgba(20,30,40,0.0)");
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, w, h);
      }
    }
  }

  // floor separators
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  for (let r = 0; r <= rows; r++) ctx.fillRect(0, r * ch - 2, W, 4);
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  for (let r = 0; r <= rows; r++) ctx.fillRect(0, r * ch + 2, W, 1);

  return { map: toTexture(c), emissive: toTexture(e) };
}

/** Radial soft blob used for glow decals, puddles, rain splash. */
export function createGlowTexture(inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)") {
  const [c, ctx] = canvas(256, 256);
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.45, inner.replace(/[\d.]+\)$/, "0.35)"));
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  return toTexture(c, 1);
}

export function createNeonSign(text: string, color: string, vertical = false) {
  const w = vertical ? 192 : 512;
  const h = vertical ? 512 : 192;
  const [c, ctx] = canvas(w, h);
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "rgba(4,6,10,0.92)";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.shadowColor = color;
  ctx.shadowBlur = 26;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = color;
  ctx.shadowBlur = 30;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (vertical) {
    const chars = text.split("");
    const size = Math.min(70, (h - 60) / chars.length);
    ctx.font = `700 ${size}px "Segoe UI", system-ui, sans-serif`;
    chars.forEach((ch, i) => {
      ctx.fillText(ch, w / 2, 40 + size * (i + 0.5));
    });
  } else {
    const size = Math.min(96, (w - 70) / Math.max(3, text.length) * 1.6);
    ctx.font = `800 ${size}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillText(text, w / 2, h / 2);
  }

  const t = toTexture(c, 1);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Equirect night sky used as background + reflection source. */
export function createSkyTexture() {
  const [c, ctx] = canvas(1024, 512);
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#03040a");
  grad.addColorStop(0.42, "#070b16");
  grad.addColorStop(0.62, "#101a2c");
  grad.addColorStop(0.74, "#24314a");
  grad.addColorStop(0.8, "#3a3b55");
  grad.addColorStop(0.86, "#141a26");
  grad.addColorStop(1, "#05070c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  // city light pollution
  const glowColors = [
    "rgba(34,225,255,0.30)",
    "rgba(255,47,160,0.26)",
    "rgba(255,181,69,0.22)",
    "rgba(120,110,255,0.22)",
  ];
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * 1024;
    const y = rnd(300, 420);
    const r = rnd(90, 260);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, glowColors[i % glowColors.length]);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // stars
  for (let i = 0; i < 420; i++) {
    const a = rnd(0.05, 0.6);
    ctx.fillStyle = `rgba(220,235,255,${a})`;
    const x = Math.random() * 1024;
    const y = Math.random() * 210;
    ctx.fillRect(x, y, rnd(0.6, 1.6), rnd(0.6, 1.6));
  }

  // clouds
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 1024;
    const y = rnd(150, 330);
    const r = rnd(40, 150);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(90,105,140,${rnd(0.03, 0.09)})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const t = toTexture(c, 1);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Streak texture for rain particles. */
export function createRainTexture() {
  const [c, ctx] = canvas(16, 64);
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, "rgba(200,230,255,0)");
  g.addColorStop(0.5, "rgba(200,230,255,0.85)");
  g.addColorStop(1, "rgba(200,230,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(6, 0, 4, 64);
  const t = toTexture(c, 1);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
