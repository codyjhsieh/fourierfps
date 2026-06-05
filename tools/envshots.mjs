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
const pump = async (n) => {
  for (let i = 0; i < n; i++) {
    await ff();
    await page.waitForTimeout(18);
  }
};
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.click("#boot-start");
for (let lvl = 1; lvl <= 5; lvl++) {
  await ev((L) => {
    const h = window.__house;
    h.level = L;
    h.core.load(L);
    h.awaitingWorld = true;
    h.loadStarted = true;
    h.flashTimer = 0;
  }, lvl);
  for (let i = 0; i < 900; i++) {
    if (await ev(() => window.__house.core.ready)) break;
    await ff();
    await page.waitForTimeout(25);
  }
  await pump(30); // Game finalizes → establishing cinematic pose
  const name = await ev(() => window.__house.core.name);
  await page.screenshot({ path: `${shotDir}/env-${lvl}-establishing.png` });
  await ev(() => {
    const h = window.__house;
    h.core.beginReality();
    h.controller.setCollider(h.core.collision);
    const sp = h.core.spawn;
    const lk = h.core.spawnLook;
    h.controller.placeAt(sp.x, sp.z, lk.yaw, lk.pitch);
    h.setScanning(true);
    const m = Math.floor(h.core.bandCount / 2);
    for (let i = 0; i < m; i++) h.core.stepBand(1);
  });
  await pump(45);
  await page.screenshot({ path: `${shotDir}/env-${lvl}-spectral.png` });
  console.log("level", lvl, "=", name);
}
await b.close();
