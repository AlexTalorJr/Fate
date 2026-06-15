# PHASE

An interference field. You drop **ripple sources**; each sends a ring expanding
outward. Where two rings cross, a bright **spark** appears — and that crossing
point *moves* as the rings grow. Steer a spark onto a **target** to clear it.

No bullet-hell, no enemy horde. You think in expanding wavefronts and moving
intersections — something the genre hasn't done.

## What this version fixes & adds

**The hang is gone.** The old build recomputed the wave field per-pixel across the
whole screen every frame, looping over every live source — so the deeper you got,
the slower it ran, collapsing to ~20fps and never recovering after a restart. The
field is now drawn as ring strokes (cost scales with source count, not screen
resolution), simultaneous sources are capped, and the expensive overlay blur is
gone. Measured: **~20fps → a steady 58–60fps, no decay across restarts.**

**A finale worth losing for.**
- Beating your best shows **RESONANCE** with a full-screen confetti burst and a
  victory chord — not a flat "DECOHERED".
- **Per-run medals**: Unbroken chain, Superposition, Crits, Pure, Flawless, Big hit,
  Strata depth — earned from stats tracked each run.
- A **verdict line** that reacts to how you played, an animated score count-up, and
  a field-wide shock beat before the curtain drops.

**Flow State.** Chains of 12+ bathe the field in warm light with a FLOW indicator —
the long-chain payoff feels like something.

**Stakes.** Idling now actually kills you (tuned health regen vs decoherence damage),
so neglecting marks has consequences.

## How it plays

The mechanic is **front intersections**: a focus exists wherever two live rings
currently cross, and that crossing persists and sweeps as the rings expand. You
place two sources, watch their rings overlap, and guide the crossing spark through
a target. No frame-perfect timing — achievable and readable.

- **Live crossing sparks** drawn as bright moving points — the core feedback
- **Hover prediction** simulates forward and shows what you'll hit (green "WILL HIT")
- **Hand-held tutorial** places two "DROP HERE" rings and walks you through a focus
- **Soft start** grace period eases the opening

## Controls

- **Click / tap** — drop a ripple source
- **Space** — re-phase every source into one synchronized burst
- **Hold Shift** — overcharge (×2 score, ×2 miss cost)
- Two rings crossing on a mark → focus → score
- Same-tone sources → PURE bonus
- Rare Superposition marks need 3 rings, pay big
- A mark going dark = decoherence. Lose all coherence → DECOHERED.

## Play

Open `index.html` in any modern browser. No build, no dependencies, no assets.

## Tech / testing

Single self-contained file (Canvas 2D + Web Audio). Logic lives in pure functions
in `core.js`, mirrored byte-for-byte inside `index.html`.

- `core.js` — pure logic (waves, circle-intersection focus detection, scoring,
  progression, forward-simulating prediction)
- `regress.js` — 45-assertion suite incl. the key test that staggered-timing drops
  still score (`node regress.js`)
- `sim.js` — headless DOM/canvas/audio mock that plays tutorial + 5 min of stress
  (`node sim.js`)

Verified: 45/45 unit assertions, byte-for-byte core parity with the embedded copy,
full DOM-reference audit, clean headless sim, and a real headless-Chromium pass —
zero console errors, finale renders, and a steady 58–60fps that holds across
restarts.
