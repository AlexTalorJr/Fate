# PHASE

An interference field. You drop **ripple sources**; each sends a ring expanding
outward. Where two rings cross, a bright **spark** appears — and that crossing
point *moves* as the rings grow. Steer a spark onto a **target** to clear it.

No bullet-hell, no enemy horde. You think in expanding wavefronts and moving
intersections — something the genre hasn't done.

## The fix in this version

The earlier builds had a fatal flaw: a hit required two wavefronts to reach a
target at the *same instant*, which is nearly impossible to do by hand (you'd
have to click two points at perfectly compensated times). So nothing scored.

Now the mechanic is **front intersections**: a focus exists wherever two live
rings currently cross, and that crossing persists and sweeps as the rings expand.
You place two sources, watch their rings overlap, and guide the crossing spark
through a target. Achievable, readable, and the thing you actually see on screen.

Supporting this:
- **Live crossing sparks** are drawn as bright moving points — the core feedback.
- **Hover prediction** simulates forward and shows which target you'll hit and
  how soon (green "WILL HIT").
- **Hand-held tutorial** places two "DROP HERE" rings, you click them, and you
  watch your first spark sweep through the target and clear it.
- **Soft start**: a grace period eases the opening difficulty.

## Hooks that keep you in

Chain multiplier with burn-down timer · random ×3 crits · hold-Shift overcharge ·
rare Superposition jackpots (need 3 rings) · near-miss glow + chime · progressive
mechanic unlocks · ranks + remembered best run · screen shake, particles, rising
chords, sub-bass.

## Play

Open `index.html` in any modern browser. No build, no dependencies, no assets.

- **Click / tap** — drop a ripple source
- **Space** — re-phase every source into one synchronized burst
- **Hold Shift** — overcharge (×2 score, ×2 miss cost)
- Two rings crossing on a mark → focus → score
- Same-tone sources → PURE bonus
- A mark going dark = decoherence. Lose all coherence → DECOHERED.

## Tech / testing

Single self-contained file (Canvas 2D + Web Audio). Logic lives in pure functions
in `core.js`, mirrored byte-for-byte inside `index.html`.

- `core.js` — pure logic (waves, circle-intersection focus detection, scoring,
  progression, forward-simulating prediction)
- `regress.js` — 45-assertion suite, incl. the key test that staggered-timing
  source drops still score (`node regress.js`)
- `sim.js` — headless DOM/canvas/audio mock that plays tutorial + 5 min of stress

Verified in a real headless Chromium: page loads with zero console errors, the
tutorial produces a focus and progresses, and free play scores.
