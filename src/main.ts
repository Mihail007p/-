import "./styles.css";
import { Game } from "./game/game";

const canvas = document.getElementById("scene") as HTMLCanvasElement;
const overlay = document.getElementById("overlay")!;
const startBtn = document.getElementById("start") as HTMLButtonElement;

const game = new Game(canvas);

function begin() {
  overlay.classList.add("fade");
  setTimeout(() => overlay.classList.add("hidden"), 500);
  game.start();
}

startBtn.addEventListener("click", begin);

// Enter also starts the game
window.addEventListener("keydown", (e) => {
  if (e.code === "Enter" && !overlay.classList.contains("hidden") && !overlay.classList.contains("fade")) {
    begin();
  }
});

// expose for debugging in the console
(window as unknown as { game: Game }).game = game;
