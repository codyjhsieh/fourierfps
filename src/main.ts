import { Game } from "./app/Game";

const app = document.getElementById("app")!;
const boot = document.getElementById("boot")!;
const startBtn = document.getElementById("boot-start")!;

let game: Game | null = null;

function enter(): void {
  if (game) return;
  game = new Game(app);
  game.unlockAudio(); // inside the click gesture — required by Safari/iOS
  game.start();
  boot.classList.add("hidden");
  setTimeout(() => boot.remove(), 900);

  // Belt-and-suspenders: resume audio on the next gesture in case the context
  // started suspended (some Safari versions ignore the first resume()).
  const resume = () => game?.unlockAudio();
  window.addEventListener("pointerdown", resume, { passive: true });
  window.addEventListener("keydown", resume);
}

startBtn.addEventListener("click", enter);
