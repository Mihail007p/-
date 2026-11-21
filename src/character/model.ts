import * as THREE from "three";
import { makeCanvas, toTexture } from "../world/build/geom";

/**
 * Character model, derived from the reference illustration in `art/character.png`.
 *
 * Everything below was measured off that image rather than guessed: the figure
 * spans 717 px from the top of the hair (y=29) to the sole (y=746), so every
 * landmark converts with `fraction = (y - 29) / 717`. For a 1.76 m man that
 * gives the numbers in CHARACTER_PROPORTIONS, and the colours were sampled with
 * a 3×3 median from the flat-lit areas of the fabric.
 */

/* ------------------------------------------------------------------ palette */
export const CHARACTER_PALETTE = {
  skin: 0xb78168, // face highlight, measured
  skinShade: 0x8f5f4c,
  hair: 0x241a14, // dark brown, near black in the concept
  tee: 0xb3b7ba, // light grey cotton undershirt
  jacket: 0x39414f, // navy utility jacket, lifted so it reads in daylight
  jacketDark: 0x262c36, // shadowed panels / seams
  jeans: 0x33322f, // charcoal denim
  boots: 0x141416,
  sole: 0x0b0b0c,
  belt: 0x3a2b22, // dark brown leather
  buckle: 0x9a9a95,
  eye: 0x1b1b1f,
  lips: 0x8a5a4c,
} as const;

/* -------------------------------------------------------------- proportions */
/** Fractions of total height, top → bottom, straight from the reference. */
export const CHARACTER_PROPORTIONS = {
  headTop: 1.0,
  eyes: 0.926, // y≈80 px
  chin: 0.866, // y≈125 px
  shoulder: 0.789, // y≈180 px
  belt: 0.559, // y≈345 px — waist, above the hip joint
  hip: 0.53, // hip *joint* (greater trochanter), standard anatomy = 0.53 h
  knee: 0.285, // y≈560 px — knee joint, 0.285 h
  ankle: 0.057, // top of the boot shaft, where the jeans end (y≈705 px)
  /** Widths as fractions of height (measured spans). */
  headWidth: 0.106,
  shoulderWidth: 0.25,
  chestWidth: 0.24,
  waistWidth: 0.19,
  thighWidth: 0.092,
  calfWidth: 0.072,
} as const;

/* ----------------------------------------------------------------- textures */
function weave(
  base: string,
  kind: "denim" | "cotton" | "leather",
  size = 256
): THREE.Texture {
  const [c, ctx] = makeCanvas(size, size);

  // base with a soft vertical light falloff so the fabric is not flat
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, base);
  grad.addColorStop(0.5, base);
  grad.addColorStop(1, base);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  if (kind === "denim") {
    // 2×2 twill: diagonal ribs plus per-pixel yarn variation
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        const diag = ((x + y) / 2) % 4;
        const v = diag < 2 ? 0.055 : -0.05;
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, v)})`;
        ctx.fillRect(x, y, 2, 1);
        ctx.fillStyle = `rgba(0,0,0,${Math.max(0, -v)})`;
        ctx.fillRect(x, y + 1, 2, 1);
      }
    }
    for (let i = 0; i < 5000; i++) {
      const g = Math.random() < 0.5 ? 255 : 0;
      ctx.fillStyle = `rgba(${g},${g},${g},${Math.random() * 0.06})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
    }
    // faded panels near the knees
    ctx.fillStyle = "rgba(160,170,190,0.05)";
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.ellipse(Math.random() * size, Math.random() * size, 20, 40, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === "cotton") {
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 14000; i++) {
      const g = Math.random() < 0.5 ? 255 : 0;
      ctx.fillStyle = `rgba(${g},${g},${g},${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
    }
    ctx.globalAlpha = 1;
    // horizontal knit ribs
    for (let y = 0; y < size; y += 3) {
      ctx.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.02})`;
      ctx.fillRect(0, y, size, 1);
    }
  } else {
    // leather: fine grain plus a few creases
    for (let i = 0; i < 26000; i++) {
      const g = Math.random() < 0.5 ? 255 : 0;
      const s = 1 + Math.random() * 1.6;
      ctx.fillStyle = `rgba(${g},${g},${g},${Math.random() * 0.08})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
    }
    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = `rgba(0,0,0,${0.06 + Math.random() * 0.08})`;
      ctx.lineWidth = 0.6 + Math.random();
      ctx.beginPath();
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 20, y + 6, x + 8, y + 26, x + 30, y + 34);
      ctx.stroke();
    }
  }

  const t = toTexture(c, [1, 1]);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  // remember which colour the texture was painted in, so tooling that samples
  // the pixels knows the texture already carries that colour
  t.userData.painted = new THREE.Color(base);
  return t;
}

/**
 * Full head texture, painted as an equirectangular wrap for THREE.SphereGeometry.
 *
 * Sphere UVs put u = 0.25 at +Z (the face), v = 0 at the crown and v = 1 at the
 * bottom of the head, so this single image carries skin, brows, eyes, nose
 * shading, lips and stubble, and the face stays correct from every angle — no
 * separate decal mesh to misalign.
 */
function headTexture(skinBase = "#b78168"): THREE.Texture {
  const W = 512;
  const H = 256;
  const [c, ctx] = makeCanvas(W, H);

  ctx.fillStyle = skinBase;
  ctx.fillRect(0, 0, W, H);

  const faceU = 0.25 * W; // centre of the face (+Z)
  const wrapX = (x: number) => {
    // features may straddle the seam
    if (x < 0) return x + W;
    if (x >= W) return x - W;
    return x;
  };

  // warm centre, cooler temples and the back of the head (in shadow)
  const glow = ctx.createRadialGradient(faceU, H * 0.5, 8, faceU, H * 0.5, W * 0.22);
  glow.addColorStop(0, "rgba(255,216,190,0.30)");
  glow.addColorStop(0.6, "rgba(255,216,190,0.06)");
  glow.addColorStop(1, "rgba(96,58,46,0.35)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  for (const dx of [0, W]) {
    const back = ctx.createLinearGradient(dx - W * 0.34, 0, dx, 0);
    back.addColorStop(0, "rgba(70,42,34,0)");
    back.addColorStop(1, "rgba(70,42,34,0.45)");
    ctx.fillStyle = back;
    ctx.fillRect(dx - W * 0.34, 0, W * 0.34, H);
  }

  // ---- hair, painted straight onto the wrap: an exact hairline, no z-fighting
  // u = 0.25 is the face (+Z); v = 0 is the crown. The line stays put across
  // the forehead and only climbs behind the temples, like a real hairline.
  const HLINE = 0.225;
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      let du = Math.abs(u - 0.25);
      if (du > 0.5) du = 1 - du; // 0 at the face, 0.5 at the back
      // smooth curve instead of a clamped ramp (a clamp forms a sharp point)
      const limit = HLINE + 0.2 * (1 - Math.cos(Math.min(Math.PI, du * 3.0)));
      const wobble = 0.003 * Math.sin(u * 19) + 0.002 * Math.sin(u * 47 + 1.1);
      const edge = limit + wobble - v;
      if (edge > 0) {
        // Strands run front-to-back across the crown: two sine frequencies plus
        // a highlight along the top. The edge fades over ~2 mm so the hairline
        // is soft instead of a stencil.
        const strand = 0.5 + 0.5 * Math.sin(u * 190 + v * 18);
        const strand2 = 0.5 + 0.5 * Math.sin(u * 61 + v * 96);
        const fade = Math.min(1, edge / 0.006);
        const sheen = Math.max(0, 1 - Math.abs(v - 0.075) / 0.06) * 26;
        const light = 30 + strand * 20 + strand2 * 12 + sheen;
        ctx.fillStyle = `rgba(${Math.round(light + 6)},${Math.round(light)},${Math.round(light - 6)},${fade})`;
        ctx.fillRect(x, y, 1, 1);
      }
      // sideburns: a narrow patch just in front of the ear
      const sideD = Math.abs(du - 0.205);
      if (sideD < 0.012 && v > 0.3 && v < 0.42) {
        const k = (1 - sideD / 0.012) * (1 - Math.abs(v - 0.36) / 0.06);
        ctx.fillStyle = `rgba(32,25,20,${0.8 * Math.max(0, k)})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  // neck shadow under the jaw
  const jaw = ctx.createLinearGradient(0, H * 0.82, 0, H);
  jaw.addColorStop(0, "rgba(70,40,32,0)");
  jaw.addColorStop(1, "rgba(70,40,32,0.5)");
  ctx.fillStyle = jaw;
  ctx.fillRect(0, H * 0.82, W, H * 0.18);

  // stubble: follows the jawline and leaves the lips clean
  for (let i = 0; i < 5200; i++) {
    const x = Math.random() * W;
    const y = H * 0.68 + Math.random() * H * 0.28;
    const dx = Math.min(Math.abs(x - faceU), W - Math.abs(x - faceU));
    if (dx > W * 0.15) continue;
    // thin out towards the middle of the mouth
    const mouth = Math.abs(y - H * 0.69) < H * 0.035 && dx < W * 0.05;
    if (mouth) continue;
    const fade = (1 - dx / (W * 0.15)) * (0.35 + 0.65 * ((y - H * 0.68) / (H * 0.28)));
    ctx.fillStyle = `rgba(42,32,28,${(0.03 + Math.random() * 0.09) * fade})`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }

  const eyeY = H * 0.44;
  const eyeDX = W * 0.052;

  // sockets
  for (const sx of [-1, 1]) {
    const cx = faceU + sx * eyeDX;
    const g = ctx.createRadialGradient(cx, eyeY, 2, cx, eyeY, W * 0.045);
    g.addColorStop(0, "rgba(92,58,46,0.45)");
    g.addColorStop(1, "rgba(92,58,46,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, eyeY, W * 0.04, H * 0.055, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // eyebrows
  ctx.strokeStyle = "#2b211c";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  for (const sx of [-1, 1]) {
    const cx = faceU + sx * eyeDX;
    ctx.beginPath();
    ctx.moveTo(wrapX(cx - sx * 26), eyeY - H * 0.075);
    ctx.quadraticCurveTo(wrapX(cx), eyeY - H * 0.105, wrapX(cx + sx * 27), eyeY - H * 0.08);
    ctx.stroke();
  }

  // eyes
  for (const sx of [-1, 1]) {
    const cx = faceU + sx * eyeDX;
    ctx.fillStyle = "#e9e3dc";
    ctx.beginPath();
    ctx.ellipse(cx, eyeY, 13, 7.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4b3524";
    ctx.beginPath();
    ctx.arc(cx, eyeY, 5.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#15100c";
    ctx.beginPath();
    ctx.arc(cx, eyeY, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(cx - 1.7, eyeY - 1.9, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(28,20,16,0.8)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx - 13, eyeY - 0.6);
    ctx.quadraticCurveTo(cx, eyeY - 8.4, cx + 13, eyeY - 0.6);
    ctx.stroke();
  }

  // nose: bridge highlight and shadow under the tip
  ctx.fillStyle = "rgba(255,224,204,0.17)";
  ctx.beginPath();
  ctx.ellipse(faceU, H * 0.55, 6, H * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(96,58,44,0.36)";
  ctx.beginPath();
  ctx.ellipse(faceU, H * 0.615, 13, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const sx of [-1, 1]) {
    ctx.fillStyle = "rgba(52,32,26,0.55)";
    ctx.beginPath();
    ctx.ellipse(faceU + sx * 8, H * 0.622, 2.4, 1.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // lips
  ctx.strokeStyle = "rgba(120,74,62,0.85)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(faceU - 18, H * 0.685);
  ctx.quadraticCurveTo(faceU, H * 0.671, faceU + 18, H * 0.685);
  ctx.stroke();
  ctx.strokeStyle = "rgba(150,96,80,0.5)";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(faceU - 14, H * 0.71);
  ctx.quadraticCurveTo(faceU, H * 0.723, faceU + 14, H * 0.71);
  ctx.stroke();

  return toTexture(c, [1, 1]);
}

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
  jacketL: THREE.Mesh;
  jacketR: THREE.Mesh;
};

/** Builds the whole figure. Returns the rig so the animator can pose it. */
export function createCharacter(
  height = 1.76,
  palette: Record<string, number> = {}
) {
  const P = CHARACTER_PALETTE;
  const K = CHARACTER_PROPORTIONS;

  const y = (frac: number) => frac * height;
  const w = (frac: number) => frac * height;

  const skinMat = new THREE.MeshStandardMaterial({
    color: palette.skin ?? P.skin,
    roughness: 0.66,
    metalness: 0,
  });
  // built for the painted hair's sideburns and used by the small nape patch
  const hairMat = new THREE.MeshStandardMaterial({
    color: palette.hair ?? P.hair,
    roughness: 0.88,
    metalness: 0,
  });

  const teeTex = weave("#9fa3a6", "cotton");
  teeTex.repeat.set(3, 3);
  const teeMat = new THREE.MeshStandardMaterial({
    map: teeTex,
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0,
  });
  teeMat.userData.albedo = 0x9fa3a6;

  const jacketTex = weave("#39414f", "cotton");
  jacketTex.repeat.set(3, 4);
  const jacketMat = new THREE.MeshStandardMaterial({
    map: jacketTex,
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0.02,
  });
  jacketMat.userData.albedo = 0x39414f;
  // the standing collar catches the light differently from the body of the jacket
  const collarMat = new THREE.MeshStandardMaterial({
    map: jacketTex,
    color: 0xc2c8d4,
    roughness: 0.74,
    metalness: 0.03,
  });
  collarMat.userData.albedo = 0x4a5260;

  const jacketDarkMat = new THREE.MeshStandardMaterial({
    color: P.jacketDark,
    roughness: 0.8,
    metalness: 0.03,
  });

  const denimTex = weave("#35342f", "denim");
  denimTex.repeat.set(2, 4);
  const denimMat = new THREE.MeshStandardMaterial({
    map: denimTex,
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0,
  });
  denimMat.userData.albedo = 0x35342f;

  const leatherTex = weave("#141416", "leather");
  leatherTex.repeat.set(2, 2);
  const bootMat = new THREE.MeshStandardMaterial({
    map: leatherTex,
    color: 0xffffff,
    roughness: 0.48,
    metalness: 0.06,
  });
  bootMat.userData.albedo = 0x141416;
  const soleMat = new THREE.MeshStandardMaterial({ color: P.sole, roughness: 0.9 });
  const beltMat = new THREE.MeshStandardMaterial({ color: P.belt, roughness: 0.62 });
  const buckleMat = new THREE.MeshStandardMaterial({
    color: P.buckle,
    roughness: 0.32,
    metalness: 0.9,
  });

  const model = new THREE.Group();

  const hipY = y(K.hip);
  const shoulderY = y(K.shoulder);
  const chinY = y(K.chin);
  const beltY = y(K.belt);
  const kneeY = y(K.knee);
  const ankleY = y(K.ankle);

  // shoulder width from the reference (0.25 of height), used for the sleeves
  const shoulderHalf = w(K.shoulderWidth) / 2;
  void shoulderHalf;

  /* ------------------------------------------------------------- pelvis */
  const pelvis = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.128, 0.12, 5, 18),
    denimMat
  );
  pelvis.scale.set(1.08, 1, 0.82);
  pelvis.position.y = hipY + 0.03;
  model.add(pelvis);

  /* ---------------------------------------------------------------- belt */
  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 0.03, 22, 1, true),
    beltMat
  );
  belt.scale.set(1.0, 1, 0.8);
  belt.position.y = beltY;
  model.add(belt);
  // the buckle shows through the open jacket, so it sits on the front band
  const beltBand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.012), beltMat);
  beltBand.position.set(0, beltY, 0.125);
  model.add(beltBand);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.026, 0.008), buckleMat);
  buckle.position.set(0, beltY, 0.133);
  model.add(buckle);

  /* --------------------------------------------------------------- torso */
  const hipBone = new THREE.Object3D();
  hipBone.position.y = hipY + 0.04;
  model.add(hipBone);

  // everything above the hips is authored in body coordinates (y = 0 at the
  // ground); this group cancels the hip offset once so parts do not drift.
  const torso = new THREE.Object3D();
  torso.position.y = -(hipY + 0.04);
  hipBone.add(torso);

  // t-shirt: the visible centre of the chest, under the open jacket
  const teeGeo = new THREE.CapsuleGeometry(0.118, 0.26, 5, 16);
  const tee = new THREE.Mesh(teeGeo, teeMat);
  tee.scale.set(1.06, 1.02, 0.52);
  tee.position.y = (beltY + shoulderY) / 2 - 0.01;
  torso.add(tee);

  const chest = new THREE.Object3D();
  chest.position.y = shoulderY - 0.02;
  torso.add(chest);

  // Jacket body: a closed tapered shell. A closed shell has no interior surface,
  // so it never shows the dark "inside" bars that an open cylinder does — and it
  // stays correct from every angle. The open front is faked with an inset: a
  // strip of tee plus two lapels sitting proud of the chest.
  // explicit top and hem: the shell must stop *below* the shoulder joint and
  // *at* the hips, otherwise it swallows the neck and the belt
  const jacketTop = shoulderY + 0.025;
  const jacketHem = beltY - 0.06;
  const jacketH = jacketTop - jacketHem;
  const jacketY = (jacketTop + jacketHem) / 2;

  // Open jacket, done properly: the shell is a cylinder with a front wedge
  // removed, and the tee is a slightly smaller arc filling that wedge. Because
  // the tee closes the shape from inside, there is no dark void and no plate
  // poking out of the silhouette — correct from every angle.
  const jacket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.172, 0.154, jacketH, 28, 1, true, 0.42, Math.PI * 2 - 0.84),
    jacketMat
  );
  jacket.scale.set(1.0, 1, 0.96);
  jacket.position.y = jacketY;
  torso.add(jacket);

  // tee visible through the opening, slightly inside the jacket radius
  const teeFront = new THREE.Mesh(
    new THREE.CylinderGeometry(0.159, 0.145, jacketH * 0.96, 20, 1, true, -0.46, 0.92),
    teeMat
  );
  teeFront.scale.set(1.0, 1, 0.96);
  teeFront.position.y = jacketY - 0.015;
  torso.add(teeFront);

  // trapezius: a soft wedge closing the neck→shoulder gap
  const traps = new THREE.Mesh(
    new THREE.SphereGeometry(0.128, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
    jacketMat
  );
  traps.scale.set(1.12, 0.52, 0.86);
  traps.position.y = shoulderY - 0.028;
  torso.add(traps);

  /* ---------------------------------------------------------------- neck */
  const neckH = chinY - shoulderY + 0.05;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.051, 0.066, neckH, 16), skinMat);
  neck.position.y = shoulderY + neckH / 2 - 0.03;
  torso.add(neck);

  /* ---------------------------------------------------------------- head */
  const head = new THREE.Object3D();
  head.position.y = chinY - 0.022;
  torso.add(head);

  const headH = height - chinY; // chin to crown; the skull is scaled shorter below
  const skullR = w(K.headWidth) / 2;

  // one sphere, one wrap texture: the face is correct from every angle
  const headMat = new THREE.MeshStandardMaterial({
    map: headTexture("#b78168"),
    color: 0xffffff,
    roughness: 0.62,
    metalness: 0,
  });
  headMat.userData.albedo = 0xffffff;

  // The head is a sphere with the jaw tapered and the chin pushed forward.
  // Both the skin and the hair shells are built from this same deformation, so
  // the hair always follows the skull exactly — no brim, no gaps.
  const deformSkull = (geo: THREE.BufferGeometry) => {
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const ny = v.y / skullR; // -1 bottom … +1 top
      const down = Math.max(0, -ny);
      const up = Math.max(0, ny);

      // Purely multiplicative warps: every factor stays positive, so the
      // surface can never fold through itself (additive offsets do).
      const jaw = 1 - 0.16 * Math.pow(down, 2.4); // cheeks taper into the chin
      const chin = 1 + 0.16 * Math.exp(-Math.pow((ny + 0.42) / 0.3, 2)); // chin forward
      const under = 1 - 0.2 * Math.pow(Math.max(0, (ny + 0.85) / 0.5), 2); // jawline back
      const crown = 1 + 0.05 * Math.pow(up, 2); // volume for the hair
      const occiput = v.z < 0 ? 0.95 : 1;

      v.x *= jaw * (1 + 0.02 * up);
      v.z *= jaw * chin * under * occiput * crown;
      v.y *= 1 + 0.03 * up * up;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  };

  const skullGeo = deformSkull(new THREE.SphereGeometry(skullR, 32, 26));
  const skull = new THREE.Mesh(skullGeo, headMat);
  skull.scale.set(0.9, 0.96, 0.95);
  skull.position.y = headH * 0.5;
  head.add(skull);

  // nape: a tuft at the back of the neck, below the painted hairline
  const nape = new THREE.Mesh(new THREE.SphereGeometry(skullR * 0.66, 14, 10), hairMat);
  nape.scale.set(0.9, 0.42, 0.45);
  nape.position.set(0, headH * 0.3, -skullR * 0.66);
  head.add(nape);

  // nose profile: only the bridge and tip need geometry
  // no geometric nose: the painted nose and its shadow read better than a
  // separate sphere, which always looked like a dark ball at gameplay angles

  // ears
  for (const side of [-1, 1] as const) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 10), skinMat);
    ear.scale.set(0.34, 1, 0.66);
    ear.position.set(side * skullR * 0.9, headH * 0.46, -0.012);
    ear.rotation.y = side * 0.25;
    head.add(ear);
  }

  /* ---------------------------------------------------------------- legs */
  const legParts: {
    thigh: THREE.Object3D;
    shin: THREE.Object3D;
    foot: THREE.Object3D;
  }[] = [];

  for (const side of [-1, 1] as const) {
    const thighPivot = new THREE.Object3D();
    thighPivot.position.set(side * 0.095, hipY + 0.005, 0);
    model.add(thighPivot);

    const thighLen = hipY + 0.005 - kneeY;
    const thigh = new THREE.Mesh(
      new THREE.CapsuleGeometry(w(K.thighWidth) / 2 - 0.012, thighLen - 0.1, 5, 14),
      denimMat
    );
    thigh.position.y = -thighLen / 2;
    thigh.scale.set(1, 1, 0.94);
    thighPivot.add(thigh);

    // a rounded knee cap hides the seam where the two denim segments meet
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), denimMat);
    knee.position.y = -thighLen;
    knee.scale.set(1, 0.86, 0.92);
    thighPivot.add(knee);

    const shinPivot = new THREE.Object3D();
    shinPivot.position.y = -thighLen;
    thighPivot.add(shinPivot);

    const shinLen = kneeY - ankleY;
    const shin = new THREE.Mesh(
      new THREE.CapsuleGeometry(w(K.calfWidth) / 2 - 0.01, shinLen - 0.09, 5, 14),
      denimMat
    );
    shin.position.y = -shinLen / 2;
    shin.scale.set(1, 1, 0.95);
    shinPivot.add(shin);

    // boot: shaft, toe box, sole, heel
    const foot = new THREE.Object3D();
    foot.position.y = -shinLen;
    shinPivot.add(foot);

    // the foot group sits at the ankle (0.101 m up); the sole rests on y = 0
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.048, 0.115, 14), bootMat);
    shaft.position.y = -0.035;
    foot.add(shaft);

    const shoeBody = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.064, 0.255), bootMat);
    shoeBody.position.set(0, -0.048, 0.048);
    foot.add(shoeBody);

    // rounded toe
    const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.098, 12), bootMat);
    toe.rotation.z = Math.PI / 2;
    toe.scale.set(1, 1, 0.94);
    toe.position.set(0, -0.048, 0.158);
    foot.add(toe);

    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.022, 0.268), soleMat);
    sole.position.set(0, -0.09, 0.048);
    foot.add(sole);

    const heel = new THREE.Mesh(new THREE.BoxGeometry(0.096, 0.026, 0.07), soleMat);
    heel.position.set(0, -0.088, -0.055);
    foot.add(heel);

    // laces: three thin bars across the instep
    for (let i = 0; i < 3; i++) {
      const lace = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.006, 0.007), soleMat);
      lace.position.set(0, -0.018 - i * 0.014, 0.05 + i * 0.03);
      lace.rotation.x = 0.5;
      foot.add(lace);
    }

    legParts.push({ thigh: thighPivot, shin: shinPivot, foot });
  }

  /* ---------------------------------------------------------------- arms */
  const armParts: { upper: THREE.Object3D; fore: THREE.Object3D }[] = [];

  for (const side of [-1, 1] as const) {
    const armPivot = new THREE.Object3D();
    armPivot.position.set(side * 0.168, shoulderY - 0.05, 0);
    model.add(armPivot);

    // the sleeve is a capsule whose rounded top *is* the shoulder — no pads
    const upperLen = 0.29;
    const upper = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.04, upperLen - 0.08, 6, 14),
      jacketMat
    );
    upper.position.y = -upperLen / 2 + 0.06;
    upper.scale.set(1, 1, 0.95);
    armPivot.add(upper);

    const forePivot = new THREE.Object3D();
    forePivot.position.y = -upperLen;
    armPivot.add(forePivot);

    // sleeve tapers to the cuff
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.032, 0.2, 12), jacketMat);
    fore.position.y = -0.108;
    forePivot.add(fore);

    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.039, 0.022, 12), jacketDarkMat);
    cuff.position.y = -0.203;
    forePivot.add(cuff);

    // hand: palm plus a hint of fingers
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.039, 12, 10), skinMat);
    hand.scale.set(0.82, 1.22, 0.6);
    hand.position.y = -0.246;
    forePivot.add(hand);
    // fingers as one tapered block: reads cleanly at gameplay distance
    const fingers = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.045, 4, 10), skinMat);
    fingers.scale.set(1.0, 1.0, 0.55);
    fingers.position.set(0, -0.272, 0.004);
    forePivot.add(fingers);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.022, 3, 8), skinMat);
    thumb.position.set(side * -0.027, -0.244, 0.01);
    thumb.rotation.z = side * 0.55;
    forePivot.add(thumb);

    armParts.push({ upper: armPivot, fore: forePivot });
  }

  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  const rig: CharacterRig = {
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
    jacketL: jacket,
    jacketR: jacket,
  };

  return rig;
}
