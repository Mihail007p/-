/**
 * Offline renderer for the character model.
 *
 * The sandbox has no GPU, so this projects the real three.js geometry with a
 * simple orthographic camera, Lambert shading and a z-buffer, and writes a PNG.
 * It is a measurement tool: it shows exactly what the code builds.
 *
 *   node tools/render-character.mjs [out.png]
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import * as THREE from "three";
import { JSDOM } from "jsdom";

import { installSoftCanvas } from "./soft-canvas.mjs";

const dom = new JSDOM(`<!doctype html><body></body>`, { url: "https://example.com/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
installSoftCanvas(dom);
const { createCharacter } = await import("../.test-build/character/model.js");

/* -------------------------------------------------------------- PNG writer */
function writePNG(path, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let p = 0;
  for (let y = 0; y < h; y++) {
    raw[p++] = 0; // filter: none
    rgb.copy(raw, p, y * w * 3, (y + 1) * w * 3);
    p += w * 3;
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (const b of body) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
    const c = Buffer.alloc(4);
    c.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, body, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // truecolour
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
  return png.length;
}

/* ------------------------------------------------------------------ render */
const yaw = Number(process.env.YAW ?? 0);
const rig = createCharacter(1.76);
if (process.env.HILITE) {
  rig.model.traverse((o) => {
    if (o.isMesh && o.material && Math.abs((o.material.roughness ?? 0) - 0.88) < 0.01) {
      o.material = o.material.clone();
      o.material.color.set(0x00ff00);
      o.material.map = null;
      o.material.userData.albedo = 0x00ff00;
      console.log("hilited", o.geometry.type, o.geometry.parameters);
    }
  });
}
rig.model.rotation.y = yaw;
rig.model.updateMatrixWorld(true);

const W = 760;
const H = 1000;
const img = Buffer.alloc(W * H * 3);
// studio backdrop: soft vertical gradient, like the concept sheet
for (let y = 0; y < H; y++) {
  const t = y / H;
  const g = Math.round(226 - t * 26);
  for (let x = 0; x < W; x++) {
    const v = Math.round(g - (x / W) * 6);
    const i = (y * W + x) * 3;
    img[i] = v - 3;
    img[i + 1] = v;
    img[i + 2] = v + 4;
  }
}

const zbuf = new Float32Array(W * H).fill(-Infinity);
const light = new THREE.Vector3(-0.45, 0.85, 0.7).normalize();
const fill = new THREE.Vector3(0.5, 0.1, 0.6).normalize();

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const n = new THREE.Vector3();
const e1 = new THREE.Vector3();
const e2 = new THREE.Vector3();

const scale = Number(process.env.ZOOM ?? 500); // px per metre
const focusY = Number(process.env.FOCUS_Y ?? 0); // metres, vertical centre
const cx = W / 2;
const floorY = 0; // world y of the ground
function project(v) {
  return {
    x: cx + v.x * scale,
    y: focusY
      ? H / 2 - (v.y - focusY) * scale
      : H - 70 - (v.y - floorY) * scale,
    z: v.z,
  };
}
void floorY;

let tris = 0;
const debugId = process.env.DEBUG_ID ?? "";
const FLAT = process.env.FLAT === "1";
const HUES = [0xff0000,0x00ff00,0x0000ff,0xffff00,0xff00ff,0x00ffff,0xff8800,0x8800ff,0x00ff88,0x888800,0xff0088,0x0088ff,0x88ff00,0x442200,0x224400,0x002244,0xcccccc,0x666666,0x99ff00,0x00ff99,0x000099,0x990099,0x009999,0x999900];
let meshIndex = 0;
rig.model.traverse((o) => {
  const mesh = o;
  if (!mesh.isMesh) return;
  const geom = mesh.geometry;
  const pos = geom.attributes.position;
  const index = geom.index;
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (process.env.ONLY && geom.type !== process.env.ONLY) return;
  if (process.env.KEEP_MESH !== undefined && meshIndex !== Number(process.env.KEEP_MESH)) { meshIndex++; return; }
  if (process.env.SKIP_R && Math.abs((geom.parameters?.radius ?? -1) - Number(process.env.SKIP_R)) < 1e-6) return;
  if (process.env.SKIP_INDEX !== undefined && meshIndex === Number(process.env.SKIP_INDEX)) { meshIndex++; return; }
  if (process.env.KEEP_INDEX !== undefined && meshIndex !== Number(process.env.KEEP_INDEX)) { meshIndex++; return; }
  const albedo = mat.userData?.albedo ?? (mat.color ? mat.color.getHex() : 0xffffff);
  const base = new THREE.Color(FLAT ? HUES[meshIndex % HUES.length] : albedo);
  if (FLAT) { const b = new THREE.Box3().setFromObject(mesh); console.log("mesh", meshIndex, geom.type, "radius", geom.parameters?.radius, "y", b.min.y.toFixed(3), b.max.y.toFixed(3), "x", b.min.x.toFixed(3), b.max.x.toFixed(3), "colour #" + HUES[meshIndex % HUES.length].toString(16).padStart(6, "0")); }
  meshIndex++;
  // procedural textures were painted into the software canvas: use those pixels
  const canvasImg = mat.map?.image ?? null;
  if (process.env.DEBUG_TEX) {
    const s = canvasImg?._soft;
    console.log("mesh", geom.type, "map", !!mat.map, "soft", s ? `${s.width}x${s.height}` : "none",
      "albedo", (mat.userData?.albedo ?? 0).toString(16));
  }
  // three.js stores the DOM canvas; the software canvas hangs off `_soft`
  const texData = process.env.NOMAP ? null : canvasImg?._soft ?? (canvasImg && canvasImg.data ? canvasImg : null);
  const isHead = geom.type === "SphereGeometry" && geom.parameters?.widthSegments >= 30;
  let headSamples = 0;
  const uv = geom.attributes.uv;
  // map is present → approximate the fabric albedo, which is already in the base colour
  const mw = mesh.matrixWorld;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mw);

  const count = index ? index.count : pos.count;
  for (let i = 0; i < count; i += 3) {
    const ia = index ? index.getX(i) : i;
    const ib = index ? index.getX(i + 1) : i + 1;
    const ic = index ? index.getX(i + 2) : i + 2;
    a.fromBufferAttribute(pos, ia).applyMatrix4(mw);
    b.fromBufferAttribute(pos, ib).applyMatrix4(mw);
    c.fromBufferAttribute(pos, ic).applyMatrix4(mw);

    e1.subVectors(b, a);
    e2.subVectors(c, a);
    n.crossVectors(e1, e2).applyMatrix3(normalMatrix).normalize();
    // backface cull in view space (camera looks along -Z from +Z)
    if (n.z <= 0.02) continue;

    const lam = Math.max(0, n.dot(light));
    const rim = Math.max(0, n.dot(fill)) * 0.25;
    const amb = 0.34;
    const shade = Math.min(1.35, amb + lam * 0.85 + rim);
    const ua = uv ? uv.getX(ia) : 0, va = uv ? uv.getY(ia) : 0;
    const ub = uv ? uv.getX(ib) : 0, vb = uv ? uv.getY(ib) : 0;
    const uc = uv ? uv.getX(ic) : 0, vc = uv ? uv.getY(ic) : 0;
    // a weave texture is painted in the material's own colour: tinting by the
  // albedo again would darken it twice. Normalise by the painted colour.
  const painted = mat.map?.userData?.painted;
  const kR = painted ? base.r / Math.max(0.02, painted.r) : base.r;
  const kG = painted ? base.g / Math.max(0.02, painted.g) : base.g;
  const kB = painted ? base.b / Math.max(0.02, painted.b) : base.b;
  const baseR = base.r, baseG = base.g, baseB = base.b;
  const id = mesh.geometry.uuid;
    const tw = texData ? texData.width : 0;
    const th = texData ? texData.height : 0;

    const pa = project(a), pb = project(b), pc = project(c);
    const minX = Math.max(0, Math.floor(Math.min(pa.x, pb.x, pc.x)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(pa.x, pb.x, pc.x)));
    const minY = Math.max(0, Math.floor(Math.min(pa.y, pb.y, pc.y)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(pa.y, pb.y, pc.y)));
    const area = (pb.x - pa.x) * (pc.y - pa.y) - (pc.x - pa.x) * (pb.y - pa.y);
    if (Math.abs(area) < 1e-9) continue;
    tris++;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((pb.x - px) * (pc.y - py) - (pc.x - px) * (pb.y - py)) / area;
        const w1 = ((pc.x - px) * (pa.y - py) - (pa.x - px) * (pc.y - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * pa.z + w1 * pb.z + w2 * pc.z;
        const idx = y * W + x;
        if (z <= zbuf[idx]) continue;
        zbuf[idx] = z;
        let cr = baseR, cg = baseG, cb = baseB;
        if (texData && tw > 0) {
          const tu = w0 * ua + w1 * ub + w2 * uc;
          const tv = 1 - (w0 * va + w1 * vb + w2 * vc);
          const sx = Math.min(tw - 1, Math.max(0, Math.round(tu * (tw - 1))));
        if (process.env.DEBUG_UV && id === debugId) {
          globalThis.__uvlog = globalThis.__uvlog || [];
          if (globalThis.__uvlog.length < 40) globalThis.__uvlog.push([px, py, +tu.toFixed(3), +tv.toFixed(3), sy]);
        }
          const sy = Math.min(th - 1, Math.max(0, Math.round(tv * (th - 1))));
          const ti = (sy * tw + sx) * 4;
          const d = texData.data;
          if (isHead && headSamples++ < 6) {
            console.log("head sample", { px, py, tu: +tu.toFixed(3), tv: +tv.toFixed(3), sx, sy,
              rgb: [d[ti], d[ti + 1], d[ti + 2]], tw, th });
          }
          cr = (d[ti] / 255) * kR;
          cg = (d[ti + 1] / 255) * kG;
          cb = (d[ti + 2] / 255) * kB;
        }
        const o = idx * 3;
        img[o] = Math.min(255, cr * 255 * shade);
        img[o + 1] = Math.min(255, cg * 255 * shade);
        img[o + 2] = Math.min(255, cb * 255 * shade);
      }
    }
  }
});

// contact shadow under the feet
for (let y = H - 70; y < H - 40; y++) {
  for (let x = 0; x < W; x++) {
    const d = Math.abs(x - cx) / 150;
    if (d > 1) continue;
    const k = (1 - d) * ((y - (H - 70)) / 30) * 0.32;
    const i = (y * W + x) * 3;
    img[i] = img[i] * (1 - k);
    img[i + 1] = img[i + 1] * (1 - k);
    img[i + 2] = img[i + 2] * (1 - k);
  }
}

if (process.env.DEBUG_UV) { console.log(JSON.stringify(globalThis.__uvlog?.slice(0, 12))); }
if (process.env.PIXEL) {
  const [px, py] = process.env.PIXEL.split(",").map(Number);
  const i = (py * W + px) * 3;
  console.log("pixel", px, py, "rgb", img[i], img[i + 1], img[i + 2]);
}
if (process.env.PROBE) {
  let sum = 0, n = 0;
  for (let y = 470; y < 520; y++) for (let x = 300; x < 460; x++) {
    const i = (y * W + x) * 3; sum += img[i]; n++;
  }
  console.log("band brightness", (sum / n).toFixed(1));
}
const out = process.argv[2] ?? "art/character-render.png";
const size = writePNG(out, W, H, img);
console.log(`rendered ${tris} triangles → ${out} (${(size / 1024).toFixed(1)} KB)`);
