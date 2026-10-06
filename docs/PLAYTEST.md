# Playtest notes — M0 (Scaffold)

**Build:** https://ragoczy.github.io/spellstick/ (the git SHA is in the bottom-right corner)

## What changed

- New project: Vite + TypeScript (strict) + Phaser 3, with Vitest, Playwright, ESLint, and Prettier.
- The sim (`src/sim/`) is pure and deterministic: fixed 60 Hz timestep, seeded RNG, and lint rules plus a unit test that fail if it imports Phaser or calls `Math.random()`.
- The browser runs the sim through a fixed-step loop, and Phaser draws the rink from sim geometry: boards, floor, center line and faceoff circle, both goals, and both creases (tinted in team colors: Wyverns crimson on the left, Ichthyocentaurs sea-teal on the right).
- A placeholder header shows the period and game clock ticking down, which proves the loop is running.
- `npm run sim -- --games 1000 --seed 1` runs 1,000 empty matches headless and prints the stats report. Everything is zero for now because there are no players yet; it warns that goals per game is out of range, which is expected until M3.
- GitHub Actions lints, tests, runs a short sim, builds, runs the Playwright smoke test, and deploys to Pages on every push to `main`.

## How to run

- Play: open the build link above.
- Local: `npm install`, then `npm run dev` and open the URL it prints.

## Things to try

1. Open the link and check that the rink fills the window and stays centered when you resize the browser.
2. Watch the clock under the title count down from 2:30.
3. Look at the rink proportions: length vs width, the corner rounding, the goal size, and the crease size.
4. Check that the team colors read clearly on the dark floor.

## Questions for you

1. Do the rink proportions feel right for box lacrosse, or should it be shorter/wider? (Currently 60 × 28 m.)
2. Is the goal (1.8 m mouth) and crease (3 m radius) about the size you picture? Goal size will matter a lot for scoring in M2.
3. Any preference on the floor color? It's a dark green turf tone now; it could go to a lighter wood or a darker arcane look.
4. Anything about the overall look you want changed before more gets built on it?
