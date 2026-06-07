import pw from "/Users/codyhsieh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js";
const { chromium } = pw;
const shotDir = "tools/shots";
const b = await chromium.launch({
  executablePath:
    "/Users/codyhsieh/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-x64/chrome-headless-shell",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"]
});
const page = await b.newPage({ viewport: { width: 900, height: 600 } });
const ff = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
const ev = (f, a) => page.evaluate(f, a);
const pump = async (n) => { for (let i = 0; i < n; i++) { await ff(); await page.waitForTimeout(16); } };
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.click("#boot-start");
const names = ["apartment", "office-tower", "landscape", "starship", "planet"];
for (let lvl = 1; lvl <= 5; lvl++) {
  await ev((L) => { const h = window.__house; h.level = L; h.core.load(L); h.awaitingWorld = true; h.loadStarted = true; h.flashTimer = 0; }, lvl);
  for (let i = 0; i < 900; i++) { if (await ev(() => window.__house.core.ready)) break; await ff(); await page.waitForTimeout(25); }
  await pump(30); // Game finalizes the establishing cinematic
  // drop into first-person reality at the spawn
  await ev(() => {
    const h = window.__house;
    h.core.beginReality();
    h.controller.setCollider(h.core.collision);
    const sp = h.core.spawn, lk = h.core.spawnLook;
    h.controller.placeAt(sp.x, sp.z, lk.yaw, lk.pitch);
  });
  await pump(20);
  await page.screenshot({ path: `${shotDir}/reality-${lvl}-${names[lvl - 1]}.png` });
  console.log("reality", lvl, names[lvl - 1]);
}
await b.close();
