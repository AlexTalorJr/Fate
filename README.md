# PHASE

An interference field. You don't shoot — you **drop ripple sources**. Where two
ripples meet in phase, a **focus** ignites and clears a target. That's the whole
game: aim by predicting *where wavefronts will cross*, not where things are now.

No bullet-hell, no enemy horde. Pure spatial-temporal prediction — like billiards
where the cue ball is an expanding circle.

## Built for "I get it" in ten seconds

The previous version was hard to read. This one teaches by hand:

- **Interactive tutorial** — the field places two glowing "DROP HERE" rings, you
  click them, and you *watch* your two ripples cross and ignite your first focus.
  No wall of text. You learn the mechanic by doing it once.
- **Live prediction** — hover before you click and a dashed line shows exactly
  which target you'll hit and how clean the timing is (green = in phase). The
  invisible wave-meeting is made visible, so aiming is learnable, not luck.
- **Soft start** — a grace period spawns marks slower and still at first, so the
  difficulty ramp begins gently and accelerates as you find your rhythm.
- Returning players skip straight in; the tutorial is remembered.

## Hooks that keep you in

Chain multiplier with a burn-down timer · random ×3 crits · hold-Shift overcharge
(×2 score, ×2 miss cost) · rare Superposition jackpots · near-miss glow + chime ·
progressive mechanic unlocks (tones, moving marks, voids, twins) · ranks and a
remembered best run · screen shake, particle bursts, rising chords, sub-bass.

## Play

Open `index.html` in any modern browser. No build, no dependencies, no assets.

- **Click / tap** — drop a ripple source
- **Space** — re-phase every source into one synchronized burst
- **Hold Shift** — overcharge
- Land ≥2 fronts on a mark in phase → focus → score
- Same-tone sources on a same-tone mark → PURE bonus
- A mark going dark = decoherence. Lose all coherence → DECOHERED.

## Tech / testing

Single self-contained file (Canvas 2D + Web Audio). Logic lives in pure, testable
functions, mirrored byte-for-byte inside `index.html`.

- `core.js` — pure logic (waves, scoring, progression, prediction)
- `regress.js` — 43-assertion regression suite (`node regress.js`)
- `sim.js` — headless run that mocks DOM/canvas/audio and plays tutorial + 5 min
  of stress play to catch runtime errors (`node sim.js`)

All green: 43/43 unit assertions, byte-for-byte core parity with the embedded
copy, full DOM-reference audit, verified tutorial progression, and a clean
multi-minute stress run.
