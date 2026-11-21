import * as THREE from "three";
import { makeCanvas, rnd, toTexture } from "./build/geom";

/**
 * All textures are generated on the fly — no image files to load, which keeps
 * the single-file build small and makes the game work offline.
 */

/* ------------------------------------------------------------------ asphalt */
export function asphaltTexture() {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = "#4a4a4c";
  ctx.fillRect(0, 0, 512, 512);

  // aggregate speckles
  for (let i = 0; i < 26000; i++) {
    const g = Math.floor(rnd(52, 118));
    ctx.fillStyle = `rgba(${g},${g},${g - 2},${rnd(0.25, 0.85)})`;
    const s = rnd(1, 2.6);
    ctx.fillRect(Math.random() * 512, Math.random() * 512, s, s);
  }
  // darker patches (repairs, oil)
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = rnd(20, 90);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(38,38,40,${rnd(0.12, 0.3)})`);
    g.addColorStop(1, "rgba(38,38,40,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTexture(c);
}

/** Cheap normal map from the asphalt grain, for sun highlights on the road. */
export function asphaltNormal() {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = "#8080ff";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = Math.floor(rnd(110, 145));
    const g = Math.floor(rnd(110, 145));
    ctx.fillStyle = `rgba(${r},${g},255,0.55)`;
    ctx.fillRect(x, y, rnd(1, 3), rnd(1, 3));
  }
  return toTexture(c, [1, 1], false);
}

/* ---------------------------------------------------------------- sidewalk */
export function sidewalkTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = "#9a9a96";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 12000; i++) {
    const g = Math.floor(rnd(120, 190));
    ctx.fillStyle = `rgba(${g},${g},${g - 6},${rnd(0.15, 0.5)})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // slab joints
  ctx.strokeStyle = "rgba(70,70,68,0.75)";
  ctx.lineWidth = 3;
  for (let i = 0; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 128, 0);
    ctx.lineTo(i * 128, 256);
    ctx.moveTo(0, i * 128);
    ctx.lineTo(256, i * 128);
    ctx.stroke();
  }
  return toTexture(c);
}

/* ------------------------------------------------------------------- grass */
export function grassTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = "#4c6b3a";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 22000; i++) {
    const g = Math.floor(rnd(60, 120));
    ctx.fillStyle = `rgba(${g * 0.62},${g},${g * 0.45},${rnd(0.2, 0.8)})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, rnd(1, 2.4), rnd(2, 5));
  }
  return toTexture(c);
}

/* ---------------------------------------------------------------- facades */
export type FacadeKind = "plaster" | "brick" | "concrete" | "glass";
export type FacadeTextures = {
  map: THREE.Texture;
  roughnessMap: THREE.Texture;
  /** size of one texture tile in metres */
  tile: [number, number];
};

/**
 * Facade tile: 4 windows wide × 4 floors. Written to look hand-made rather than
 * tiled: uneven window blinds, sills, AC boxes, small stains.
 */
export function facadeTextures(kind: FacadeKind): FacadeTextures {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  const [r, rctx] = makeCanvas(256, 256);

  const base =
    kind === "brick"
      ? "#8d5a44"
      : kind === "concrete"
        ? "#b3b0a8"
        : kind === "glass"
          ? "#8fb6c9"
          : "#d8d2c4";

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  rctx.fillStyle = "#d0d0d0";
  rctx.fillRect(0, 0, 256, 256);

  if (kind === "brick") {
    // brick courses
    const bh = 16;
    const bw = 44;
    for (let row = 0; row * bh < S; row++) {
      const offset = row % 2 === 0 ? 0 : bw / 2;
      for (let col = -1; col * bw < S; col++) {
        const x = col * bw + offset;
        const y = row * bh;
        const g = rnd(0.72, 1.12);
        ctx.fillStyle = `rgb(${Math.floor(141 * g)},${Math.floor(90 * g)},${Math.floor(68 * g)})`;
        ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2);
      }
      ctx.fillStyle = "rgba(196,188,176,0.55)";
      ctx.fillRect(0, row * bh, S, 1.5);
    }
  } else if (kind === "concrete") {
    ctx.fillStyle = "rgba(120,118,112,0.28)";
    for (let i = 0; i < 40; i++) {
      ctx.fillRect(Math.random() * S, Math.random() * S, rnd(20, 140), rnd(4, 26));
    }
    ctx.strokeStyle = "rgba(96,94,90,0.5)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 128, 0);
      ctx.lineTo(i * 128, S);
      ctx.stroke();
    }
  } else if (kind === "glass") {
    const g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, "#9dc4d6");
    g.addColorStop(0.45, "#7ea7bd");
    g.addColorStop(1, "#a9c8d8");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = "rgba(58,74,86,0.85)";
    ctx.lineWidth = 5;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 128, 0);
      ctx.lineTo(i * 128, S);
      ctx.moveTo(0, i * 128);
      ctx.lineTo(S, i * 128);
      ctx.stroke();
    }
  }

  // grime at the bottom of the tile and around the windows
  if (kind !== "glass") {
    const grime = ctx.createLinearGradient(0, 0, 0, S);
    grime.addColorStop(0, "rgba(90,84,74,0)");
    grime.addColorStop(1, "rgba(84,78,70,0.4)");
    ctx.fillStyle = grime;
    ctx.fillRect(0, 0, S, S);
  }

  // windows (skipped for curtain-wall glass towers)
  if (kind !== "glass") {
    const cols = 4;
    const rows = 4;
    const cw = S / cols;
    const ch = S / rows;
    const wx = cw * 0.26;
    const wy = ch * 0.22;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * cw + wx;
        const y = row * ch + wy;
        const w = cw - wx * 2;
        const h = ch - wy * 1.8;

        // recessed frame
        ctx.fillStyle = "rgba(240,238,232,0.8)";
        ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
        // glass with a sky reflection
        const gg = ctx.createLinearGradient(x, y, x + w, y + h);
        gg.addColorStop(0, "#5d7688");
        gg.addColorStop(0.35, "#93aebd");
        gg.addColorStop(0.55, "#cfdde4");
        gg.addColorStop(1, "#6b8393");
        ctx.fillStyle = gg;
        ctx.fillRect(x, y, w, h);

        // blinds / curtains
        if (Math.random() < 0.45) {
          ctx.fillStyle = `rgba(${Math.floor(rnd(190, 240))},${Math.floor(rnd(180, 225))},${Math.floor(rnd(160, 210))},0.85)`;
          const bh2 = h * rnd(0.2, 0.6);
          ctx.fillRect(x, y, w, bh2);
        }
        // a plant or lamp inside some windows
        if (Math.random() < 0.18) {
          ctx.fillStyle = "rgba(70,110,60,0.75)";
          ctx.fillRect(x + w * rnd(0.1, 0.5), y + h * rnd(0.55, 0.75), w * 0.22, h * 0.25);
        }
        // mullion
        ctx.fillStyle = "rgba(245,245,240,0.9)";
        ctx.fillRect(x + w / 2 - 2, y, 4, h);
        // sill shadow
        ctx.fillStyle = "rgba(60,58,54,0.35)";
        ctx.fillRect(x - 5, y + h + 4, w + 10, 4);

        // roughness: glass is smoother than plaster
        rctx.fillStyle = "#3a3a3a";
        rctx.fillRect(x / 2, y / 2, w / 2, h / 2);

        // AC unit under some windows
        if (Math.random() < 0.16) {
          ctx.fillStyle = "#c9c9c2";
          ctx.fillRect(x + w * 0.15, y + h + 4, w * 0.42, h * 0.16);
          ctx.fillStyle = "rgba(70,70,66,0.6)";
          ctx.fillRect(x + w * 0.18, y + h + 6, w * 0.36, h * 0.12);
        }
      }
    }
  }

  return {
    map: toTexture(c),
    roughnessMap: toTexture(r, [1, 1], false),
    tile: kind === "glass" ? [12, 12] : [7.2, 7.2],
  };
}

/* ------------------------------------------------------------------ metal */
export function metalTexture() {
  const [c, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = "#8f949a";
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1400; i++) {
    const g = Math.floor(rnd(110, 170));
    ctx.fillStyle = `rgba(${g},${g},${g + 4},${rnd(0.1, 0.4)})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, rnd(1, 3), rnd(1, 2));
  }
  return toTexture(c);
}

/* ------------------------------------------------------------- shop window */
export function shopFrontTexture(variant: number) {
  const [c, ctx] = makeCanvas(256, 256);

  // awning / store sign colour
  const palettes = [
    ["#b5372f", "#f0e2c8"],
    ["#25543f", "#e8e0cc"],
    ["#2c4a80", "#eef1f5"],
    ["#8a2f6a", "#f3e6ef"],
    ["#a86a1e", "#f7efdc"],
  ];
  const [main, light] = palettes[variant % palettes.length];

  ctx.fillStyle = light;
  ctx.fillRect(0, 0, 256, 256);

  // storefront glass
  const g = ctx.createLinearGradient(0, 60, 0, 256);
  g.addColorStop(0, "#38505e");
  g.addColorStop(0.5, "#5d7784");
  g.addColorStop(1, "#2c3a44");
  ctx.fillStyle = g;
  ctx.fillRect(8, 70, 240, 178);

  // warm interior glow
  const warm = ctx.createRadialGradient(128, 190, 10, 128, 190, 150);
  warm.addColorStop(0, "rgba(255,215,150,0.6)");
  warm.addColorStop(1, "rgba(255,215,150,0)");
  ctx.fillStyle = warm;
  ctx.fillRect(8, 70, 240, 178);

  // shelves / silhouettes inside
  ctx.fillStyle = "rgba(30,26,22,0.55)";
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(24 + i * 46, 150 + Math.random() * 30, 30, 70);
  }

  // mullions
  ctx.fillStyle = "rgba(235,232,224,0.9)";
  ctx.fillRect(126, 70, 6, 178);

  // awning stripes
  ctx.fillStyle = main;
  ctx.fillRect(0, 0, 256, 62);
  for (let i = 0; i < 8; i++) {
    if (i % 2 === 0) {
      ctx.fillStyle = light;
      ctx.fillRect(i * 32, 0, 32, 62);
    }
  }
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0, 54, 256, 8);

  ctx.fillStyle = "rgba(20,20,20,0.75)";
  ctx.font = "700 22px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "center";
  const names = ["MARKET", "CAFE", "PHARMACY", "BAKERY", "BARBER"];
  ctx.fillStyle = main;
  ctx.fillText(names[variant % names.length], 128, 40);

  return toTexture(c);
}

/* ----------------------------------------------------------------- windows glow for far buildings (cheap LOD) */
export function windowGridTexture() {
  const [c, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = "#b9b6ae";
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 8; y < 128; y += 16) {
    for (let x = 8; x < 128; x += 16) {
      ctx.fillStyle = `rgba(${rnd(90, 130) | 0},${rnd(110, 150) | 0},${rnd(130, 165) | 0},1)`;
      ctx.fillRect(x, y, 10, 10);
    }
  }
  return toTexture(c);
}
