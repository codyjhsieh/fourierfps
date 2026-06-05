// Headless runtime smoke test for the Fourier-decomposition game: boot, view the
// corrupted world, transform it, navigate the band reconstructions to the
// anomaly's band, eliminate it, and confirm the world restores + the next world
// loads. Fails on any console/page error. Drives via the DEV window.__house hook.
import pw from "/Users/codyhsieh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js";
const { chromium } = pw;

const URL = process.env.URL || "http://localhost:5173/";
const shotDir = "tools/shots";
import { mkdirSync } from "node:fs";
mkdirSync(shotDir, { recursive: true });

const errors = [];
const browser = await chromium.launch({
  executablePath:
    "/Users/codyhsieh/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-x64/chrome-headless-shell",
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--ignore-gpu-blocklist",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows"
  ]
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console.error: " + m.text());
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

const forceFrame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
const pump = async (n) => {
  for (let i = 0; i < n; i++) {
    await forceFrame();
    await page.waitForTimeout(20);
  }
};
const core = (fn, arg) => page.evaluate(fn, arg);

const waitState = async (want, label) => {
  for (let i = 0; i < 800; i++) {
    if (await core((w) => window.__house?.core?.ready && window.__house.core.state === w, want)) return;
    await forceFrame();
    await page.waitForTimeout(25);
  }
  errors.push(`world never reached state ${want}: ${label}`);
};

await page.goto(URL, { waitUntil: "networkidle" });
await page.click("#boot-start");
// ready → ~2.4s establishing shot (clean recognizable env) → reality
await waitState("reality", "world 1");
await pump(10);
await page.screenshot({ path: `${shotDir}/1-reality.png` });

await page.keyboard.down("e"); // transform → navigate frequencies
await pump(15);
await page.screenshot({ path: `${shotDir}/2-spectral-band0.png` });

const anomalyBand = await core(() => window.__house.core.anomalyBand);
for (let i = 0; i < 30; i++) {
  const b = await core(() => window.__house.core.band);
  if (b >= anomalyBand) break;
  await page.keyboard.press("r"); // step a band deeper
  await forceFrame();
}
const visible = await core(() => window.__house.core.anomalyVisible);
if (!visible) errors.push(`anomaly not visible at band ${await core(() => window.__house.core.band)} (anomalyBand ${anomalyBand})`);
await page.screenshot({ path: `${shotDir}/3-anomaly-found.png` });

// aim at the true anomaly among any decoys, then eliminate
await core(() => {
  window.__house.core.debugFocusReal();
  window.__house.core.eliminate();
});
// elimination (~1.3s) + restore + between-world flash (~1.8s) + next world worker build
for (let i = 0; i < 500; i++) {
  await forceFrame();
  await page.waitForTimeout(20);
  if (await core(() => window.__house.core.level >= 2 && window.__house.core.ready)) break;
}
const result = await core(() => ({ level: window.__house.core.level, bandCount: window.__house.core.bandCount, ready: window.__house.core.ready }));
if (result.level < 2 || !result.ready) errors.push(`did not build the next world (level ${result.level}, ready ${result.ready})`);
await page.screenshot({ path: `${shotDir}/4-next-world.png` });

// scan into world 2 (a different environment) and navigate a few bands.
// drive via the debug hook so it's not subject to async-finalize key timing.
await page.keyboard.up("e");
// wait out world 2's establishing shot until it's in reality and interactive
await waitState("reality", "world 2");
await core(() => {
  window.__house.setScanning(true);
  for (let i = 0; i < 4; i++) window.__house.core.stepBand(1);
});
await pump(50); // let the scan + palette transition settle before the shot
const w2 = await core(() => ({ name: window.__house.core.name, state: window.__house.core.state }));
const w2name = w2.name;
if (w2.state !== "spectral") errors.push(`world 2 did not enter spectral (state ${w2.state})`);
await page.screenshot({ path: `${shotDir}/5-world2-spectral.png` });

const stateLabel = await page.textContent(".hud-state");
console.log("World 2 environment:", w2name);
await browser.close();

console.log("Anomaly band:", anomalyBand, " Result:", JSON.stringify(result), " HUD:", stateLabel);
if (errors.length) {
  console.error("\n❌ Failures:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("\n✅ No runtime errors; found & eliminated the anomaly, world restored, next world loaded.");
