import * as THREE from "three";
import { makeCanvas, rnd } from "./build/geom";

/**
 * Daylight sky: a gradient dome with a sun glow and drifting clouds.
 * Drawn on a canvas once, then used both as background and as the
 * environment map (so glass and cars reflect a real sky).
 */
export function createDaylightSky(sunDir: THREE.Vector3) {
  const W = 2048;
  const H = 1024;
  const [c, ctx] = makeCanvas(W, H);

  // zenith -> horizon gradient
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#3f7fc4");
  g.addColorStop(0.32, "#78aede");
  g.addColorStop(0.5, "#b9d6ec");
  g.addColorStop(0.56, "#dbe7ee");
  g.addColorStop(0.62, "#c9cfcb");
  g.addColorStop(1, "#8f9490");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // sun position on the equirect map
  const sunU = ((Math.atan2(-sunDir.z, sunDir.x) / (Math.PI * 2) + 0.5) % 1) * W;
  const sunV = (0.5 - Math.asin(sunDir.y) / Math.PI) * H;

  // warm halo
  const halo = ctx.createRadialGradient(sunU, sunV, 0, sunU, sunV, 420);
  halo.addColorStop(0, "rgba(255,248,225,0.95)");
  halo.addColorStop(0.15, "rgba(255,240,200,0.55)");
  halo.addColorStop(0.5, "rgba(255,236,200,0.16)");
  halo.addColorStop(1, "rgba(255,236,200,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(sunU - 420, sunV - 420, 840, 840);

  // clouds: soft layered blobs
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * W;
    const y = rnd(120, H * 0.48);
    const w = rnd(60, 320);
    const h = rnd(16, 60);
    const alpha = rnd(0.05, 0.28);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, w);
    grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(0.6, `rgba(240,245,250,${alpha * 0.5})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, h / w);
    ctx.beginPath();
    ctx.arc(0, 0, w, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // haze band at the horizon
  const haze = ctx.createLinearGradient(0, H * 0.46, 0, H * 0.6);
  haze.addColorStop(0, "rgba(230,238,242,0)");
  haze.addColorStop(1, "rgba(226,232,232,0.85)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, H * 0.46, W, H * 0.15);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.needsUpdate = true;
  return tex;
}
