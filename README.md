# PHASE — v2

An interference field. You don't shoot — you **drop ripple sources**.

Each source emits expanding rings. Where two crests **cross in phase**, a bright
**focus** ignites for an instant — that focus is your only weapon. You aim by
predicting *where wavefronts will meet*, not where things are now. Land focuses on
fading **marks** before they decohere. Chain them and the field quickens.

Pure spatial-temporal prediction. No bullet-hell, no enemy horde. Something the
genre hasn't seen: you reason about wave fronts in space *and* time, like a
billiards player whose cue ball is an expanding circle.

## What v2 adds (the hooks that keep you in)

- **Chain multiplier** — each focus raises ×score; a short window means letting go hurts.
- **Crits** — random ×3 strikes (variable reward; the slot-machine pull).
- **Overcharge (hold Shift)** — ×2 score for ×2 miss cost. Staking your run.
- **Superposition marks** — rare, need 3 fronts, pay enormous when nailed clean.
- **Near-miss feedback** — marks glow and chime when a focus *almost* lands. The itch.
- **Progressive unlocks** — new mechanics (extra tones, moving marks, voids, twins)
  reveal as you push deeper. A reason to re-enter.
- **Ranks + best run** — Drifter → Coherence, remembered locally.
- **Juice** — screen shake, particle bursts, rising chords, sub-bass on big payouts.

## Play

Open `index.html` in any modern browser. No build, no dependencies, no assets.

- **Click / tap** — drop a ripple source (costs phase charge)
- **Space** — re-phase every source into one synchronized burst
- **Hold Shift** — overcharge
- Land ≥2 fronts on a mark *in phase* → focus → score
- Same-tone sources on a same-tone mark → **PURE** bonus
- A mark going dark = decoherence. Lose all coherence → DECOHERED.

## Tech / testing

Single self-contained file (Canvas 2D + Web Audio). Game logic lives in pure,
testable functions, mirrored byte-for-byte inside `index.html`.

- `core.js` — pure logic module
- `regress.js` — 35-assertion regression suite (`node regress.js`)
- `sim.js` — headless runtime simulation that mocks DOM/canvas/audio and plays
  the game for minutes to catch runtime errors (`node sim.js`)

All green: 35/35 unit assertions, byte-for-byte core parity with the embedded
copy, full DOM-reference audit, and a clean 10-minute (36k-frame) stress run.
