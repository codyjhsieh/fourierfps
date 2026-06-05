export const meta = {
  name: "populate-worlds",
  description: "Replace the single-isosurface 'blob' worlds with real, densely-populated procedural environments — thousands of instanced objects (furniture, props, plants, animals) placed via bird's-eye planning; keep the Fourier mechanic for the spectral view",
  phases: [
    { title: "Direction", detail: "diagnose the blob problem + AAA critique + density/perf analysis (read-only)" },
    { title: "Design", detail: "object library + bird's-eye scene planners + instanced rendering + Fourier integration" },
    { title: "Judge", detail: "score the architectures" },
    { title: "Spec", detail: "one locked, file-partitioned implementation spec" },
    { title: "Implement", detail: "one agent per non-reserved file against the spec" }
  ]
};

const CONTEXT = `
PROJECT: "The House That Remembers" — a first-person, FULLY PROCEDURAL browser game (TypeScript + Vite + Three.js, WebGL2). NO external assets — every mesh is generated from code. Deployed to GitHub Pages. Source under src/.

CORE MECHANIC (keep it): the world is corrupted by a hidden anomaly. You press scan to Fourier-transform the world, navigate band-limited inverse 3D-FFT reconstructions (an isosurface "series" that sharpens low→high), find the anomaly, eliminate it, restore the world, and descend to the next, DIFFERENT, harder environment. Endless. Five environments cycle: APARTMENT, OFFICE TOWER, LANDSCAPE, STARSHIP, PLANET.

THE PROBLEM THE PLAYER REPORTED (this is the #1 priority):
"All the environments look like one-piece blobs. The hope is that they're real environments with thousands of objects, furniture, animals, etc. in them."
Root cause: the current pipeline voxelizes a scene into ONE density field (src/world/Archetypes.ts builds an N^3 field from a solidity predicate), then surface-nets it into ONE fused isosurface mesh (src/spectral/SurfaceNets.ts), shown for BOTH Reality and the spectral bands. So Reality is a single blobby shell — never a populated place.

THE TARGET ARCHITECTURE (design + build this):
A bird's-eye-view SCENE PLAN per environment drives TWO outputs:
  (1) REALITY = a real, densely-populated place: thousands of DISCRETE procedural objects (furniture, props, plants, animals, debris, architectural detail) rendered with THREE.InstancedMesh for performance, placed INTENTIONALLY by the plan (rooms get furniture sets; landscapes get forests/rocks/animal herds; office gets desk grids + plants; starship gets consoles/crates/pipes; planet gets surface flora/rocks/structures).
  (2) SPECTRAL = the existing Fourier view: the SAME plan is voxelized into the N^3 density field, FFT'd, and shown as the band-isosurface series. So the spectral reconstruction reflects the real layout, and the abstract blob now lives ONLY where it belongs (the frequency view), not in Reality.
So: ScenePlan -> { instanced objects for Reality, voxel field for spectral FFT }. Pressing scan crossfades Reality(objects) -> Spectral(isosurface). The anomaly is one foreign object among thousands.

CURRENT FILES (read before judging):
- src/world/Archetypes.ts — SourceField{n,data,voxel,origin,spawn,look,anchors,name}; archetypeForLevel cycles 5; each build(level,seed,n) fills a density field by predicate. This is what produces the blob; it must be reworked to a bird's-eye plan that emits BOTH a populated object list AND the density field.
- src/world/ProceduralProps.ts — existing procedural furniture (sofa/table/lamp/plant/bookshelf/chair/etc.) from primitives — REUSE/EXTEND as the object library.
- src/world/{ProceduralRoom,Materials,Geometry,Palette,LayoutGen}.ts — pastel materials, wobble/outline helpers, room layout (apartment floorplan via accretion), palette.
- src/spectral/Voxelizer.ts — voxelizeLayout (apartment) + withAnomaly. The new plan->field voxelization lives here or a new module.
- src/spectral/SpectralCompute.ts (+ spectral.worker.ts) — runs the 64^3 FFT off-thread, returns band isosurface mesh arrays + clean + anomaly/decoys + solid field for collision. computeSpectralWorld(level,seed,n,K). It builds the archetype field today; it must accept/produce the plan-derived field.
- src/spectral/SpectralCore.ts — owns the world: band mesh + candidate anomaly meshes + state machine loading|establishing|reality|spectral|eliminating|restored + per-archetype palettes + bounds()/collision. Reality currently shows the highest noisy band (the blob). It must instead show the populated scene group in Reality and the isosurface in spectral, crossfading.
- src/player/FirstPersonController.ts + VoxelCollision.ts + CollisionField — voxel physics; collide against the density field (so collision stays registered with the spectral view AND walkable through the populated Reality).
- src/app/Game.ts — orchestrator/loop; cinematic establishing shot frames the structure; gates scan on ready; worker build is async.

CONSTRAINTS: fully procedural, no assets. Pastel hand-drawn style (see Palette/Materials). Must hit ~60fps on desktop / ~45 on mobile — so thousands of objects MUST use InstancedMesh (one draw call per object type) + frustum culling + LOD/cap by distance; do not create thousands of individual Meshes. Keep the 64^3 worker FFT. Keep the minimalist HUD. Keep determinism (seed+level). Deterministic enough that a headless smoke can still drive it.

GOAL: each environment becomes a recognizable, BUSY, populated place full of distinct objects (and a few simple procedural "animals"/creatures with light motion), planned from a detailed bird's-eye view, while the Fourier transform/decomposition mechanic is preserved for the spectral hunt.
`;

const DIR_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    findings: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: {
        title: { type: "string" },
        area: { type: "string", description: "blob-cause | reality-population | instancing-perf | bird-eye-planning | fourier-integration | aaa-look | animals" },
        insight: { type: "string" },
        recommendation: { type: "string" },
        severity: { type: "string", enum: ["high", "medium", "low"] }
      },
      required: ["title", "area", "insight", "recommendation", "severity"]
    } }
  },
  required: ["findings"]
};

const DESIGN_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    name: { type: "string" },
    pitch: { type: "string" },
    objectLibrary: { type: "string", description: "categories of procedural objects + how each is built from primitives + variety + how animals move" },
    birdsEyePlanner: { type: "string", description: "the ScenePlan abstraction + per-archetype planners that place thousands of objects intentionally from a top-down plan; how it scales with level" },
    instancing: { type: "string", description: "InstancedMesh architecture, per-type batching, culling/LOD, the object-count budget that holds 60fps" },
    fourierIntegration: { type: "string", description: "how the SAME plan yields BOTH the instanced Reality scene AND the voxel density field for the spectral FFT; how Reality<->spectral crossfades; how collision works" },
    changes: { type: "array", items: { type: "object", additionalProperties: false, properties: { file: { type: "string" }, nature: { type: "string" } }, required: ["file", "nature"] } },
    risks: { type: "string" }
  },
  required: ["name", "pitch", "objectLibrary", "birdsEyePlanner", "instancing", "fourierIntegration", "changes", "risks"]
};

const SCORE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { score: { type: "number" }, reason: { type: "string" }, biggestRisk: { type: "string" } },
  required: ["score", "reason", "biggestRisk"]
};

const SPEC_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    summary: { type: "string", description: "the shipped system in a paragraph" },
    newApis: { type: "array", items: { type: "object", additionalProperties: false, properties: { file: { type: "string" }, signature: { type: "string" }, purpose: { type: "string" } }, required: ["file", "signature", "purpose"] }, description: "EXACT shared signatures so parallel implementers conform" },
    filePackets: { type: "array", items: { type: "object", additionalProperties: false, properties: { file: { type: "string" }, changes: { type: "string" } }, required: ["file", "changes"] }, description: "disjoint per-file change lists; new files allowed; <= 14 packets; INCLUDE src/app/Game.ts, src/engine/Input.ts, tools/smoke.mjs (main loop owns those)" },
    gameIntegration: { type: "string" },
    perfBudget: { type: "string", description: "concrete object-count caps + instancing plan that holds framerate" },
    testChanges: { type: "string" },
    smokeChanges: { type: "string" }
  },
  required: ["summary", "newApis", "filePackets", "gameIntegration", "perfBudget", "testChanges", "smokeChanges"]
};

const IMPL_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { file: { type: "string" }, changesSummary: { type: "string" }, conformsToContract: { type: "boolean" }, gameWiringNeeded: { type: "string" }, risks: { type: "string" } },
  required: ["file", "changesSummary", "conformsToContract", "gameWiringNeeded", "risks"]
};

// ---------------- Phase 1: Direction ----------------
phase("Direction");
const ANGLES = [
  "BLOB CAUSE + FOURIER INTEGRATION: read Archetypes.ts, SpectralCompute.ts, SpectralCore.ts, SurfaceNets.ts. Pin down exactly why Reality is a single fused blob, and specify how to split the pipeline so a bird's-eye ScenePlan yields BOTH (a) an instanced populated Reality scene and (b) the voxel field for the spectral isosurface FFT — with a clean Reality<->spectral crossfade and collision still working.",
  "REALITY POPULATION + OBJECT LIBRARY: read ProceduralProps.ts, Materials.ts, Geometry.ts, Palette.ts. Specify a procedural object library (furniture, props, plants, debris, architectural detail, simple animated animals/creatures) built from primitives in the pastel style, with enough variety to make each of the 5 environments feel like a real busy place with THOUSANDS of objects.",
  "INSTANCING + PERFORMANCE: how to render thousands of objects at 60fps with THREE.InstancedMesh (one draw call per object type), per-type batching, frustum/distance culling, LOD, and a concrete object-count budget. Identify the perf ceiling and how to stay under it alongside the 64^3 worker FFT.",
  "BIRD'S-EYE PLANNING + LEVEL DESIGN: design the detailed top-down ScenePlan abstraction and per-archetype planners that place objects INTENTIONALLY (apartment furniture layouts per room; office desk grids/meeting rooms/plants; landscape forests/rivers/rock fields/animal herds; starship corridors with consoles/crates/pipes; planet surface biomes/flora/structures) — connected, walkable, varied, and scaling richer with level.",
  "AAA LOOK: read the screenshots in tools/shots/ (env-1..5-establishing.png, env-1..5-spectral.png). Critique against a AAA bar now that worlds will be populated — lighting, density, composition, silhouette variety, materials, color identity per environment — and give concrete, procedural, buildable recommendations."
];
const dir = (await parallel(ANGLES.map((a) => () =>
  agent(`${CONTEXT}\n\nDIRECTION ANGLE:\n${a}\n\nRead the actual code/screenshots. Return concrete, defensible findings with specific recommendations. Do not edit anything.`,
    { label: `dir:${a.split(":")[0].slice(0, 18).toLowerCase()}`, phase: "Direction", schema: DIR_SCHEMA, agentType: "Explore" })
))).filter(Boolean);
const dirText = dir.flatMap((d) => d.findings || []).map((f) => `- [${f.severity}] (${f.area}) ${f.title}: ${f.recommendation}`).join("\n");
log(`${dir.flatMap((d) => d.findings || []).length} direction findings.`);

// ---------------- Phase 2: Design ----------------
phase("Design");
const SEEDS = [
  "MAXIMALIST INSTANCED POPULATION: a large object library + per-archetype planners that scatter many thousands of instanced objects; the voxel field is derived by rasterizing the placed objects. Lean into density.",
  "ROOM/ZONE TEMPLATE PLANNING: bird's-eye plan decomposes each environment into zones/rooms/biomes, each filled from authored-feeling procedural templates (furniture sets, forest patches, console banks) — intentional, legible layouts, scaling richer with level.",
  "ECOSYSTEM/SCATTER SYSTEM: a general weighted scatter/Poisson-disk placement over a planned heightmap+zone-mask, with object palettes per zone and a few simple animated creatures; unifies all 5 archetypes under one populate engine."
];
const designs = (await parallel(SEEDS.map((seed, i) => () =>
  agent(`${CONTEXT}\n\nDIRECTION FINDINGS:\n${dirText}\n\nDESIGN the populate-the-worlds system. Philosophy seed: ${seed}\n\nMake it concrete and buildable on THIS codebase: the object library, the bird's-eye ScenePlan + per-archetype planners, the InstancedMesh rendering + perf budget, and how the SAME plan yields both the populated Reality scene and the voxel field for the spectral FFT (preserving the Fourier mechanic + collision). List the files you'd change/add. Variant #${i + 1}. Do not edit.`,
    { label: `design:v${i + 1}`, phase: "Design", schema: DESIGN_SCHEMA })
))).filter(Boolean);
log(`${designs.length} architectures.`);

// ---------------- Phase 3: Judge ----------------
phase("Judge");
const LENSES = [
  "POPULATION & FEEL: does it actually make each world a real, busy place with thousands of distinct objects + a little life (animals)? Punish anything that stays blobby/sparse.",
  "PERFORMANCE: will it truly hold 60fps with instancing alongside the worker FFT? Punish per-object Meshes or unbounded counts.",
  "FOURIER INTEGRATION: does the SAME plan cleanly feed both the populated Reality and the spectral voxel FFT, with a good crossfade + working collision, preserving the core mechanic?",
  "BUILDABILITY: realistic to implement on this exact codebase without a rewrite; reuses ProceduralProps/Materials; deterministic; headless-drivable."
];
const scored = (await parallel(designs.map((d) => () =>
  parallel(LENSES.map((L) => () =>
    agent(`${CONTEXT}\n\nScore this design on ONE lens.\nLENS: ${L}\n\nDESIGN "${d.name}":\n${d.pitch}\nLIBRARY: ${d.objectLibrary}\nPLANNER: ${d.birdsEyePlanner}\nINSTANCING: ${d.instancing}\nFOURIER: ${d.fourierIntegration}\nRISKS: ${d.risks}\n\nReturn a 0-10 score with reasoning.`,
      { label: `judge:${d.name.slice(0, 14)}`, phase: "Judge", schema: SCORE_SCHEMA })))
    .then((xs) => { const v = xs.filter(Boolean); return { design: d, avg: v.length ? v.reduce((a, s) => a + s.score, 0) / v.length : 0 }; })
))).filter(Boolean);
const ranked = scored.sort((a, b) => b.avg - a.avg);
for (const r of ranked) log(`  ${r.avg.toFixed(1)}  ${r.design.name}`);
const winner = ranked[0];
const runnersUp = ranked.slice(1);

// ---------------- Phase 4: Spec ----------------
phase("Spec");
const spec = await agent(
  `${CONTEXT}\n\nWINNING ARCHITECTURE "${winner.design.name}":\n${winner.design.pitch}\nLIBRARY: ${winner.design.objectLibrary}\nPLANNER: ${winner.design.birdsEyePlanner}\nINSTANCING: ${winner.design.instancing}\nFOURIER: ${winner.design.fourierIntegration}\n\nGRAFT the best ideas from runners-up where cheap: ${runnersUp.map((r) => r.design.name + " (" + r.design.pitch.slice(0, 80) + ")").join("; ")}\n\nProduce ONE LOCKED, CONCRETE, BUILDABLE implementation spec. BE CONCISE AND DECISIVE — do not over-explore. Read ONLY the files you will actually touch first so signatures are exact. Define newApis (exact shared signatures). Give precise per-file filePackets, disjoint by file, NEW FILES ALLOWED, at most 14 packets; INCLUDE packets for src/app/Game.ts, src/engine/Input.ts and tools/smoke.mjs (the main loop owns those). Keep it strict-TypeScript-clean, deterministic, instanced/perf-safe, and preserve the worker FFT + minimalist HUD + the Reality/spectral/establishing states + collision. Return the structured spec.`,
  { label: "spec:synthesis", phase: "Spec", schema: SPEC_SCHEMA }
);

// ---------------- Phase 5: Implement ----------------
phase("Implement");
const RESERVED = new Set(["src/app/Game.ts", "src/engine/Input.ts", "tools/smoke.mjs"]);
const packets = (spec.filePackets || []).filter((p) => /^(src\/.*\.ts|index\.html)$/.test((p.file || "").trim()) && !RESERVED.has((p.file || "").trim()));
const apiContract = (spec.newApis || []).map((a) => `- ${a.file}: ${a.signature}  // ${a.purpose}`).join("\n");
log(`Implementing ${packets.length} files in parallel; ${(spec.filePackets || []).length - packets.length} reserved for the main loop.`);
const implemented = (await parallel(packets.map((pkt) => () =>
  agent(`${CONTEXT}\n\nWe are building the populate-the-worlds system. SUMMARY: ${spec.summary}\nPERF BUDGET: ${spec.perfBudget}\n\nSHARED API CONTRACT (conform EXACTLY for anything other files import):\n${apiContract}\n\nYOU OWN EXACTLY ONE FILE: ${pkt.file}\nEDIT ONLY this file (create it if new). READ anything. Do NOT edit src/app/Game.ts, src/engine/Input.ts, tools/smoke.mjs, or any other file.\n\nIMPLEMENT precisely this for ${pkt.file}:\n${pkt.changes}\n\nRULES: strict-TypeScript-clean (strict, noUnusedLocals, noUnusedParameters; no \`any\` leaks); conform exactly to the contract; thousands of objects MUST use THREE.InstancedMesh with frustum/distance culling (never per-object Meshes); deterministic (seed+level); pastel/no-asset style; preserve the worker FFT + minimalist HUD; if a new pure module, add a colocated *.test.ts (no DOM/WebGL). Do NOT run build/dev/tests. Return the structured result.`,
    { label: `impl:${pkt.file.split("/").pop()}`, phase: "Implement", schema: IMPL_SCHEMA })
))).filter(Boolean);

return {
  winner: winner.design.name,
  ranking: ranked.map((r) => ({ name: r.design.name, score: Number(r.avg.toFixed(2)) })),
  directionFindings: dir.flatMap((d) => d.findings || []),
  spec: { summary: spec.summary, newApis: spec.newApis, gameIntegration: spec.gameIntegration, perfBudget: spec.perfBudget, testChanges: spec.testChanges, smokeChanges: spec.smokeChanges, filePackets: spec.filePackets },
  implemented: implemented.map((i) => ({ file: i.file, changes: i.changesSummary, conforms: i.conformsToContract, gameWiring: i.gameWiringNeeded, risks: i.risks }))
};
