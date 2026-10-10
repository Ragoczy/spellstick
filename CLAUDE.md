# CLAUDE.md — Spellstick (browser game)

You are building **Spellstick**, a small browser sports game set in the Warlock series by Daniel Kensington (Darkspace Press). It's a magical, full-contact take on box lacrosse played by witches.

Read these before doing anything:
- `docs/SPEC.md`: what the game is. This is the source of truth.
- `docs/MILESTONES.md`: what to build, in order, and when each milestone is done.
- `docs/DECISIONS.md`: decisions already made. Append to it; never rewrite history.

## How to work

- **Work autonomously.** Paul wants to be hands-off. Don't stop to ask questions mid-milestone. When the spec is silent or ambiguous, make the simplest reasonable choice, log it in `docs/DECISIONS.md` (date, decision, why, how to change it), and keep going.
- **Work one milestone at a time, in order.** Don't start the next milestone until the current one meets its acceptance criteria.
- **Stop at every milestone gate.** When a milestone is done:
  1. All tests pass (`npm test`), and the headless sim runs clean (`npm run sim`).
  2. Write `docs/PLAYTEST.md` for that milestone. Cover what changed, how to run it, 3–6 specific things Paul should try, and the specific feel questions you want answered (e.g. "Do passes feel too slow?").
  3. Commit, push, and confirm the deploy succeeded.
  4. Stop and wait for Paul's feedback.
- **Stop early only if** the spec contradicts itself in a way that changes the game's design (not just details), or a milestone turns out to be infeasible as written. If so, explain the problem in 3–5 sentences and propose an option.
- When Paul gives playtest feedback, turn it into concrete tasks in `docs/MILESTONES.md` under the current milestone, do them, and re-gate.
- Commit small and often with clear messages. Never commit failing tests.

## Architecture rules (non-negotiable)

- **Stack:** TypeScript (strict), Vite, Phaser 3, Vitest for unit tests, Playwright for screenshot and smoke tests.
- **`src/sim/` is pure game logic:** physics, rules, game state, spells, and the match clock. It must not import Phaser, the DOM, or anything browser-only, so it runs headless in Node. Enforce this with an ESLint `no-restricted-imports` rule plus a unit test that fails if any file in `src/sim` imports `phaser`.
- **The sim is deterministic:** a fixed timestep (60 Hz) and a seeded RNG (no `Math.random()` in `src/sim` or `src/ai`). The same seed plus the same inputs must give the same result. Add a test for this.
- **`src/ai/` holds AI decision-making.** It reads sim state and outputs the same input commands a human player would. The AI never pokes sim state directly.
- **`src/render/` and `src/ui/` are Phaser and DOM only.** They read sim state and draw it. No game rules live here.
- **All tuning numbers live in `src/sim/config.ts`:** speeds, pass velocity, catch radius, mana costs, cooldowns, shot clock, period length, and so on. No magic numbers scattered through the code.
- **The headless sim lives in `tools/sim.ts` (`npm run sim -- --games 1000 --seed 1`).** It runs AI-vs-AI matches and prints a stats report: goals per game, shots per goal, possession changes, spell usage per spell, shot-clock violations, crease violations, the longest period without a shot, and how often a player was stuck (barely moved for more than 5 s). Use it after every gameplay change.
- **Keep it light:** minimal dependencies. Ask whether a new runtime dependency is truly needed before adding it. Target a production bundle under 2 MB, not counting art.

## Testing expectations

- Every rule in SPEC §4 gets unit tests in `src/sim`.
- Every spell gets a unit test for its effect, its cost, and its cooldown.
- Playwright: one smoke test that loads the built game, starts a match, simulates a few seconds of input, and saves a screenshot to `test-results/`. Look at the screenshots yourself when you change rendering.
- Balance sanity, checked with the headless sim over 1,000 games at fixed seeds. These are warnings, not hard failures, until M6:
  - average total goals per game between 6 and 20
  - no single spell above 40% of all casts
  - home win rate between 45% and 55% when both teams use the same AI

## Deployment

GitHub Actions builds on every push to `main` and deploys to Azure Static Web Apps (`swa-spellstick`, https://spellstick.games.darkspace.press; was GitHub Pages until 2026-10-10). The Vite `base` is `/`. The build must run tests first and fail the deploy if they fail. The only server code is the Discord login API in `api/`; game logic stays client-side. Secrets live only in the Static Web App's app settings, never in the repo.

## Canon and tone

See SPEC §2. Don't invent new Warlock lore beyond what the spec gives. Anything marked `[PLACEHOLDER]` in the spec is non-canon game content that Paul may rename or replace, so keep those names in one place (`src/content/`) so they're easy to change.
