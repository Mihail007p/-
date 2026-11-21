import { CITY_HALF, LAYOUT, roadCenter } from "../world/layout";

const MAP_PX = 168;

/**
 * Minimal HUD for the world stage: location caption, compass, minimap.
 * Kept intentionally small — gameplay UI comes with the next milestones.
 */
export class Hud {
  private root = document.getElementById("hud")!;
  private mapCanvas = document.getElementById("minimap") as HTMLCanvasElement;
  private ctx = this.mapCanvas.getContext("2d")!;
  private compass = document.getElementById("compass")!;
  private place = document.getElementById("place")!;
  private baseMap: HTMLCanvasElement;

  constructor() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.mapCanvas.width = MAP_PX * dpr;
    this.mapCanvas.height = MAP_PX * dpr;
    this.mapCanvas.style.width = `${MAP_PX}px`;
    this.mapCanvas.style.height = `${MAP_PX}px`;
    this.ctx.scale(dpr, dpr);
    this.baseMap = this.bakeMap();
  }

  show() {
    this.root.classList.remove("hidden");
    document.getElementById("touch-ui")!.classList.remove("hidden");
  }

  /** Static layer: roads and blocks, drawn once. */
  private bakeMap() {
    const S = 512;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d")!;
    g.fillStyle = "#3f4a3a";
    g.fillRect(0, 0, S, S);

    const scale = S / (CITY_HALF * 2);
    const toPx = (v: number) => (v + CITY_HALF) * scale;

    // roads
    g.fillStyle = "#6b6b68";
    for (let i = 0; i <= LAYOUT.blocks; i++) {
      const c0 = toPx(roadCenter(i) - LAYOUT.road / 2);
      const w = LAYOUT.road * scale;
      g.fillRect(c0, 0, w, S);
      g.fillRect(0, c0, S, w);
    }

    // block fills (parks lighter)
    g.fillStyle = "#4c5a44";
    for (let bx = 0; bx < LAYOUT.blocks; bx++) {
      for (let bz = 0; bz < LAYOUT.blocks; bz++) {
        const x = toPx(roadCenter(bx) + LAYOUT.road / 2);
        const z = toPx(roadCenter(bz) + LAYOUT.road / 2);
        const s = LAYOUT.block * scale;
        g.fillStyle = (bx * 7 + bz * 5) % 11 === 3 ? "#5c7a4c" : "#7d7a74";
        g.fillRect(x, z, s, s);
      }
    }
    return c;
  }

  draw(playerX: number, playerZ: number, heading: number) {
    const g = this.ctx;
    const S = MAP_PX;
    const scale = S / 150; // show ~150m around the player

    g.clearRect(0, 0, S, S);
    g.save();
    // circular clip
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = "#2f3830";
    g.fillRect(0, 0, S, S);

    g.translate(S / 2, S / 2);
    // rotate the world so "forward" is up
    g.rotate(heading);
    g.scale(scale, scale);
    g.translate(-playerX, -playerZ);

    const mapSize = CITY_HALF * 2;
    g.drawImage(this.baseMap, -CITY_HALF, -CITY_HALF, mapSize, mapSize);
    g.restore();

    // player arrow
    g.save();
    g.translate(S / 2, S / 2);
    g.fillStyle = "#ffd54a";
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5.5, 6);
    g.lineTo(0, 3);
    g.lineTo(-5.5, 6);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();

    // north marker
    const nx = S / 2 + Math.sin(heading) * (S / 2 - 12);
    const ny = S / 2 - Math.cos(heading) * (S / 2 - 12);
    g.fillStyle = "#e8eef2";
    g.font = "700 10px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("N", nx, ny);

    // compass ticker
    const deg = ((-heading * 180) / Math.PI + 360) % 360;
    const dirs = ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"];
    this.compass.textContent = dirs[Math.round(deg / 45) % 8];

    this.place.textContent = this.placeName(playerX, playerZ);
  }

  private placeName(x: number, z: number) {
    const park = Math.abs(x) < 20 && Math.abs(z) < 40;
    if (park) return "Центральный проспект";
    if (Math.abs(x) > CITY_HALF * 0.62 || Math.abs(z) > CITY_HALF * 0.62) return "Окраина · Ист-сайд";
    if (z> 0 && x > 0) return "Северный квартал";
    if (z < 0 && x > 0) return "Деловой район";
    if (z < 0 && x < 0) return "Старый город";
    return "Портовая сторона";
  }
}
