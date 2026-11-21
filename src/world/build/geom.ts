import * as THREE from "three";

/** Small helpers shared by the world builders. */

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available");
  return [canvas, ctx];
}

export function toTexture(
  canvas: HTMLCanvasElement,
  repeat: [number, number] = [1, 1],
  srgb = true
) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function rnd(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function pick<T>(arr: readonly T[]): T {
  return arr[(Math.random() * arr.length) | 0];
}

/**
 * Batches flat-shaded boxes into ONE geometry so hundreds of buildings cost a
 * single draw call — essential for phones.
 */
export class BoxBatcher {
  private positions: number[] = [];
  private normals: number[] = [];
  private uvs: number[] = [];

  /**
   * @param uvScale world units per texture tile, so textures keep a constant
   *                real-world size regardless of the box dimensions
   */
  add(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    opts: {
      uvPerMeter?: number;
      uvOffset?: number;
      skipBottom?: boolean;
      /** rotate the box around its own centre (radians, Y axis) */
      rotY?: number;
    } = {}
  ) {
    const uvScale = opts.uvPerMeter ?? 1;
    const uvOff = opts.uvOffset ?? 0;
    const hw = w / 2;
    const hh = h / 2;
    const hd = d / 2;
    const x0 = x - hw;
    const x1 = x + hw;
    const y0 = y - hh;
    const y1 = y + hh;
    const z0 = z - hd;
    const z1 = z + hd;

    // faces: [normal, four corners, u along face, v] — viewed from outside, CCW
    const faces: { n: [number, number, number]; p: number[][]; uw: number }[] = [
      { n: [1, 0, 0], p: [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], uw: d },
      { n: [-1, 0, 0], p: [[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]], uw: d },
      { n: [0, 0, 1], p: [[x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]], uw: w },
      { n: [0, 0, -1], p: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], uw: w },
      { n: [0, 1, 0], p: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], uw: w },
    ];
    if (!opts.skipBottom) {
      faces.push({ n: [0, -1, 0], p: [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]], uw: w });
    }

    const rotY = opts.rotY ?? 0;
    const cosR = Math.cos(rotY);
    const sinR = Math.sin(rotY);
    const rotatePoint = (p: number[]) => {
      if (!rotY) return p;
      const px = p[0] - x;
      const pz = p[2] - z;
      return [x + px * cosR - pz * sinR, p[1], z + px * sinR + pz * cosR];
    };

    for (const f of faces) {
      const [a, b, c, dd] = f.p.map(rotatePoint);
      const tri = [a, b, c, a, c, dd];
      const n = rotY
        ? [f.n[0] * cosR - f.n[2] * sinR, f.n[1], f.n[0] * sinR + f.n[2] * cosR]
        : f.n;
      const u0 = uvOff;
      const u1 = uvOff + f.uw * uvScale;
      const v0 = uvOff + y0 * uvScale;
      const v1 = uvOff + y1 * uvScale;
      const cornerUV = [
        [u0, v0],
        [u1, v0],
        [u1, v1],
        [u0, v1],
      ];
      const uvOrder = [0, 1, 2, 0, 2, 3];
      for (let i = 0; i < 6; i++) {
        const p = tri[i];
        this.positions.push(p[0], p[1], p[2]);
        this.normals.push(n[0], n[1], n[2]);
        const uv = cornerUV[uvOrder[i]];
        this.uvs.push(uv[0], uv[1]);
      }
    }
  }

  /** Add an arbitrary rotated quad (used for road markings, decals). */
  addQuad(
    center: THREE.Vector3,
    width: number,
    length: number,
    rotationY: number,
    y = 0
  ) {
    const c = Math.cos(rotationY);
    const s = Math.sin(rotationY);
    const hw = width / 2;
    const hl = length / 2;
    const corners: [number, number][] = [
      [-hw, -hl],
      [hw, -hl],
      [hw, hl],
      [-hw, hl],
    ];
    const pts = corners.map(([x, z]) => [
      center.x + x * c + z * s,
      y,
      center.z - x * s + z * c,
    ]);
    const order = [0, 1, 2, 0, 2, 3];
    for (const i of order) {
      const p = pts[i];
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(0, 1, 0);
      this.uvs.push(corners[i][0] / width + 0.5, corners[i][1] / length + 0.5);
    }
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    geo.computeBoundingSphere();
    return geo;
  }

  get isEmpty() {
    return this.positions.length === 0;
  }

  get triangleCount() {
    return this.positions.length / 9;
  }
}

/** Simple seeded RNG so the city is stable between reloads. */
export function createRng(seed = 1337) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
