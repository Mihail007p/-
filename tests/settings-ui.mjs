/**
 * The gear button must really open the settings panel.
 * Reproduces the reported bug: tapping ⚙ did nothing.
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="settings-panel">
    <button id="settings-close"></button>
    <input id="sens" type="range" min="0.3" max="2.4" step="0.05" value="1">
    <output id="sens-value"></output>
    <input id="invert-y" type="checkbox">
    <input id="auto-center" type="checkbox" checked>
    <button id="settings-reset"></button>
  </div>
  <button id="settings-btn">gear</button>
  <canvas id="scene"></canvas>
</body></html>`, { url: "https://example.com/" });

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

const { Settings } = await import("../.test-build/ui/settings.js");

let fails = 0;
const check = (name, ok, info = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? "  " + info : ""}`);
};

const panel = document.getElementById("settings-panel");
const btn = document.getElementById("settings-btn");
const settings = new Settings();
settings.bind();

const click = (el) => el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

check("panel starts closed", !panel.classList.contains("open"));
click(btn);
check("click on gear opens the panel", panel.classList.contains("open"));
click(btn);
check("second click closes it", !panel.classList.contains("open"));
click(btn);
click(document.body);
check("click outside closes it", !panel.classList.contains("open"));
click(btn);
click(document.getElementById("sens"));
check("interacting inside keeps it open", panel.classList.contains("open"));

// sensitivity stays in a sane range and is persisted
const sens = document.getElementById("sens");
sens.value = "0.5";
sens.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
check("low sensitivity accepted", settings.current.sensitivity === 0.5, `= ${settings.current.sensitivity}`);
check("sensitivity persisted", localStorage.getItem("nd.camera.v1")?.includes("0.5"));

click(document.getElementById("settings-reset"));
check("reset restores defaults", settings.current.sensitivity === 1);
check("reset closes nothing / panel still usable", panel.classList.contains("open"));

// Escape key path used by main.ts
settings.hide();
check("hide() closes the panel", !panel.classList.contains("open"));

console.log(fails ? `\n${fails} FAILED` : "\nall settings UI tests passed");
process.exit(fails ? 1 : 0);
