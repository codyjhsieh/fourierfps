export const meta = {
  name: "aaa-fixes",
  description: "Diagnose the flashing black square, critique screenshots at AAA standard, design level-start clarity + tame chaos, build collision/physics + deeper procedural complexity",
  phases: [
    { title: "Diagnose", detail: "multi-hypothesis bug hunt + AAA critique + fix designs (read-only)" },
    { title: "Verify", detail: "adversarially confirm the black-square root cause" },
    { title: "Spec", detail: "one locked, file-partitioned implementation spec" },
    { title: "Implement", detail: "one agent per non-reserved file against the spec" }
  ]
};

const CONTEXT = `
PROJECT: "The House That Remembers" — a first-person, fully-procedural browser game. TypeScript + Vite + Three.js (WebGL2), no external assets. Repo root is cwd; source under src/. The player is on iPhone Safari.

CORE: The world is corrupted by a hidden anomaly. You press scan to Fourier-transform it, then navigate band-limited inverse reconstructions (a real 3D-FFT partial-sum isosurface "series") to find the anomaly, eliminate it, restore the world, and descend to the next, harder, DIFFERENT environment. Endless.

ARCHITECTURE (read the files before judging):
- src/world/Archetypes.ts — 5 procedural environments (APARTMENT, OFFICE TOWER, LANDSCAPE, STARSHIP, PLANET). Each build(level,seed,n) returns a SourceField { n, data:Float32Array (n^3 density 0/1), voxel:[x,y,z], origin:[x,y,z], spawn:{x,z}, anchors:[x,y,z][], name }. archetypeForLevel cycles them.
- src/spectral/Voxelizer.ts — voxelizeLayout (apartment) + withAnomaly.
- src/spectral/SpectralCompute.ts — computeSpectralWorld(level,seed,n=64,K): builds archetype field, injects anomaly, 3D-FFTs, returns band isosurface mesh arrays (positions/indices), a clean restored mesh, anomaly+decoy markers, anomalyBand, scale, origin, spawn, name. decoyCountForLevel/bandCountForLevel scale with depth.
- src/spectral/SurfaceNets.ts — isosurface mesher (field -> mesh arrays).
- src/spectral/Fourier3D.ts — real 1D/3D FFT.
- src/spectral/spectral.worker.ts — runs computeSpectralWorld off-thread at 64^3, transfers result.
- src/spectral/SpectralCore.ts — owns one world: a band mesh (custom ShaderMaterial 'surface' with uChaos vertex displacement + hemispheric+fresnel), candidate anomaly/decoy glow meshes (AdditiveBlending ShaderMaterial), state machine loading|reality|spectral|eliminating|restored, band stepping, elimination, onSolved. Reality shows the highest noisy band with uChaos=1 (vertex waving).
- src/lens/ResonanceLens.ts — held phone; screen is a 256x320 CanvasTexture (drawScreen every frame; minFilter Linear, generateMipmaps false were just added). MeshBasicMaterial({map}).
- src/engine/PostFX.ts — EffectComposer: RenderPass + UnrealBloomPass(strength 0.3) + a custom ShaderPass "CorruptionShader" (RGB split + grain + vignette, uCorruption) last. Game calls postfx.render(dt,t) instead of renderer.render.
- src/engine/Renderer.ts — WebGLRenderer(antialias true, alpha false), scene.background Color + Fog; Game lerps background/fog color per state.
- src/app/Game.ts — orchestrator/loop: world build is async (worker); gates on core.ready; shows a deep-resonance veil + "Transforming the world…" while building; overlaps the next world's build with a 1.8s between-world flash; raycasts screen-center to focus a candidate; tune steps bands; reconstruct eliminates. Player is FirstPersonController with NO gravity (y locked to eye height 1.62) and EMPTY colliders (free-roam; no collision with the reconstruction). A flat floor plane sits at y=-0.02.
- src/player/FirstPersonController.ts — yaw/pitch look, accelerated planar move, circle-vs-AABB resolveCollisions (unused now, colliders empty), y fixed.
- src/engine/Input.ts — WASD/drag-look/touch; actions scan/tuneUp/tuneDown/phaseLeft/phaseRight/reconstruct/state1-3.
- src/ui/MobileHUD.ts — minimalist HUD: state+objective, menu, scan ring, ONE contextual tool pill; sound toggle in menu.
- src/audio/Soundscape.ts — procedural Web Audio.
- tools/smoke.mjs — headless Playwright playthrough (chrome-headless-shell); drives via DEV window.__house; screenshots to tools/shots/.

OPEN BUGS / TASKS (from the player, on iPhone Safari):
1. A glitchy BLACK SQUARE keeps flashing. The lens NPOT-mipmap fix did NOT resolve it — so look beyond the lens. Suspects to weigh: post-processing (EffectComposer/UnrealBloomPass render-target type on iOS; ShaderPass tDiffuse; missing renderToScreen/clear), the lens CanvasTexture/material/renderOrder/transparency, additive candidate meshes, NaN/Inf in a custom shader producing black fragments, the empty THREE.BufferGeometry swapped in during worker load/band change, transparent depthWrite/sort flicker. It is a SQUARE (suggests a quad/plane or a full post pass), and it FLASHES (intermittent/periodic).
2. The START of every level should make it OBVIOUS which environment it is (apartment vs office vs landscape vs starship vs planet). Right now you spawn into abstract band blobs; the place isn't legible.
3. The chaos (Reality) is TOO WAVY — the uChaos vertex displacement wobbles too much; corruption should read as corruption without nauseating waving (lean on the post-fx grade + subtle motion instead).
4. COLLISION + PHYSICS: add real collision so the player can walk on/through the reconstruction sensibly, NEVER gets stuck, with proper gravity/ground/step-up. The world is a voxel field — collide against that field (cheap, robust), not the arbitrary mesh.
5. Environments must actually get MORE COMPLEX and INTERESTING with depth (procedurally) — more structure/detail/features as levels increase, per archetype.

QUALITY BAR: AAA. Be ruthless. The current look is flat pastel blobs with weak lighting and a held phone; judge it like a shipping title art director would.
`;

const DIAG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    hypothesis: { type: "string", description: "root cause of the flashing black square" },
    evidence: { type: "string", description: "specific code paths / reasoning that support it" },
    file: { type: "string", description: "primary repo-relative file to fix" },
    fix: { type: "string", description: "concrete, minimal fix" },
    confidence: { type: "string", enum: ["high", "medium", "low"] }
  },
  required: ["hypothesis", "evidence", "file", "fix", "confidence"]
};

const DESIGN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          file: { type: "string" },
          problem: { type: "string" },
          fix: { type: "string" },
          severity: { type: "string", enum: ["high", "medium", "low"] }
        },
        required: ["title", "file", "problem", "fix", "severity"]
      }
    }
  },
  required: ["findings"]
};

const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    real: { type: "boolean" },
    reason: { type: "string" },
    refinedFix: { type: "string" }
  },
  required: ["real", "reason", "refinedFix"]
};

const SPEC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", description: "what ships, in a paragraph" },
    blackSquareRootCause: { type: "string" },
    newApis: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { file: { type: "string" }, signature: { type: "string" }, purpose: { type: "string" } },
        required: ["file", "signature", "purpose"]
      },
      description: "EXACT new/changed exported signatures so parallel implementers share one contract"
    },
    filePackets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { file: { type: "string" }, changes: { type: "string" } },
        required: ["file", "changes"]
      },
      description: "disjoint per-file change lists; new files allowed. INCLUDE src/app/Game.ts, src/engine/Input.ts, tools/smoke.mjs (main loop owns those)."
    },
    gameIntegration: { type: "string", description: "exact wiring needed in src/app/Game.ts" },
    inputChanges: { type: "string", description: "exact changes in src/engine/Input.ts (e.g., jump action)" },
    testChanges: { type: "string", description: "tests to add/update" },
    smokeChanges: { type: "string", description: "how tools/smoke.mjs must change" }
  },
  required: ["summary", "blackSquareRootCause", "newApis", "filePackets", "gameIntegration", "inputChanges", "testChanges", "smokeChanges"]
};

const IMPL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    file: { type: "string" },
    changesSummary: { type: "string" },
    conformsToContract: { type: "boolean" },
    gameWiringNeeded: { type: "string" },
    risks: { type: "string" }
  },
  required: ["file", "changesSummary", "conformsToContract", "gameWiringNeeded", "risks"]
};

// ---------------- Phase 1: Diagnose (parallel, read-only) ----------------
phase("Diagnose");
const BUG_ANGLES = [
  "POST-PROCESSING: scrutinize src/engine/PostFX.ts + how src/app/Game.ts drives it. EffectComposer render-target pixel type/colorspace on iOS Safari, UnrealBloomPass producing a black quad, ShaderPass tDiffuse binding, missing renderToScreen/clear, resize/setSize races. Could a pass output a black square that flashes?",
  "LENS: scrutinize src/lens/ResonanceLens.ts — the 256x320 CanvasTexture (drawScreen each frame, needsUpdate every frame), MeshBasicMaterial, the dark phone body/screen plane, renderOrder/transparency/depth. Could the screen plane or body flash black on iOS (texture upload race, NPOT remnants, premultiplied alpha, context loss)?",
  "SHADERS/GEOMETRY: scrutinize the custom ShaderMaterials in src/spectral/SpectralCore.ts (surface + glow) and the worker geometry swap in SpectralCore (mesh.geometry = new THREE.BufferGeometry() during load/band change). NaN/Inf vertices or normals -> black fragments; an empty/garbage geometry rendering as a black quad; AdditiveBlending edge cases; computeVertexNormals on degenerate tris.",
  "RENDER/STATE: scrutinize src/engine/Renderer.ts + Game loop ordering — scene.background/fog Color lerp, autoClear with the composer, the DeepResonance veil, transparent sort order, the floor plane, camera near/far. Anything that could intermittently render a black rectangle."
];
const diagnoses = (await parallel(
  BUG_ANGLES.map((a) => () =>
    agent(`${CONTEXT}\n\nDIAGNOSE THE FLASHING BLACK SQUARE FROM THIS ANGLE:\n${a}\n\nRead the actual code. Give your single best root-cause hypothesis for THIS angle, the evidence, and a concrete fix. Be honest about confidence. Do not edit anything.`,
      { label: `diag:${a.split(":")[0].toLowerCase()}`, phase: "Diagnose", schema: DIAG_SCHEMA, agentType: "Explore" })
  )
)).filter(Boolean);

const designAgents = [
  agent(`${CONTEXT}\n\nDESIGN: make the START of every level immediately legible as its environment (apartment/office/landscape/starship/planet). Idea space: an "establishing shot" that briefly shows the CLEAN, recognizable reconstruction (the restored/clean geometry) with the world name before it corrupts into the noisy reality; a signature camera framing/spawn per archetype; a per-archetype palette/lighting identity; a title card using the existing minimalist HUD. Keep it diegetic and within the one-tool-pill minimalist HUD. Read Game.ts + SpectralCore.ts + Archetypes.ts. Return concrete findings (file + fix). Do not edit.`,
    { label: "design:level-start", phase: "Diagnose", schema: DESIGN_SCHEMA }),
  agent(`${CONTEXT}\n\nDESIGN: the Reality "chaos" is TOO WAVY (uChaos vertex displacement in SpectralCore surface shader, currently normal*~2.0). Make corruption read as corruption WITHOUT nauseating geometry waving — e.g., greatly reduce/replace vertex displacement, shift the "wrongness" to the post-fx corruption grade (RGB split/grain/jitter) + subtle slow motion + palette, maybe a glitchy slice/displacement that's intermittent not constant. Read SpectralCore.ts + PostFX.ts. Return concrete findings (file + fix). Do not edit.`,
    { label: "design:chaos", phase: "Diagnose", schema: DESIGN_SCHEMA }),
  agent(`${CONTEXT}\n\nYou are a AAA ART DIRECTOR. Critically review the current look by READING the PNG screenshots in tools/shots/ (1-reality.png, 2-spectral-band0.png, 3-anomaly-found.png, 5-world2-spectral.png). Judge against a shipping AAA standard: lighting, material richness, silhouette/readability, composition, color, the held-lens framing, sense of place, post-processing. Be ruthless and specific. Return concrete, buildable findings (file + fix) that would raise it toward AAA WITHOUT abandoning the procedural/no-asset constraint (e.g., better lighting rig, fog/atmosphere, material depth, rim/spec, tone mapping/exposure, vignette, subtle dof, per-archetype palette). Do not edit.`,
    { label: "design:aaa-critique", phase: "Diagnose", schema: DESIGN_SCHEMA, agentType: "Explore" }),
  agent(`${CONTEXT}\n\nDESIGN: COLLISION + PHYSICS against the voxel field (NOT the mesh). Specify a robust voxel character controller: gravity, ground-follow, step-up over small ledges, wall blocking + slide, head bump, and a NEVER-STUCK guarantee (push-out/unstick from solids, valid spawn drop-to-ground, sub-stepping to avoid tunneling). Define pure helper functions (groundHeight, bodyBlocked, unstick) that take a solid(x,y,z) predicate so they're unit-testable, a CollisionField wrapper over the source density field (data,n,origin,voxel)->solidAt(world), how the field gets transferred from the worker (SpectralCompute result + transferables) into SpectralCore and handed to the controller, and a small jump. Read FirstPersonController.ts, SpectralCompute.ts, SpectralCore.ts, Voxelizer.ts, Archetypes.ts. Return concrete findings (file + fix). Do not edit.`,
    { label: "design:physics", phase: "Diagnose", schema: DESIGN_SCHEMA }),
  agent(`${CONTEXT}\n\nDESIGN: make each environment archetype get MORE COMPLEX and INTERESTING with depth (level). For each of APARTMENT/OFFICE TOWER/LANDSCAPE/STARSHIP/PLANET, specify level-scaled procedural detail (more/finer features, sub-structures, variety) that stays performant at 64^3 and reads clearly through the Fourier reconstruction. Keep deterministic (seed+level). Read Archetypes.ts. Return concrete findings (file=src/world/Archetypes.ts + fix). Do not edit.`,
    { label: "design:complexity", phase: "Diagnose", schema: DESIGN_SCHEMA })
];
const designs = (await parallel(designAgents.map((p) => () => p))).filter(Boolean);
const designFindings = designs.flatMap((d) => d.findings || []);
log(`${diagnoses.length} bug hypotheses, ${designFindings.length} design/critique findings.`);

// ---------------- Phase 2: Verify the black-square root cause ----------------
phase("Verify");
const verifications = (await parallel(
  diagnoses.map((d) => () =>
    agent(`${CONTEXT}\n\nA diagnosis of the flashing black square:\nHYPOTHESIS: ${d.hypothesis}\nFILE: ${d.file}\nEVIDENCE: ${d.evidence}\nFIX: ${d.fix}\nCONFIDENCE: ${d.confidence}\n\nAdversarially verify. Read the cited code. Is this plausibly THE cause of an intermittent black square on iOS Safari, and is the fix correct + safe? Default real=false if speculative. Give the concrete refinedFix.`,
      { label: `verify:${d.file.split("/").pop()}`, phase: "Verify", schema: VERDICT_SCHEMA })
      .then((v) => (v ? { ...d, verdict: v } : null))
  )
)).filter(Boolean);
const confirmed = verifications.filter((d) => d.verdict.real).sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.confidence] - { high: 0, medium: 1, low: 2 }[b.confidence]));
log(`${confirmed.length} black-square hypotheses confirmed plausible.`);

// ---------------- Phase 3: Spec (synthesis) ----------------
phase("Spec");
const diagText = confirmed.length
  ? confirmed.map((d) => `- (${d.confidence}) ${d.file}: ${d.hypothesis} -> ${d.verdict.refinedFix}`).join("\n")
  : diagnoses.map((d) => `- (${d.confidence}, unverified) ${d.file}: ${d.hypothesis} -> ${d.fix}`).join("\n");
const designText = designFindings.map((f) => `- [${f.severity}] ${f.file}: ${f.title} — ${f.fix}`).join("\n");
const spec = await agent(
  `${CONTEXT}\n\nCONFIRMED BLACK-SQUARE CANDIDATES:\n${diagText}\n\nDESIGN / AAA-CRITIQUE FINDINGS:\n${designText}\n\nProduce ONE LOCKED, CONCRETE implementation spec covering ALL of: (1) fix the flashing black square — pick the most-supported root cause and apply the most robust fix (it is fine to harden multiple suspects if cheap); (2) level-start environment-legibility (establishing shot of the clean recognizable place + world name); (3) tame the wavy chaos; (4) voxel collision + physics with a NEVER-STUCK guarantee (pure testable helpers + CollisionField + worker transfer + controller); (5) per-archetype complexity scaling with depth; (6) the highest-value AAA visual upgrades that are buildable procedurally (lighting/tonemapping/atmosphere/material/per-archetype palette).\nRead every file you will touch FIRST so signatures are exact. Define newApis (exact signatures shared across files). Give precise per-file filePackets, disjoint by file, new files allowed; INCLUDE packets for src/app/Game.ts, src/engine/Input.ts, and tools/smoke.mjs (the main loop owns those). Keep it strict-TypeScript-clean, performant at 64^3, and preserve the worker build + minimalist HUD. Ensure a deterministic path the headless smoke can still drive.`,
  { label: "spec:synthesis", phase: "Spec", schema: SPEC_SCHEMA }
);

// ---------------- Phase 4: Implement (parallel, one agent per non-reserved file) ----------------
phase("Implement");
const RESERVED = new Set(["src/app/Game.ts", "src/engine/Input.ts", "tools/smoke.mjs"]);
const packets = (spec.filePackets || []).filter(
  (p) => /^(src\/.*\.ts|index\.html)$/.test((p.file || "").trim()) && !RESERVED.has((p.file || "").trim())
);
const apiContract = (spec.newApis || []).map((a) => `- ${a.file}: ${a.signature}  // ${a.purpose}`).join("\n");
log(`Implementing ${packets.length} files in parallel; ${(spec.filePackets || []).length - packets.length} reserved for the main loop.`);
const implemented = (await parallel(
  packets.map((pkt) => () =>
    agent(`${CONTEXT}\n\nWe are shipping these fixes/upgrades. SUMMARY: ${spec.summary}\nBLACK-SQUARE ROOT CAUSE: ${spec.blackSquareRootCause}\n\nSHARED API CONTRACT (conform EXACTLY for anything other files import):\n${apiContract}\n\nYOU OWN EXACTLY ONE FILE: ${pkt.file}\nEDIT ONLY this file (create it if new). READ anything. Do NOT edit src/app/Game.ts, src/engine/Input.ts, tools/smoke.mjs, or any other file.\n\nIMPLEMENT precisely this for ${pkt.file}:\n${pkt.changes}\n\nRULES: strict-TypeScript-clean (strict, noUnusedLocals, noUnusedParameters; no \`any\` leaks); conform exactly to the contract; performant at 64^3; preserve the worker build + minimalist HUD + the three world states; if a new module, add a colocated *.test.ts ONLY if it is pure logic (no DOM/WebGL). Do NOT run build/dev/tests. Return the structured result.`,
      { label: `impl:${pkt.file.split("/").pop()}`, phase: "Implement", schema: IMPL_SCHEMA })
  )
)).filter(Boolean);

return {
  blackSquareRootCause: spec.blackSquareRootCause,
  confirmedHypotheses: confirmed.map((d) => ({ file: d.file, hypothesis: d.hypothesis, confidence: d.confidence })),
  allHypotheses: diagnoses.map((d) => ({ file: d.file, hypothesis: d.hypothesis, confidence: d.confidence })),
  spec: { summary: spec.summary, newApis: spec.newApis, gameIntegration: spec.gameIntegration, inputChanges: spec.inputChanges, testChanges: spec.testChanges, smokeChanges: spec.smokeChanges, filePackets: spec.filePackets },
  implemented: implemented.map((i) => ({ file: i.file, changes: i.changesSummary, conforms: i.conformsToContract, gameWiring: i.gameWiringNeeded, risks: i.risks })),
  aaaFindings: designFindings
};
