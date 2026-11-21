import type * as THREE from "three";
import type { BuildingBox } from "../game/city";
import { CITY, CITY_HALF } from "../game/city";

const MAP_SCALE = 200 / (CITY_HALF * 2);

/**
 * DOM HUD: cash, wanted stars, minimap, speedometer, objective, toasts.
 */
export class Hud {
  private root = document.getElementById("hud")!;
  private cashEl = document.getElementById("cash")!;
  private starsEl = document.getElementById("stars")!;
  private clockEl = document.getElementById("clock")!;
  private objectiveTitle = document.querySelector<HTMLElement>(".objective-title")!;
  private objectiveText = document.querySelector<HTMLElement>(".objective-text")!;
  private speedo = document.getElementById("speedo")!;
  private speedEl = document.getElementById("speed")!;
  private gearEl = document.getElementById("gear")!;
  private promptEl = document.getElementById("prompt")!;
  private toastEl = document.getElementById("toast")!;
  private minimap = document.getElementById("minimap") as HTMLCanvasElement;
  private ctx = this.minimap.getContext("2d")!;

  private wanted = 0;
  private toastTimer = 0;
  private time = 23 * 60 + 40; // in-game minutes since midnight
  private shakeAmount = 0;
  private mapLayer: HTMLCanvasElement;
  private lastPrompt: string | null = null;

  constructor() {
    for (let i = 0; i < 5; i++) {
      const s = document.createElement("i");
      s.textContent = "★";
      this.starsEl.appendChild(s);
    }
    this.cashEl.textContent = "$0";
    this.mapLayer = this.bakeCityLayer();
  }

  private bakeCityLayer() {
    const c = document.createElement("canvas");
    c.width = c.height = 200;
    const g = c.getContext("2d")!;
    g.fillStyle = "rgba(6,10,16,0.9)";
    g.fillRect(0, 0, 200, 200);

    // roads
    g.strokeStyle = "rgba(60,80,105,0.85)";
    g.lineWidth = Math.max(2, 26 * MAP_SCALE);
    const lane = (v: number) => 100 + v * MAP_SCALE;
    for (let i = 0; i <= CITY.grid; i++) {
      const p = lane(-CITY_HALF + CITY.road / 2 + i * CITY.block);
      g.beginPath();
      g.moveTo(p, 0);
      g.lineTo(p, 200);
      g.stroke();
      g.beginPath();
      g.moveTo(0, p);
      g.lineTo(200, p);
      g.stroke();
    }
    return c;
  }

  show() {
    this.root.classList.remove("hidden");
  }

  setObjective(title: string, text: string) {
    this.objectiveTitle.textContent = title;
    this.objectiveText.textContent = text;
  }

  setCash(v: number) {
    this.cashEl.textContent = `$${v.toLocaleString("ru-RU")}`;
  }

  setWanted(level: number) {
    if (level === this.wanted) return;
    this.wanted = level;
    const stars = this.starsEl.querySelectorAll("i");
    stars.forEach((s, i) => s.classList.toggle("on", i < level));
  }

  setInCar(inCar: boolean) {
    this.speedo.classList.toggle("hidden", !inCar);
  }

  setSpeed(kmh: number, gear: number) {
    this.speedEl.textContent = String(Math.round(Math.abs(kmh)));
    this.gearEl.textContent = gear < 0 ? "R" : "D";
  }

  setPrompt(html: string | null) {
    if (html === this.lastPrompt) return;
    this.lastPrompt = html;
    if (!html) {
      this.promptEl.classList.add("hidden");
      return;
    }
    this.promptEl.innerHTML = html;
    this.promptEl.classList.remove("hidden");
  }

  toast(text: string) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add("show");
    this.toastTimer = 2.6;
  }

  shake(amount: number) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  drawMinimap(
    player: THREE.Vector3,
    yaw: number,
    buildings: BuildingBox[],
    carPos: THREE.Vector3 | null
  ) {
    const g = this.ctx;
    const size = 200;
    g.clearRect(0, 0, size, size);

    // rotate the map around the player: translate so player is centered
    const px = 100 + player.x * MAP_SCALE;
    const pz = 100 + player.z * MAP_SCALE;

    g.save();
    g.translate(100, 100);
    g.rotate(-yaw);
    g.scale(2.2, 2.2);
    g.translate(-px, -pz);

    g.drawImage(this.mapLayer, 0, 0);

    // building blocks
    g.fillStyle = "rgba(120,160,200,0.28)";
    for (const b of buildings) {
      const x = 100 + b.minX * MAP_SCALE;
      const y = 100 + b.minZ * MAP_SCALE;
      const w = (b.maxX - b.minX) * MAP_SCALE;
      const h = (b.maxZ - b.minZ) * MAP_SCALE;
      g.fillRect(x, y, w, h);
    }

    g.restore();

    // player arrow: always points up because the map rotates around it
    g.save();
    g.translate(100, 100);
    g.fillStyle = "#22e1ff";
    g.shadowColor = "#22e1ff";
    g.shadowBlur = 12;
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(6, 7);
    g.lineTo(0, 3);
    g.lineTo(-6, 7);
    g.closePath();
    g.fill();
    g.restore();

    // nearby car marker (map rotates with the player)
    if (carPos) {
      const dx = (carPos.x - player.x) * MAP_SCALE * 2.2;
      const dz = (carPos.z - player.z) * MAP_SCALE * 2.2;
      const cos = Math.cos(-yaw);
      const sin = Math.sin(-yaw);
      const rx = dx * cos - dz * sin;
      const ry = dx * sin + dz * cos;
      if (Math.hypot(rx, ry) < 96) {
        g.fillStyle = "#ffb545";
        g.beginPath();
        g.arc(100 + rx, 100 + ry, 3.4, 0, Math.PI * 2);
        g.fill();
      }
    }

    // vignette ring
    const grad = g.createRadialGradient(100, 100, 60, 100, 100, 104);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }

  tick(dt: number) {
    this.time = (this.time + dt * 2.2) % (24 * 60);
    const h = Math.floor(this.time / 60);
    const m = Math.floor(this.time % 60);
    this.clockEl.textContent = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove("show");
    }

    if (this.shakeAmount > 0) {
      this.shakeAmount = Math.max(0, this.shakeAmount - dt * 3);
      const s = this.shakeAmount * 6;
      this.root.style.transform = `translate(${(Math.random() - 0.5) * s}px, ${(Math.random() - 0.5) * s}px)`;
    } else if (this.root.style.transform) {
      this.root.style.transform = "";
    }
  }
}
