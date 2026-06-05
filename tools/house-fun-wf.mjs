export const meta = {
  name: 'house-make-it-fun',
  description: 'Critically playtest "The House That Remembers" and redesign the puzzle to be genuinely fun — critique, diverse designs, judge panel, locked spec, parallel implementation',
  phases: [
    { title: 'Critique', detail: 'harsh multi-persona playtest of the current puzzle' },
    { title: 'Design', detail: 'diverse independent fun-redesign proposals' },
    { title: 'Judge', detail: 'adversarial panel scores each design' },
    { title: 'Spec', detail: 'synthesize one locked, file-partitioned implementation spec' },
    { title: 'Implement', detail: 'one agent per non-Game file against the spec' }
  ]
}

const CONTEXT = `
PROJECT: "The House That Remembers" — first-person, fully-procedural browser game. TypeScript + Vite + Three.js (WebGL2). All geometry generated in code; no Unity, no assets. Repo root is cwd; source under src/. Run nothing that mutates unless you are an implementer.

PREMISE: a pastel hand-drawn apartment. The player holds a "Resonance Lens" (a procedural phone/scanner, its screen is a live CanvasTexture). Three states: Reality -> Frequency Ghosts (spectral ribbons + resonance node fade in) -> Deep Resonance (reality dissolves into abstract frequency architecture). Fourier ops are framed physically: Tune=band-pass, Isolate=noise suppression, Shift=phase alignment, Reconstruct=inverse transform. A real 3D FFT (Fourier3D.ts / SpectralVolume.ts) runs on a local volume; its dominant band currently drives the puzzle.

THE CURRENT PUZZLE — AND WHY IT IS NOT FUN (treat this as established; verify in code, then go deeper):
Flow: spawn facing the hallway -> tap the scan ring (enter Frequency Ghosts) -> a contextual "tool pill" shows a band selector LOW/MID/HIGH/FINE via < > -> tune to the resonant band -> the pill becomes a phase drag-track -> drag the dot into the lock zone -> the pill becomes RECONSTRUCT -> tap -> a ghost staircase becomes solid -> auto-transition to Deep Resonance -> objective reads "The house remembers." END.
Critical flaws: (1) the band selector STARTS on MID, the correct answer, so "tuning" is often a no-op; (2) the phase track literally draws a violet tolerance zone + lock tick AT the target, so "shift" is just "drag the dot onto the marked spot"; (3) exactly ONE node, ONE correct answer, ZERO branching; (4) the player NEVER MOVES or explores — solved standing still; (5) the real FFT is invisible — the player never perceives frequency/space/structure, so "Fourier" is pure flavor; (6) no failure, no stakes, no consequence, no surprise, no escalation; (7) total solve time ~10s, no skill. It is a guided tutorial, not a puzzle.

DESIGN NON-NEGOTIABLES (must hold in any redesign): no raw FFT graph / no numbers shown to the player (use words/spatial/visual feedback); extreme-minimalist mobile HUD — only state+objective (top-left), menu glyph (bottom-left), scan ring (bottom-center), and ONE contextual tool pill while scanning (do NOT add more persistent chrome); first-person only; no neon sci-fi, no photorealism, no particle spam; must feel like a hand-drawn pastel memory; the Fourier concepts must stay MECHANICALLY REAL (the FFT must actually drive what the player perceives/does). Controls today: desktop WASD+drag-look+E/Q/R/Z/X/F; mobile left-thumb move, right-drag look, scan-ring tap, tool-pill tap/drag.
SCOPE: a focused, buildable upgrade on THIS codebase (hours-to-a-day), not a new genre. Reuse MemoryVein/ResonanceNode/HarmonicBridge/NoiseField/DeepResonance/SpectralVolume/Fourier3D where possible.

KEY FILES: src/app/Game.ts (orchestrator+loop+wiring), src/puzzles/HiddenStairPuzzle.ts (puzzle state machine), src/lens/ResonanceLens.ts (held device + canvas screen), src/ui/MobileHUD.ts (HUD + tool pill), src/engine/Input.ts, src/player/FirstPersonController.ts, src/world/Apartment.ts (rooms+props), src/spectral/{SpectralVolume,Fourier3D,ResonanceNode,MemoryVein,HarmonicBridge,NoiseField,DeepResonance,WorldState}.ts. Tests: src/spectral/Fourier3D.test.ts, src/puzzles/HiddenStairPuzzle.test.ts. Headless playthrough: tools/smoke.mjs.
`

const CRITIQUE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    persona: { type: 'string' },
    verdict: { type: 'string', description: 'one brutal sentence on how fun the current puzzle is' },
    problems: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: { title: { type: 'string' }, whyNotFun: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'high', 'medium'] } },
      required: ['title', 'whyNotFun', 'severity'] } },
    cravings: { type: 'array', items: { type: 'string' }, description: 'what this player WANTS the puzzle to make them feel/do' }
  },
  required: ['persona', 'verdict', 'problems', 'cravings']
}

const DESIGN_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    name: { type: 'string' },
    pitch: { type: 'string', description: 'one paragraph: the fun fantasy and the core loop' },
    coreLoop: { type: 'array', items: { type: 'string' } },
    funThesis: { type: 'string', description: 'WHY this is fun — the moment of mastery/discovery/surprise' },
    keepsFourierReal: { type: 'string', description: 'exactly how the FFT/spectral data drives perception or action' },
    usesExploration: { type: 'boolean' },
    difficultyCurve: { type: 'string' },
    failAndStakes: { type: 'string' },
    changes: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: { file: { type: 'string' }, nature: { type: 'string' } }, required: ['file', 'nature'] } },
    risks: { type: 'string' },
    constraintCheck: { type: 'string', description: 'confirm it respects every non-negotiable, or call out tension' }
  },
  required: ['name', 'pitch', 'coreLoop', 'funThesis', 'keepsFourierReal', 'usesExploration', 'difficultyCurve', 'failAndStakes', 'changes', 'risks', 'constraintCheck']
}

const SCORE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    score: { type: 'number', description: '0-10 on this lens' },
    reason: { type: 'string' },
    biggestRisk: { type: 'string' }
  },
  required: ['score', 'reason', 'biggestRisk']
}

const SPEC_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    chosenDesign: { type: 'string' },
    summary: { type: 'string', description: 'the final fun puzzle in 1 paragraph, start to finish' },
    newApis: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: { file: { type: 'string' }, signature: { type: 'string' }, purpose: { type: 'string' } },
      required: ['file', 'signature', 'purpose'] }, description: 'EXACT new/changed exported signatures so parallel implementers share one contract' },
    filePackets: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: { file: { type: 'string' }, changes: { type: 'string' } }, required: ['file', 'changes'] },
      description: 'disjoint per-file work; new files allowed. INCLUDE packets for src/app/Game.ts, the test, and tools/smoke.mjs (main loop owns those).' },
    gameIntegration: { type: 'string', description: 'exact wiring needed in src/app/Game.ts' },
    testChanges: { type: 'string', description: 'how the puzzle test (and any new tests) must change' },
    smokeChanges: { type: 'string', description: 'how tools/smoke.mjs must change to drive the new puzzle end-to-end' }
  },
  required: ['chosenDesign', 'summary', 'newApis', 'filePackets', 'gameIntegration', 'testChanges', 'smokeChanges']
}

const IMPL_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    file: { type: 'string' },
    changesSummary: { type: 'string' },
    conformsToContract: { type: 'boolean' },
    gameWiringNeeded: { type: 'string' },
    risks: { type: 'string' }
  },
  required: ['file', 'changesSummary', 'conformsToContract', 'gameWiringNeeded', 'risks']
}

// ---------------- Phase 1: Critique ----------------
phase('Critique')
const PERSONAS = [
  'Speedrunner — finds the shortest path and exposes trivial / no-op steps.',
  'First-time confused player — gets lost, misreads the lens/HUD, needs the fun to be legible.',
  'Puzzle connoisseur — craves depth, deduction, a real "aha"; hates being led by the hand.',
  'Vibes / narrative player — here for mood and memory; bored by mechanics that do not pay off emotionally.',
  'Mobile player — thumbs only; judges whether the fun survives touch controls and the minimalist HUD.'
]
const critiques = (await parallel(PERSONAS.map((p) => () =>
  agent(`${CONTEXT}\n\nYou are PLAYTESTING AS: ${p}\nBe ruthless and specific. Read the actual code (Game.ts, HiddenStairPuzzle.ts, ResonanceLens.ts, MobileHUD.ts) and mentally play the current puzzle to completion. Do NOT be polite. Catalogue exactly why it fails to be fun for your persona and what you crave instead. Do not edit anything.`,
    { label: `critique:${p.split(' ')[0]}`, phase: 'Critique', schema: CRITIQUE_SCHEMA, agentType: 'Explore' })
))).filter(Boolean)
const critiqueDigest = critiques.map((c) => `### ${c.persona}\nVERDICT: ${c.verdict}\nPROBLEMS: ${c.problems.map((p) => `[${p.severity}] ${p.title} — ${p.whyNotFun}`).join(' | ')}\nCRAVES: ${c.cravings.join('; ')}`).join('\n\n')
log(`${critiques.length} critiques collected.`)

// ---------------- Phase 2: Design ----------------
phase('Design')
const SEEDS = [
  'SPATIAL SIGNAL-HUNT: the lens is a real instrument — scanning shows signal strength/orientation that changes with where you stand and look, so you physically sweep the apartment to localize hidden resonances (hot/cold). No on-screen target marker. The loudest FFT band depends on location.',
  'MULTI-NODE HARMONY: several resonance nodes, each in a different FFT band and a different room; tune+align each, and only the right COMBINATION (a chord / constructive interference) reconstructs the stair. Wrong combos read as dissonance.',
  'INTERFERENCE & MISDIRECTION: decoy signals plus a real one; the noise field actively obscures; Isolate becomes a genuine skill (clear noise to tell true resonance from false), with a wrong-reconstruct consequence.',
  'LAYERED RECONSTRUCTION: reconstruct fragments in the correct ORDER; each reconstruction physically reshapes the apartment and reveals/unlocks the next clue, escalating toward Deep Resonance.',
  'PHASE-AS-PARALLAX: alignment is spatial, not a slider — you move/look so two offset ghost-halves of a structure visually overlap in 3D (parallax), then reconstruct. Shift becomes embodied.',
  'RESONANCE SWEEP (timing): the resonant band slowly sweeps/rings; you must catch and lock it as it passes the true frequency, combining tuning with light timing — tense but not twitchy.'
]
const designs = (await parallel(SEEDS.map((seed, i) => () =>
  agent(`${CONTEXT}\n\nPLAYTESTER CRITIQUES TO ADDRESS:\n${critiqueDigest}\n\nDESIGN A FUN REDESIGN OF THE PUZZLE. Your assigned philosophy seed (build from it, make it concrete and yours):\n${seed}\n\nProduce a buildable design for THIS codebase that directly fixes the critiqued flaws (triviality, no exploration, invisible FFT, no stakes, one answer). It MUST respect every non-negotiable. Be concrete about the core loop, the moment of fun, how the FFT genuinely drives perception/action, difficulty curve, and which files change and how. Read the relevant code first. Do not edit anything. (Variant #${i + 1}.)`,
    { label: `design:${seed.split(':')[0].toLowerCase().slice(0, 16)}`, phase: 'Design', schema: DESIGN_SCHEMA })
))).filter(Boolean)
log(`${designs.length} candidate designs generated. Judging…`)

// ---------------- Phase 3: Judge ----------------
phase('Judge')
const LENSES = [
  { key: 'fun-depth', q: 'FUN & DEPTH: does it create real mastery/discovery/surprise and reward skill? Punish triviality and hand-holding hard.' },
  { key: 'feasibility', q: 'FEASIBILITY on this exact Three.js codebase in ~a day: are the file changes realistic and low-risk? Punish vague magic.' },
  { key: 'constraints', q: 'CONSTRAINT FIT: minimalist HUD (one tool pill), no numbers/graphs, first-person, pastel memory, FFT mechanically real. Punish any violation.' },
  { key: 'coherence', q: 'COHERENCE & THEME: does it feel like altering a remembered house via its hidden frequencies, legibly, start to finish?' }
]
const scored = (await parallel(designs.map((d) => () =>
  parallel(LENSES.map((L) => () =>
    agent(`${CONTEXT}\n\nScore this design on ONE lens only.\nLENS — ${L.q}\n\nDESIGN "${d.name}":\nPITCH: ${d.pitch}\nCORE LOOP: ${d.coreLoop.join(' -> ')}\nFUN THESIS: ${d.funThesis}\nFOURIER-REAL: ${d.keepsFourierReal}\nEXPLORATION: ${d.usesExploration}\nDIFFICULTY: ${d.difficultyCurve}\nSTAKES: ${d.failAndStakes}\nCHANGES: ${d.changes.map((c) => c.file + ' (' + c.nature + ')').join('; ')}\nRISKS: ${d.risks}\nCONSTRAINT CHECK: ${d.constraintCheck}\n\nBe critical. Return a 0-10 score for THIS lens with reasoning.`,
      { label: `judge:${d.name.slice(0, 16)}:${L.key}`, phase: 'Judge', schema: SCORE_SCHEMA })
  )).then((scores) => {
    const xs = scores.filter(Boolean)
    const avg = xs.length ? xs.reduce((a, s) => a + s.score, 0) / xs.length : 0
    return { design: d, avg, scores: xs }
  })
))).filter(Boolean)
const ranked = scored.sort((a, b) => b.avg - a.avg)
for (const r of ranked) log(`  ${r.avg.toFixed(1)}  ${r.design.name}`)
const winner = ranked[0]
const runnersUp = ranked.slice(1, 3)
log(`WINNER: ${winner.design.name} (${winner.avg.toFixed(1)}/10)`)

// ---------------- Phase 4: Spec ----------------
phase('Spec')
const spec = await agent(
  `${CONTEXT}\n\nThe judged WINNING design is "${winner.design.name}":\nPITCH: ${winner.design.pitch}\nCORE LOOP: ${winner.design.coreLoop.join(' -> ')}\nFUN THESIS: ${winner.design.funThesis}\nFOURIER-REAL: ${winner.design.keepsFourierReal}\nDIFFICULTY: ${winner.design.difficultyCurve}\nSTAKES: ${winner.design.failAndStakes}\nCHANGES: ${winner.design.changes.map((c) => c.file + ' (' + c.nature + ')').join('; ')}\n\nBEST IDEAS FROM RUNNERS-UP to graft if they strengthen it without bloating scope:\n${runnersUp.map((r) => `- ${r.design.name}: ${r.design.funThesis}`).join('\n')}\n\nProduce a LOCKED, CONCRETE implementation spec to build this on the current codebase. Read every file you will touch FIRST so signatures are accurate. Requirements:\n- Define EXACT new/changed exported APIs (signatures) so parallel implementers share one contract and don't collide.\n- Give a precise, complete per-file change list (filePackets), disjoint by file; new files allowed. INCLUDE packets for src/app/Game.ts, src/puzzles/HiddenStairPuzzle.test.ts, and tools/smoke.mjs (the main loop owns those).\n- Keep it buildable and strict-TypeScript-clean. Preserve the three world states + lens + minimalist HUD; do NOT exceed one contextual tool pill.\n- Make the FFT genuinely drive the fun. Ensure there is a deterministic solution path a headless script can drive (for smoke.mjs) AND real challenge for a human.\nReturn the structured spec.`,
  { label: 'spec:synthesis', phase: 'Spec', schema: SPEC_SCHEMA }
)

// ---------------- Phase 5: Implement ----------------
phase('Implement')
const RESERVED = new Set(['src/app/Game.ts', 'src/puzzles/HiddenStairPuzzle.test.ts', 'tools/smoke.mjs'])
const implPackets = (spec.filePackets || []).filter((p) => /^(src\/.*\.ts|index\.html)$/.test((p.file || '').trim()) && !RESERVED.has((p.file || '').trim()))
const apiContract = (spec.newApis || []).map((a) => `- ${a.file}: ${a.signature}  // ${a.purpose}`).join('\n')
log(`Implementing ${implPackets.length} files in parallel; ${(spec.filePackets || []).length - implPackets.length} reserved for the main loop.`)
const implemented = (await parallel(implPackets.map((pkt) => () =>
  agent(`${CONTEXT}\n\nWe are implementing the redesigned, FUN puzzle "${spec.chosenDesign}".\nFINAL PUZZLE SUMMARY: ${spec.summary}\n\nSHARED API CONTRACT (conform to these EXACT signatures for anything other files import):\n${apiContract}\n\nYOU OWN EXACTLY ONE FILE: ${pkt.file}\nYou may EDIT only this file (create it if new). You may READ anything. Do NOT edit any other file — especially NOT src/app/Game.ts, the tests, or tools/smoke.mjs.\n\nIMPLEMENT precisely this for ${pkt.file}:\n${pkt.changes}\n\nRULES: strict-TypeScript-clean (strict, noUnusedLocals, noUnusedParameters); conform exactly to the shared API contract; stay within the design non-negotiables (minimalist HUD, no numbers/graphs, first-person, pastel, Fourier real); minimal surgical edits; do NOT run build/dev/tests. Return the structured result.`,
    { label: `impl:${pkt.file.split('/').pop()}`, phase: 'Implement', schema: IMPL_SCHEMA })
))).filter(Boolean)

return {
  winner: winner.design.name,
  ranking: ranked.map((r) => ({ name: r.design.name, score: Number(r.avg.toFixed(2)) })),
  topCritiques: critiques.flatMap((c) => c.problems.filter((p) => p.severity !== 'medium').map((p) => `[${p.severity}] ${p.title}`)),
  spec: { summary: spec.summary, newApis: spec.newApis, gameIntegration: spec.gameIntegration, testChanges: spec.testChanges, smokeChanges: spec.smokeChanges, filePackets: spec.filePackets },
  implementedFiles: implemented.map((i) => ({ file: i.file, changes: i.changesSummary, conforms: i.conformsToContract, gameWiring: i.gameWiringNeeded, risks: i.risks }))
}
