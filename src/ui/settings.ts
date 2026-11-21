import { DEFAULT_SETTINGS, type CameraSettings } from "../camera";

const STORAGE_KEY = "nd.camera.v1";

/**
 * Camera settings panel: sensitivity slider, invert Y, auto-centre.
 * Values are persisted in localStorage so a phone user tunes it once.
 */
export class Settings {
  current: CameraSettings;
  onChange: (s: CameraSettings) => void = () => {};
  private panel: HTMLElement;
  private open = false;

  constructor() {
    this.current = load();
    this.panel = document.getElementById("settings-panel")!;

    const slider = document.getElementById("sens") as HTMLInputElement;
    const sensValue = document.getElementById("sens-value")!;
    const invert = document.getElementById("invert-y") as HTMLInputElement;
    const auto = document.getElementById("auto-center") as HTMLInputElement;
    const reset = document.getElementById("settings-reset") as HTMLButtonElement;

    slider.value = String(this.current.sensitivity);
    sensValue.textContent = this.current.sensitivity.toFixed(2) + "×";
    invert.checked = this.current.invertY;
    auto.checked = this.current.autoCenter;

    slider.addEventListener("input", () => {
      this.current.sensitivity = Number(slider.value);
      sensValue.textContent = this.current.sensitivity.toFixed(2) + "×";
      this.commit();
    });
    invert.addEventListener("change", () => {
      this.current.invertY = invert.checked;
      this.commit();
    });
    auto.addEventListener("change", () => {
      this.current.autoCenter = auto.checked;
      this.commit();
    });
    reset.addEventListener("click", () => {
      this.current = { ...DEFAULT_SETTINGS };
      slider.value = String(this.current.sensitivity);
      sensValue.textContent = this.current.sensitivity.toFixed(2) + "×";
      invert.checked = this.current.invertY;
      auto.checked = this.current.autoCenter;
      this.commit();
    });

    document.getElementById("settings-close")!.addEventListener("click", () => this.hide());
  }

  private commit() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.current));
    this.onChange(this.current);
  }

  toggle() {
    this.open ? this.hide() : this.show();
  }

  get isOpen() {
    return this.open;
  }

  show() {
    this.open = true;
    this.panel.classList.add("open");
  }

  hide() {
    this.open = false;
    this.panel.classList.remove("open");
  }
}

function load(): CameraSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<CameraSettings>;
    return {
      sensitivity: clamp(Number(parsed.sensitivity ?? DEFAULT_SETTINGS.sensitivity), 0.3, 2.4),
      invertY: Boolean(parsed.invertY),
      autoCenter: parsed.autoCenter ?? DEFAULT_SETTINGS.autoCenter,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function clamp(v: number, min: number, max: number) {
  return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : DEFAULT_SETTINGS.sensitivity;
}
