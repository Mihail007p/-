import * as THREE from "three";
import { makeCanvas, toTexture } from "../world/build/geom";

/**
 * Human figure built as lofted surfaces instead of assembled primitives.
 *
 * Every body part is a stack of cross-section rings swept along a spine. Because
 * the rings are continuous, the silhouette has no seams, no gaps and no
 * interpenetrating blobs — the failure mode of the previous "boxes and capsules"
 * version. Clothing is not extra geometry either: it is painted onto the same
 * loft's UV map (a jacket, a t-shirt, denim, boots), so the surface follows the
 * body exactly.
 *
 * Proportions and colours are measured from `art/character.png`:
 * the figure spans 717 px for 1.76 m, so `fraction = (y - 29) / 717`.
 */

/* ------------------------------------------------------------------ palette */
export const CHARACTER_PALETTE = {
  skin: 0xc79c85,
  skinShade: 0x9b6f5c,
  hair: 0x1d1512,
  tee: 0x9fa3a6,
  jacket: 0x39414f,
  jacketDark: 0x272d38,
  jeans: 0x33322f,
  boots: 0x141416,
  belt: 0x3a2b22,
  buckle: 0x9a9a95,
} as const;

/* -------------------------------------------------------------- proportions */
export const CHARACTER_PROPORTIONS = {
  headTop: 1.0,
  eyes: 0.926,
  chin: 0.866,
  shoulder: 0.789,
  belt: 0.559,
  hip: 0.53,
  knee: 0.285,
  ankle: 0.057,
  headWidth: 0.106,
  shoulderWidth: 0.25,
  chestWidth: 0.24,
  waistWidth: 0.19,
  thighWidth: 0.092,
  calfWidth: 0.072,
} as const;

/* ---------------------------------------------------------------- utilities */

type Ring = { y: number; rx: number; rz: number; cx?: number; cz?: number; v?: number };

/**
 * Sweeps elliptical rings along +Y and returns a closed geometry with cylindrical
 * UVs (u around the body, v along its height). Both ends are capped with a small
 * rounded dome so limbs never look cut off.
 */
export function loft(
  rings: Ring[],
  radial: number,
  opts: { capTop?: boolean; capBottom?: boolean; roundTop?: number } = {}
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const rows = rings.length;
  for (let r = 0; r < rows; r++) {
    const ring = rings[r];
    // v is the position along the body's own texture: 0 = hips, 1 = crown
    const v = ring.v ?? r / (rows - 1);
    for (let a = 0; a <= radial; a++) {
      const ang = (a / radial) * Math.PI * 2;
      const cx = Math.cos(ang);
      const cz = Math.sin(ang);
      positions.push(
        (ring.cx ?? 0) + cx * ring.rx,
        ring.y,
        (ring.cz ?? 0) + cz * ring.rz
      );
      // u = 0 at +X; the character's front is +Z, i.e. u = 0.25
      uvs.push(a / radial, v);
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let a = 0; a < radial; a++) {
      const i0 = r * (radial + 1) + a;
      const i1 = i0 + 1;
      const i2 = i0 + (radial + 1);
      const i3 = i2 + 1;
      indices.push(i0, i2, i1, i1, i2, i3);
    }
  }

  // rounded caps: a hemisphere-ish crown of extra rings
  const addCap = (ring: Ring, up: boolean) => {
    const steps = 3;
    const base = positions.length / 3;
    const dir = up ? 1 : -1;
    for (let s = 1; s <= steps; s++) {
      const k = s / (steps + 1);
      const rad = Math.cos((k * Math.PI) / 2);
      const yy = ring.y + dir * ring.rz * Math.sin((k * Math.PI) / 2) * (up ? 0.9 : 0.34);
      for (let a = 0; a <= radial; a++) {
        const ang = (a / radial) * Math.PI * 2;
        positions.push(
          (ring.cx ?? 0) + Math.cos(ang) * ring.rx * rad,
          yy,
          (ring.cz ?? 0) + Math.sin(ang) * ring.rz * rad
        );
        uvs.push(a / radial, up ? Math.min(1, ring.v ?? 1) : Math.max(0, ring.v ?? 0));
      }
    }
    const tip = positions.length / 3;
    positions.push(ring.cx ?? 0, ring.y + dir * ring.rz * (up ? 0.95 : 0.4), ring.cz ?? 0);
    uvs.push(0.5, up ? Math.min(1, (ring.v ?? 1) + 0.01) : Math.max(0, (ring.v ?? 0) - 0.01));

    const lastRow = rows - 1;
    const firstCapRow = base;
    for (let s = 0; s < steps - 1; s++) {
      for (let a = 0; a < radial; a++) {
        const i0 = firstCapRow + s * (radial + 1) + a;
        const i1 = i0 + 1;
        const i2 = i0 + (radial + 1);
        const i3 = i2 + 1;
        if (up) indices.push(i0, i1, i2, i1, i3, i2);
        else indices.push(i0, i2, i1, i1, i2, i3);
      }
    }
    // fan to the tip
    const lastRingStart = firstCapRow + (steps - 1) * (radial + 1);
    for (let a = 0; a < radial; a++) {
      const i0 = lastRingStart + a;
      const i1 = i0 + 1;
      if (up) indices.push(i0, i1, tip);
      else indices.push(i0, tip, i1);
    }
    void lastRow;
  };

  if (opts.capTop !== false) addCap(rings[rows - 1], true);
  if (opts.capBottom !== false) addCap(rings[0], false);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/* ----------------------------------------------------------------- textures */

function weaveTexture(
  base: string,
  kind: "denim" | "cotton" | "leather",
  size = 256
): THREE.Texture {
  const [c, ctx] = makeCanvas(size, size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  if (kind === "denim") {
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        const diag = ((x + y) / 2) % 4;
        const v = diag < 2 ? 0.06 : -0.05;
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, v)})`;
        ctx.fillRect(x, y, 2, 1);
        ctx.fillStyle = `rgba(0,0,0,${Math.max(0, -v)})`;
        ctx.fillRect(x, y + 1, 2, 1);
      }
    }
  } else if (kind === "cotton") {
    for (let i = 0; i < 12000; i++) {
      const g = Math.random() < 0.5 ? 255 : 0;
      ctx.fillStyle = `rgba(${g},${g},${g},${Math.random() * 0.045})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
    }
    for (let y = 0; y < size; y += 3) {
      ctx.fillStyle = `rgba(0,0,0,${0.025 + Math.random() * 0.02})`;
      ctx.fillRect(0, y, size, 1);
    }
  } else {
    for (let i = 0; i < 22000; i++) {
      const g = Math.random() < 0.5 ? 255 : 0;
      ctx.fillStyle = `rgba(${g},${g},${g},${Math.random() * 0.07})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1.4, 1.4);
    }
  }

  const t = toTexture(c, [1, 1]);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.userData.painted = new THREE.Color(base);
  return t;
}

/**
 * The body is ONE loft from the hips to the crown, so its UV map can carry the
 * entire outfit: boots, denim, belt, jacket, t-shirt in the opening, neck and
 * head. u = 0.25 is the front of the character, v = 0 the hips.
 */
function bodyTexture(pal = CHARACTER_PALETTE): THREE.Texture {
  const W = 512;
  const H = 1024;
  const [c, ctx] = makeCanvas(W, H);
  const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
  const cx = 0.25 * W; // u = 0.25 is the front of the body
  const yy = (v: number) => (1 - v) * H; // v = 0 at the ankles, 1 at the crown

  const fillBand = (v0: number, v1: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, yy(v1), W, (v1 - v0) * H);
  };
  const noise = (v0: number, v1: number, count: number, alpha: number, size = 1.6) => {
    for (let i = 0; i < count; i++) {
      const g = Math.random() < 0.5 ? 255 : 0;
      ctx.fillStyle = `rgba(${g},${g},${g},${Math.random() * alpha})`;
      ctx.fillRect(Math.random() * W, yy(v0) + Math.random() * (v1 - v0) * H, size, size);
    }
  };

  /* ---- 0.00–0.50 : denim (both legs share this band) -------------------- */
  fillBand(0, 0.52, hex(pal.jeans));
  noise(0, 0.52, 30000, 0.06);
  // twill
  for (let y = 0; y < H; y += 3) {
    ctx.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.02})`;
    ctx.fillRect(0, y, W, 1);
  }
  // outer seam shadow at the sides of each leg
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0, yy(0.52), 4, 0.52 * H);
  ctx.fillRect(W - 4, yy(0.52), 4, 0.52 * H);
  // faded knees and whiskers
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(190,200,215,${0.02 + Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * W, yy(0.12 + Math.random() * 0.34), 30 + Math.random() * 50, 4);
  }

  /* ---- 0.50–0.535 : belt ---------------------------------------------- */
  fillBand(0.5, 0.535, hex(pal.belt));
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, yy(0.535), W, 2);
  ctx.fillStyle = hex(pal.buckle);
  ctx.fillRect(cx - 0.016 * W, yy(0.535), 0.032 * W, 0.03 * H);

  /* ---- 0.535–0.79 : jacket -------------------------------------------- */
  const jTop = 0.79;
  const jBot = 0.535;
  fillBand(jBot, jTop, hex(pal.jacket));
  noise(jBot, jTop, 34000, 0.04);
  // side shading: the jacket is a cylinder, so darken u = 0, 0.5, 1
  for (const u of [0, 0.5, 1]) {
    const g = ctx.createLinearGradient((u - 0.13) * W, 0, (u + 0.13) * W, 0);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.5, "rgba(0,0,0,0.24)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect((u - 0.13) * W, yy(jTop), 0.26 * W, (jTop - jBot) * H);
  }
  // vertical seam folds
  for (const u of [0.07, 0.18, 0.32, 0.43]) {
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(u * W, yy(jTop), 2, (jTop - jBot) * H);
  }

  /* ---- tee visible in the open front ---------------------------------- */
  const teeTop = jTop - 0.012;
  const teeBot = jBot + 0.012;
  ctx.fillStyle = hex(pal.tee);
  ctx.beginPath();
  ctx.moveTo(cx - 0.03 * W, yy(teeTop));
  ctx.lineTo(cx + 0.03 * W, yy(teeTop));
  ctx.lineTo(cx + 0.044 * W, yy(teeBot));
  ctx.lineTo(cx - 0.044 * W, yy(teeBot));
  ctx.closePath();
  ctx.fill();
  for (let y = yy(teeTop); y < yy(teeBot); y += 2) {
    ctx.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.03})`;
    ctx.fillRect(cx - 0.044 * W, y, 0.088 * W, 1);
  }
  // jacket front edges + hem
  ctx.fillStyle = hex(pal.jacketDark);
  ctx.fillRect(cx - 0.047 * W, yy(jTop), 0.005 * W, (jTop - jBot) * H);
  ctx.fillRect(cx + 0.042 * W, yy(jTop), 0.005 * W, (jTop - jBot) * H);
  ctx.fillRect(0, yy(jBot + 0.008), W, 4);
  // chest pocket seams
  for (const u of [0.11, 0.39]) {
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(u * W, yy(jTop - 0.055), 0.055 * W, 3);
  }

  /* ---- collar + neck --------------------------------------------------- */
  fillBand(0.79, 0.828, hex(pal.jacketDark));
  fillBand(0.828, 0.862, hex(pal.skin));

  /* ---- head: v 0.862 … 1 ---------------------------------------------- */
  const hTop = 0.862;
  const headH = (1 - hTop) * H;
  const headTopY = yy(1);
  fillBand(hTop, 1, hex(pal.skin));
  const glow = ctx.createRadialGradient(cx, headTopY + headH * 0.55, 8, cx, headTopY + headH * 0.55, W * 0.2);
  glow.addColorStop(0, "rgba(255,216,190,0.3)");
  glow.addColorStop(0.62, "rgba(255,216,190,0.06)");
  glow.addColorStop(1, "rgba(80,48,38,0.32)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, headTopY, W, headH);

  // hair: crown + hairline
  for (let y = headTopY; y < headTopY + headH; y++) {
    const v = (y - headTopY) / headH; // 0 at the crown, 1 at the jaw
    for (let x = 0; x < W; x++) {
      let du = Math.abs(x / W - 0.25);
      if (du > 0.5) du = 1 - du;
      const limit = 0.3 + 0.14 * (1 - Math.cos(Math.min(Math.PI, du * 3)));
      if (v < limit + 0.005 * Math.sin((x / W) * 40)) {
        const strand = 0.5 + 0.5 * Math.sin((x / W) * 190 + v * 18);
        const strand2 = 0.5 + 0.5 * Math.sin((x / W) * 61 + v * 96);
        const sheen = Math.max(0, 1 - Math.abs(v - 0.1) / 0.07) * 22;
        const l = 26 + strand * 18 + strand2 * 10 + sheen;
        ctx.fillStyle = `rgb(${Math.round(l + 6)},${Math.round(l)},${Math.round(l - 6)})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  // facial features (v measured from the crown: eyes at 0.44 of the head)
  const eyeY = headTopY + headH * 0.44;
  const eyeDX = W * 0.05;
  for (const sx of [-1, 1]) {
    const ex = cx + sx * eyeDX;
    const sock = ctx.createRadialGradient(ex, eyeY, 2, ex, eyeY, W * 0.045);
    sock.addColorStop(0, "rgba(92,58,46,0.4)");
    sock.addColorStop(1, "rgba(92,58,46,0)");
    ctx.fillStyle = sock;
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, W * 0.04, headH * 0.085, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e9e3dc";
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, 12, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4b3524";
    ctx.beginPath();
    ctx.arc(ex, eyeY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#15100c";
    ctx.beginPath();
    ctx.arc(ex, eyeY, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(ex - 1.6, eyeY - 1.8, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(28,20,16,0.8)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(ex - 12, eyeY - 0.5);
    ctx.quadraticCurveTo(ex, eyeY - 7.5, ex + 12, eyeY - 0.5);
    ctx.stroke();
    ctx.strokeStyle = "#2b211c";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ex - sx * 22, eyeY - headH * 0.1);
    ctx.quadraticCurveTo(ex, eyeY - headH * 0.15, ex + sx * 23, eyeY - headH * 0.11);
    ctx.stroke();
  }

  // nose
  ctx.fillStyle = "rgba(255,224,204,0.16)";
  ctx.beginPath();
  ctx.ellipse(cx, eyeY + headH * 0.16, 6, headH * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(96,58,44,0.34)";
  ctx.beginPath();
  ctx.ellipse(cx, eyeY + headH * 0.26, 12, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const sx of [-1, 1]) {
    ctx.fillStyle = "rgba(52,32,26,0.5)";
    ctx.beginPath();
    ctx.ellipse(cx + sx * 7.5, eyeY + headH * 0.27, 2.3, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // mouth
  const mouthY = eyeY + headH * 0.4;
  ctx.strokeStyle = "rgba(120,74,62,0.85)";
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(cx - 17, mouthY);
  ctx.quadraticCurveTo(cx, mouthY - 4, cx + 17, mouthY);
  ctx.stroke();
  ctx.strokeStyle = "rgba(150,96,80,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 13, mouthY + 6);
  ctx.quadraticCurveTo(cx, mouthY + 9, cx + 13, mouthY + 6);
  ctx.stroke();

  // stubble along the jaw
  for (let i = 0; i < 4800; i++) {
    const x = Math.random() * W;
    const y = headTopY + headH * (0.62 + Math.random() * 0.36);
    const dx = Math.abs(x - cx);
    if (dx > W * 0.15) continue;
    const fade = 1 - dx / (W * 0.15);
    ctx.fillStyle = `rgba(42,32,28,${(0.03 + Math.random() * 0.08) * fade})`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }

  return toTexture(c, [1, 1]);
}


/**
 * Head texture: a proper equirectangular wrap with a high-res face. The head has
 * its own 512×256 map, so the eyes, nose and mouth land on ~25 px instead of
 * being squeezed into a strip of the body atlas.
 */
function headTexture(pal = CHARACTER_PALETTE): THREE.Texture {
  const W = 512;
  const H = 256;
  const [c, ctx] = makeCanvas(W, H);
  const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
  const cx = 0.25 * W;

  ctx.fillStyle = hex(pal.skin);
  ctx.fillRect(0, 0, W, H);

  // warm face, cool sides
  const glow = ctx.createRadialGradient(cx, H * 0.5, 20, cx, H * 0.5, W * 0.33);
  glow.addColorStop(0, "rgba(255,216,190,0.26)");
  glow.addColorStop(0.55, "rgba(255,216,190,0.06)");
  glow.addColorStop(0.85, "rgba(120,80,64,0.1)");
  glow.addColorStop(1, "rgba(120,80,64,0.16)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // silhouette height fraction → equirect texture fraction (top = 0)
  const hf = (h: number) => Math.acos(Math.max(-1, Math.min(1, 1 - 2 * Math.max(0, Math.min(1, h))))) / Math.PI;
  const HAIRLINE = hf(0.26); // front hairline, 26 % down the skull
  const EAR_TOP = hf(0.36);
  const EYE = hf(0.5); // eyes sit on the skull's midline
  const NOSE = hf(0.63);
  const MOUTH = hf(0.715);
  const CHIN = hf(0.985);

  // hair: crown down to the hairline, longer over the ears, a short back
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      let du = Math.abs(x / W - 0.25);
      if (du > 0.5) du = 1 - du;
      // 0.84 halfway round, 1.0 at the front and back
      const front = Math.cos(Math.min(Math.PI, du * 6.4)) * 0.5 + 0.5;
      const limit = HAIRLINE + (EAR_TOP - HAIRLINE) * Math.pow(1 - front, 0.85);
      if (v < limit) {
        const s1 = 0.5 + 0.5 * Math.sin((x / W) * 220 + v * 26);
        const s2 = 0.5 + 0.5 * Math.sin((x / W) * 71 + v * 96);
        const sheen = Math.max(0, 1 - Math.abs(v - 0.08) / 0.07) * 20;
        const l = 30 + s1 * 16 + s2 * 10 + sheen;
        ctx.fillStyle = `rgb(${Math.round(l + 5)},${Math.round(l)},${Math.round(l - 4)})`;
        ctx.fillRect(x, y, 1, 1);
      } else if (v < limit + 0.012) {
        // soft hairline: a few loose strands over the forehead
        ctx.fillStyle = `rgba(30,23,18,${0.28 * (1 - (v - limit) / 0.012)})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  // ---- facial features
  const eyeY = EYE * H;
  const eyeDX = W * 0.047;
  for (const sx of [-1, 1]) {
    const ex = cx + sx * eyeDX;
    const sock = ctx.createRadialGradient(ex, eyeY, 2, ex, eyeY, W * 0.06);
    sock.addColorStop(0, "rgba(88,54,44,0.34)");
    sock.addColorStop(1, "rgba(88,54,44,0)");
    ctx.fillStyle = sock;
    ctx.beginPath(); ctx.ellipse(ex, eyeY, W * 0.05, H * 0.055, 0, 0, Math.PI * 2); ctx.fill();
    // eye white, slightly almond, with a lid shadow along the top
    ctx.fillStyle = "#eeeae4";
    ctx.beginPath(); ctx.ellipse(ex, eyeY, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(120,86,70,0.55)";
    ctx.beginPath(); ctx.ellipse(ex, eyeY - 3.9, 12.7, 5.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4a3423";
    ctx.beginPath(); ctx.arc(ex + sx * 0.6, eyeY, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#100c0a";
    ctx.beginPath(); ctx.arc(ex + sx * 0.6, eyeY, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath(); ctx.arc(ex - 1.8, eyeY - 2.2, 1.2, 0, Math.PI * 2); ctx.fill();
    // upper lid line + lashes
    ctx.strokeStyle = "rgba(28,20,16,0.75)";
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(ex - 13, eyeY + 0.5);
    ctx.quadraticCurveTo(ex, eyeY - 8.4, ex + 13, eyeY + 0.5);
    ctx.stroke();
    // lower lid, a lighter crease
    ctx.strokeStyle = "rgba(150,104,86,0.5)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(ex - 10.5, eyeY + 5.6);
    ctx.quadraticCurveTo(ex, eyeY + 8.8, ex + 10.5, eyeY + 5.6);
    ctx.stroke();
    // brow: one tapered stroke, thick at the inner end
    ctx.strokeStyle = "rgba(40,29,22,0.9)";
    ctx.lineCap = "round";
    const bx0 = ex - sx * 19;
    const bx1 = ex + sx * 18;
    const by0 = eyeY - H * 0.055;
    const by1 = eyeY - H * 0.038;
    ctx.lineWidth = 5.2;
    ctx.beginPath();
    ctx.moveTo(bx0, by0 + 2.2);
    ctx.quadraticCurveTo((bx0 + bx1) / 2, eyeY - H * 0.075, bx1, by1);
    ctx.stroke();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = "rgba(40,29,22,0.7)";
    ctx.beginPath();
    ctx.moveTo(bx1, by1);
    ctx.lineTo(bx1 - sx * 6, by1 - 1.4);
    ctx.stroke();
  }

  // nose: bridge highlight, tip shadow, nostrils, wings
  const noseY = NOSE * H;
  ctx.fillStyle = "rgba(255,232,214,0.16)";
  ctx.beginPath(); ctx.ellipse(cx, (eyeY + noseY) / 2, 6, (noseY - eyeY) * 0.55, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(118,74,58,0.34)";
  ctx.beginPath(); ctx.ellipse(cx, noseY - 3, 12, 7, 0, 0, Math.PI * 2); ctx.fill();
  for (const sx of [-1, 1]) {
    ctx.fillStyle = "rgba(52,30,24,0.6)";
    ctx.beginPath(); ctx.ellipse(cx + sx * 7.5, noseY + 1, 2.6, 1.9, sx * 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,226,206,0.1)";
    ctx.beginPath(); ctx.ellipse(cx + sx * 11, noseY - 2, 3.4, 4, 0, 0, Math.PI * 2); ctx.fill();
  }

  // mouth: closed, with a little shading under the lower lip
  const mouthY = MOUTH * H;
  ctx.fillStyle = "rgba(96,56,48,0.16)";
  ctx.beginPath(); ctx.ellipse(cx, mouthY + 10, 22, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(112,64,54,0.85)";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(cx - 17, mouthY + 1);
  ctx.quadraticCurveTo(cx - 8, mouthY - 2.4, cx, mouthY - 1.4);
  ctx.quadraticCurveTo(cx + 8, mouthY - 2.6, cx + 17, mouthY + 0.6);
  ctx.stroke();
  ctx.strokeStyle = "rgba(186,132,116,0.5)";
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(cx - 16, mouthY + 6);
  ctx.quadraticCurveTo(cx, mouthY + 10, cx + 16, mouthY + 6);
  ctx.stroke();

  // cheek shading and a hint of a jaw shadow (no beard)
  for (const sx of [-1, 1]) {
    const ch = ctx.createRadialGradient(cx + sx * W * 0.075, eyeY + H * 0.1, 4, cx + sx * W * 0.075, eyeY + H * 0.1, W * 0.055);
    ch.addColorStop(0, "rgba(150,96,78,0.08)");
    ch.addColorStop(1, "rgba(150,96,78,0)");
    ctx.fillStyle = ch;
    ctx.fillRect(0, 0, W, H);
  }
  // jaw shading: a soft vertical gradient at the chin, no hard band
  for (let i = 0; i < 3400; i++) {
    const x = Math.random() * W;
    const yTop = H * (CHIN - 0.18);
    const y = yTop + Math.random() * (H - yTop);
    const du = Math.abs(x - cx) / (W * 0.15);
    if (du > 1) continue;
    const fadeIn = Math.min(1, (y - yTop) / (H * 0.06)); // no edge at the top
    ctx.fillStyle = `rgba(96,66,54,${(0.012 + Math.random() * 0.02) * fadeIn * (1 - du * 0.5)})`;
    ctx.fillRect(x, y, 1.3, 1.3);
  }

  const t = toTexture(c, [1, 1]);
  t.userData.painted = new THREE.Color(pal.skin);
  return t;
}


/**
 * Torso texture: jacket with the tee showing in the open front, the belt at the
 * hips and a collar band at the top. v 0.5 (hips) → 0.848 (neck).
 */
function torsoTexture(pal = CHARACTER_PALETTE): THREE.Texture {
  const W = 512;
  const H = 512;
  const [c, ctx] = makeCanvas(W, H);
  const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
  const cx = 0.25 * W;
  // body v → canvas row
  const V0 = 0.512;
  const V1 = 0.842;
  const yy = (v: number) => (1 - (v - V0) / (V1 - V0)) * H;
  const band = (v0: number, v1: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, yy(v1), W, yy(v0) - yy(v1));
  };

  band(V0, 0.53, hex(pal.jeans)); // hip band under the jacket (hidden)
  band(0.53, 0.552, hex(pal.belt)); // belt
  band(0.552, 0.815, hex(pal.jacket)); // jacket body
  // the jacket hem is at v 0.552, i.e. 0.98 m — just over the hips
  band(0.812, 0.826, hex(pal.jacketDark)); // collar edge only
  ctx.fillStyle = '#e7c0a9'; // bare neck above the collar, lit like the face
  ctx.fillRect(0, yy(0.842), W, yy(0.826) - yy(0.842));

  // cloth noise on the jacket
  for (let i = 0; i < 26000; i++) {
    const g = Math.random() < 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${g},${g},${g},${Math.random() * 0.04})`;
    ctx.fillRect(Math.random() * W, yy(0.815) + Math.random() * (yy(0.555) - yy(0.815)), 1.6, 1.6);
  }
  // cylinder shading at the sides and the back
  for (const u of [0, 0.5, 1]) {
    const g = ctx.createLinearGradient((u - 0.13) * W, 0, (u + 0.13) * W, 0);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.5, "rgba(0,0,0,0.26)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect((u - 0.13) * W, yy(0.815), 0.26 * W, yy(0.555) - yy(0.815));
  }
  // seam folds
  for (const u of [0.08, 0.2, 0.3, 0.42]) {
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.fillRect(u * W, yy(0.815), 2, yy(0.555) - yy(0.815));
  }

  // tee visible only in a short V below the collar (a closed jacket below)
  const vBottom = 0.7;
  ctx.fillStyle = hex(pal.tee);
  ctx.beginPath();
  ctx.moveTo(cx - 0.019 * W, yy(0.808));
  ctx.lineTo(cx + 0.019 * W, yy(0.808));
  ctx.lineTo(cx + 0.022 * W, yy(vBottom + 0.012));
  ctx.quadraticCurveTo(cx, yy(vBottom - 0.012), cx - 0.022 * W, yy(vBottom + 0.012));
  ctx.closePath();
  ctx.fill();
  for (let y = yy(0.812); y < yy(vBottom); y += 2) {
    ctx.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.03})`;
    ctx.fillRect(cx - 0.022 * W, y, 0.044 * W, 1);
  }
  // jacket zip line + hem + pockets
  ctx.fillRect(0, yy(0.555), W, 5);
  for (const u of [0.155, 0.345]) {
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(u * W, yy(0.752), 0.048 * W, 2);
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(u * W, yy(0.752) + 2, 1.5, yy(0.705) - yy(0.752));
    ctx.fillRect((u + 0.048) * W - 1.5, yy(0.752) + 2, 1.5, yy(0.705) - yy(0.752));
  }
  // belt buckle
  ctx.fillStyle = hex(pal.buckle);
  ctx.fillRect(cx - 0.014 * W, yy(0.548), 0.028 * W, yy(0.534) - yy(0.548));

  const t = toTexture(c, [1, 1]);
  t.userData.painted = new THREE.Color(0xffffff);
  return t;
}

/* -------------------------------------------------------------------- rig */
export type CharacterRig = {
  model: THREE.Group;
  chest: THREE.Object3D;
  head: THREE.Object3D;
  hipBone: THREE.Object3D;
  thighL: THREE.Object3D;
  thighR: THREE.Object3D;
  shinL: THREE.Object3D;
  shinR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  foreL: THREE.Object3D;
  foreR: THREE.Object3D;
  footL: THREE.Object3D;
  footR: THREE.Object3D;
  jacketL: THREE.Object3D;
  jacketR: THREE.Object3D;
};

export function createCharacter(
  height = 1.76,
  palette: Record<string, number> = {}
) {
  const P = { ...CHARACTER_PALETTE, ...palette } as typeof CHARACTER_PALETTE;
  const K = CHARACTER_PROPORTIONS;
  // all radii below are metres on a 1.76 m figure
  const y = (f: number) => f * height;

  const model = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    map: bodyTexture(P),
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.02,
  });
  bodyMat.userData.albedo = 0xffffff;

  const headMat = new THREE.MeshStandardMaterial({
    map: headTexture(P),
    color: 0xffffff,
    roughness: 0.62,
    metalness: 0,
  });
  headMat.userData.albedo = P.skin;

  const torsoMat = new THREE.MeshStandardMaterial({
    map: torsoTexture(P),
    color: 0xffffff,
    roughness: 0.8,
    metalness: 0.02,
  });
  // the torso texture is already drawn in full colour
  torsoMat.userData.albedo = 0xffffff;

  const denimMat = new THREE.MeshStandardMaterial({
    map: weaveTexture(`#${P.jeans.toString(16)}`, "denim", 256),
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
  });
  denimMat.userData.albedo = P.jeans;

  const jacketMat = new THREE.MeshStandardMaterial({
    map: weaveTexture(`#${P.jacket.toString(16)}`, "cotton", 256),
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0.02,
  });
  jacketMat.userData.albedo = P.jacket;

  const neckMat = new THREE.MeshStandardMaterial({
    color: 0xe7c0a9, // lifted to match the lit face, or the neck reads orange
    roughness: 0.68,
  });
  neckMat.userData.albedo = 0xe7c0a9;

  const handMat = new THREE.MeshStandardMaterial({
    color: 0xd7ab92,
    roughness: 0.62,
    metalness: 0,
  });
  handMat.userData.albedo = 0xd7ab92;

  const bootMat = new THREE.MeshStandardMaterial({
    map: weaveTexture(`#${P.boots.toString(16)}`, "leather", 128),
    color: 0xffffff,
    roughness: 0.5,
    metalness: 0.06,
  });
  bootMat.userData.albedo = P.boots;

  /* --------------------------------------------------- torso (hips→ crown) */
  // One continuous loft: the torso and the head share a surface, so there is no
  // neck seam, no gap at the collar and no blob-on-a-stick silhouette.
  const torsoRings: Ring[] = [];
  // [body v, half-width m, half-depth m] — a 1.76 m adult male
  // Real shoulder width comes from torso + deltoid, not from a flare in the
  // torso itself: a flare reads as a padded/pagoda shoulder.
  const torsoKeys: [number, number, number][] = [
    [0.512, 0.128, 0.094], // hem, sits over the hips
    [0.545, 0.142, 0.099], // hip
    [0.57, 0.148, 0.102], // waist
    [0.62, 0.146, 0.106], // lower ribs
    [0.68, 0.152, 0.112], // chest
    [0.73, 0.157, 0.113], // upper chest / armpit line
    [0.755, 0.166, 0.11],
    [0.773, 0.196, 0.104], // shoulder: the torso carries the width
    [0.789, 0.176, 0.098],
    [0.8, 0.134, 0.088],
    [0.81, 0.098, 0.081],
    [0.818, 0.078, 0.074],
    [0.82, 0.068, 0.07], // neck base
    [0.832, 0.062, 0.066], // neck
    [0.842, 0.064, 0.068], // top of the neck
  ];
  const TORSO_SEG = 96;
  for (let i = 0; i < TORSO_SEG; i++) {
    const t = i / (TORSO_SEG - 1);
    const v = 0.512 + t * (0.842 - 0.512);
    // interpolate the key table
    let a = torsoKeys[0];
    let b = torsoKeys[torsoKeys.length - 1];
    for (let k = 0; k < torsoKeys.length - 1; k++) {
      if (v >= torsoKeys[k][0] && v <= torsoKeys[k + 1][0]) {
        a = torsoKeys[k];
        b = torsoKeys[k + 1];
        break;
      }
    }
    const span = b[0] - a[0] || 1;
    const kk = Math.min(1, Math.max(0, (v - a[0]) / span));
    const s = kk * kk * (3 - 2 * kk);
    torsoRings.push({
      y: y(v),
      rx: a[1] + (b[1] - a[1]) * s,
      rz: a[2] + (b[2] - a[2]) * s,
      v,
    });
  }
  // Torso first: it is the reference for UV space. Limbs are lofted separately
  // but carry the same "v = height along the body" mapping, so one painted
  // texture (jacket, tee, denim, head) drapes every part correctly.
  const torsoRingsWithV = torsoRings.map((r) => ({ ...r }));
  const torso = new THREE.Mesh(
    loft(torsoRingsWithV, 40, { capBottom: false, capTop: false }),
    torsoMat
  );

  torso.name = "torso";
  model.add(torso);

  /** Builds a limb loft and re-maps its v to the body's UV space. */
  const limb = (
    rings: Ring[],
    radial: number,
    vTop: number,
    vBottom: number,
    caps: { capTop?: boolean; capBottom?: boolean } = {}
  ) => {
    return loft(
      rings.map((r, i) => ({
        ...r,
        v: vTop + (vBottom - vTop) * (i / (rings.length - 1)),
      })),
      radial,
      { capTop: caps.capTop ?? false, capBottom: caps.capBottom ?? false }
    );
  };

  /* ------------------------------------------------------------- armature */
  const hipBone = new THREE.Object3D();
  hipBone.position.y = y(K.hip);
  model.add(hipBone);

  // chest pivot: the torso above the waist rotates as a unit
  // upper-body root: parts below hang off the hips, parts above sit in body
  // coordinates, so they live on their own node at the origin
  const upperRoot = new THREE.Object3D();
  model.add(upperRoot);

  const chest = new THREE.Object3D();
  chest.position.y = y(0.68);
  upperRoot.add(chest);

  // head pivot at the base of the skull
  const head = new THREE.Object3D();
  head.position.y = y(0.862);
  upperRoot.add(head);

  const headR = 0.113;
  const headGeo = new THREE.SphereGeometry(headR, 36, 28);
  {
    // narrow the jaw, push the chin forward, flatten the occiput — all
    // multiplicative, so no face can fold inside out
    const pos = headGeo.attributes.position;
    const v = new THREE.Vector3();
    const smooth = (t: number) => {
      const k = Math.max(0, Math.min(1, t));
      return k * k * (3 - 2 * k);
    };
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const ny = v.y / headR; // -1 chin … +1 crown
      // One continuous profile: the skull is widest at the temples, the jaw
      // narrows without a crease, and the chin comes forward. Smoothstep keeps
      // the first derivative continuous, so no shading band appears.
      const x = smooth((-ny - 0.06) / 0.94); // 0 at the temples, 1 at the chin
      // flatten the cheek plane (|x|^1 inside the square) so the jaw is a
      // plane, not a cone — that is what reads as an adult male face
      const jaw = 1 - 0.5 * x * x;
      const flat = 1 - 0.1 * smooth((-ny - 0.25) / 0.5);
      const cheek = 1 + 0.05 * Math.sin(Math.PI * smooth((-ny + 0.15) / 0.7));
      const chinPush = 1 + 0.16 * smooth((-ny - 0.42) / 0.5);
      const occiput = v.z < 0 ? 1 - 0.05 * smooth((0.2 - ny) / 0.8) : 1;
      v.x *= jaw * cheek * flat;
      v.z *= jaw * cheek * chinPush * occiput;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    headGeo.computeVertexNormals();
  }
  const headMesh = new THREE.Mesh(headGeo, headMat);
  headMesh.scale.set(0.73, 1.16, 0.9);
  headMesh.position.y = y(0.915) - y(0.862);
  head.add(headMesh);

  // ears
  for (const side of [-1, 1] as const) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 10), neckMat);
    ear.scale.set(0.36, 1.05, 0.8);
    ear.position.set(side * 0.086, y(0.909) - y(0.862), -0.022);
    ear.rotation.y = side * 0.3;
    head.add(ear);
  }

  /* ---------------------------------------------------------------- legs */
  const legParts: { thigh: THREE.Object3D; shin: THREE.Object3D; foot: THREE.Object3D }[] = [];

  for (const side of [-1, 1] as const) {
    const thighPivot = new THREE.Object3D();
    thighPivot.position.set(side * 0.088, y(K.hip) + 0.012, 0);
    model.add(thighPivot);

    const thighLen = y(K.hip) + 0.038 - y(K.knee);
    // the extra 28 mm sits above the hip; the knee joint itself is unchanged
    const thighRings: Ring[] = [];
    const thighKeys: [number, number][] = [
      [0.0, 0.084], // at the hip joint (t = 0 is the pivot)
      [0.35, 0.079],
      [0.7, 0.068],
      [1.0, 0.061], // knee
    ];
    for (let i = 0; i < 24; i++) {
      const t = i / 23;
      let a = thighKeys[0];
      let b = thighKeys[thighKeys.length - 1];
      for (let k = 0; k < thighKeys.length - 1; k++) {
        if (t >= thighKeys[k][0] && t <= thighKeys[k + 1][0]) {
          a = thighKeys[k];
          b = thighKeys[k + 1];
          break;
        }
      }
      const kk = (t - a[0]) / (b[0] - a[0] || 1);
      const s = kk * kk * (3 - 2 * kk);
      const r = a[1] + (b[1] - a[1]) * s;
      // thigh samples the denim band: hip end near the belt, knee end low
      thighRings.push({ y: -t * thighLen, rx: r, rz: r * 0.96, v: 0.49 - t * 0.2 });
      void 0;
    }
    const thighV = (yy: number) => (y(K.hip) + 0.01 + yy) / height;
    const thigh = new THREE.Mesh(
      limb(thighRings, 20, thighV(0), thighV(-thighLen), { capBottom: true }),
      denimMat
    );
    thighPivot.add(thigh);

    const shinPivot = new THREE.Object3D();
    // keep the knee at its anatomical height: compensate for the raised hip
    shinPivot.position.y = -(y(K.hip) - y(K.knee));
    thighPivot.add(shinPivot);

    const shinLen = y(K.knee) - y(K.ankle) + 0.015; // 1.5 cm into the thigh: no seam
    const shinRings: Ring[] = [];
    // [t down the shin, radius] — knee, calf, ankle
    const shinKeys: [number, number][] = [
      [0.0, 0.061],
      [0.2, 0.064],
      [0.45, 0.068],
      [0.72, 0.055],
      [1.0, 0.038],
    ];
    for (let i = 0; i < 20; i++) {
      const t = i / 19;
      let a = shinKeys[0];
      let b = shinKeys[shinKeys.length - 1];
      for (let k = 0; k < shinKeys.length - 1; k++) {
        if (t >= shinKeys[k][0] && t <= shinKeys[k + 1][0]) {
          a = shinKeys[k];
          b = shinKeys[k + 1];
          break;
        }
      }
      const kk = (t - a[0]) / (b[0] - a[0] || 1);
      const sm = kk * kk * (3 - 2 * kk);
      const r = a[1] + (b[1] - a[1]) * sm;
      shinRings.push({ y: -t * shinLen, rx: r, rz: r * 0.97, v: 0.29 - t * 0.24 });
    }
    const shinV = (yy: number) => (y(K.knee) + yy) / height;
    const shin = new THREE.Mesh(
      limb(shinRings, 18, shinV(0), shinV(-shinLen)),
      denimMat
    );
    shinPivot.add(shin);

    // boot
    const foot = new THREE.Object3D();
    // the shin overlaps the knee; the ankle stays put
    foot.position.y = -shinLen + 0.015;
    shinPivot.add(foot);

    // the foot bone sits at ankle height; the sole must land exactly on y = 0
    const bootRings: Ring[] = [
      { y: -0.088, rx: 0.047, rz: 0.099, cz: 0.036 },
      { y: -0.072, rx: 0.051, rz: 0.104, cz: 0.034 },
      { y: -0.05, rx: 0.055, rz: 0.1, cz: 0.026 },
      { y: -0.02, rx: 0.056, rz: 0.08, cz: 0.016 },
      { y: 0.01, rx: 0.053, rz: 0.056, cz: 0.006 },
    ];
    // capBottom: false + an explicit flat sole ring keeps the boot flat on the ground
    const boot = new THREE.Mesh(loft(bootRings, 20, { capTop: false, capBottom: false }), bootMat);
    // flat sole slab: two rings, closed with a flat disc so the foot stands level
    const soleGeo = loft(
      [
        { y: -0.105, rx: 0.05, rz: 0.102, cz: 0.034 },
        { y: -0.098, rx: 0.05, rz: 0.102, cz: 0.034 },
      ],
      20,
      { capTop: false, capBottom: false }
    );
    {
      // replace the bottom with a flat cap at the same height
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1, 20),
        bootMat
      );
      disc.rotation.x = Math.PI / 2;
      disc.scale.set(0.05, 0.102, 1);
      disc.position.set(0, -0.105, 0.034);
      foot.add(disc);
    }
    const sole = new THREE.Mesh(soleGeo, bootMat);
    foot.add(sole);
    foot.add(boot);

    legParts.push({ thigh: thighPivot, shin: shinPivot, foot });
  }

  /* ---------------------------------------------------------------- arms */
  const armParts: { upper: THREE.Object3D; fore: THREE.Object3D }[] = [];

  for (const side of [-1, 1] as const) {
    const shoulderX = 0.132;
    const armPivot = new THREE.Object3D();
    armPivot.position.set(side * shoulderX, y(0.766), 0);
    armPivot.rotation.z = side * 0.055; // a few degrees out from the body
    model.add(armPivot);

    const upperLen = 0.29;
    const upperRings: Ring[] = [];
    // the sleeve starts at the joint (inside the torso shell) and its widest
    // point is 3 cm down the arm: that is what makes the shoulder slope
    // the sleeve starts inside the torso and swells into the deltoid, so the
    // shoulder is one continuous surface instead of a ball stuck on a box
    upperRings.push({ y: 0.014, rx: 0.016, rz: 0.016, v: 0.783 }); // hidden
    upperRings.push({ y: 0.004, rx: 0.04, rz: 0.038, v: 0.777 });
    upperRings.push({ y: -0.012, rx: 0.056, rz: 0.052, v: 0.771 });
    for (let i = 1; i < 18; i++) {
      const t = i / 17;
      const r = 0.062 - 0.011 * t * t; // deltoid tapering to the elbow
      upperRings.push({ y: -t * upperLen, rx: r, rz: r * 0.95, v: 0.772 - t * 0.12 });
    }
    const upperV = (yy: number) => (y(0.775) + yy) / height;
    const upper = new THREE.Mesh(
      loft(
        upperRings.map((r, i) => ({
          ...r,
          v: upperV(0) + (upperV(-upperLen) - upperV(0)) * (i / (upperRings.length - 1)),
        })),
        18,
        { capTop: true, capBottom: false }
      ),
      jacketMat
    );
    armPivot.add(upper);
    // sleeve head: rounds off the top of the arm so the shoulder slopes
    // instead of ending in a flat cylinder edge


    const forePivot = new THREE.Object3D();
    forePivot.position.y = -upperLen;
    forePivot.rotation.z = -side * 0.03;
    armPivot.add(forePivot);

    const foreLen = 0.235;
    const foreOverlap = 0.02; // tucked inside the sleeve
    const foreRings: Ring[] = [];
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      const r = 0.05 - 0.013 * t;
      foreRings.push({ y: foreOverlap - t * (foreLen + foreOverlap), rx: r, rz: r * 0.95, v: 0.655 - t * 0.09 });
    }
    const foreV = (yy: number) => (y(0.775) - upperLen + yy) / height;
    const fore = new THREE.Mesh(
      loft(
        foreRings.map((r, i) => ({
          ...r,
          v: foreV(0) + (foreV(-foreLen) - foreV(0)) * (i / (foreRings.length - 1)),
        })),
        16,
        { capTop: false, capBottom: false }
      ),
      jacketMat
    );
    forePivot.add(fore);

    // hand: a flattened loft with a thumb, one surface, no finger sticks
    const handRings: Ring[] = [
      { y: -0.004, rx: 0.027, rz: 0.021 },
      { y: -0.028, rx: 0.033, rz: 0.024 },
      { y: -0.06, rx: 0.034, rz: 0.023 },
      { y: -0.09, rx: 0.029, rz: 0.019 },
      { y: -0.112, rx: 0.019, rz: 0.013 },
    ];
    const cuff = new THREE.Mesh(
      loft(
        [
          { y: -foreLen + 0.03, rx: 0.036, rz: 0.034 },
          { y: -foreLen + 0.012, rx: 0.039, rz: 0.037 },
          { y: -foreLen, rx: 0.036, rz: 0.034 },
        ],
        16
      ),
      jacketMat
    );
    forePivot.add(cuff);
    const hand = new THREE.Mesh(loft(handRings, 14, { capTop: false, capBottom: true }), handMat);
    hand.position.y = -foreLen + 0.018;
    hand.rotation.y = side * 0.22; // palms face the thighs
    forePivot.add(hand);
    const thumb = new THREE.Mesh(
      loft(
        [
          { y: -0.028, rx: 0.009, rz: 0.009 },
          { y: -0.05, rx: 0.01, rz: 0.01 },
          { y: -0.065, rx: 0.007, rz: 0.007 },
        ],
        10
      ),
      handMat
    );
    thumb.position.set(side * -0.021, -foreLen - 0.008, 0.006);
    thumb.rotation.z = side * 0.35;
    forePivot.add(thumb);

    armParts.push({ upper: armPivot, fore: forePivot });
  }

  // neck: short cylinder from the collar into the skull base
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.044, 0.056, y(0.88) - y(0.8), 20),
    neckMat
  );
  neck.position.y = y(0.84);
  upperRoot.add(neck);

  /* -------------------------------------------------- hair volume on top */
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  return {
    model,
    chest,
    head,
    hipBone,
    thighL: legParts[0].thigh,
    thighR: legParts[1].thigh,
    shinL: legParts[0].shin,
    shinR: legParts[1].shin,
    footL: legParts[0].foot,
    footR: legParts[1].foot,
    armL: armParts[0].upper,
    armR: armParts[1].upper,
    foreL: armParts[0].fore,
    foreR: armParts[1].fore,
    jacketL: torso,
    jacketR: torso,
  } as CharacterRig;
}
