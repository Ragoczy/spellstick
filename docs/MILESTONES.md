# Milestones

Each milestone ends at a gate (see CLAUDE.md): tests pass, the sim is clean, PLAYTEST.md is written, the build is deployed, and then you stop for Paul.

## M0 — Scaffold
- Vite + TypeScript (strict) + Phaser 3 project. Vitest, Playwright, ESLint (including the `src/sim` import ban), and Prettier.
- Folders: `src/sim`, `src/ai`, `src/render`, `src/ui`, `src/content`, `tools`.
- Fixed-timestep loop driving the sim; Phaser renders from sim state.
- A `tools/sim.ts` stub that runs an empty match headless.
- GitHub Actions: test, then build, then deploy to Pages.
- **Done when:** the deployed URL shows an empty rink with boards, goals, and creases; CI is green.

## M1 — Movement and the ball
- One controllable player with WASD movement, acceleration, and friction.
- Ball physics: carrying, loose-ball rolling and friction, and bouncing off the boards.
- Auto-scoop of loose balls.
- **Done when:** you can run around, drop the ball (debug key), and scoop it again, and the ball bounces off the boards believably.

## M2 — Passing, shooting, goalie
- Passing with the aim cone and assist magnetism; catching with a catch radius and a drop chance.
- Charged shots; goal detection and scoring.
- A basic AI goalie that tracks the ball and attempts saves, with rebounds.
- **Done when:** 2v0 with a goalie works: you can pass to a dummy teammate and score past the goalie at a sensible rate.

## M3 — Full teams and AI
- 4 runners + goalie per side; positioning, marking, and carrier decisions per SPEC §7.
- Player switching (Space) and auto-switch on possession.
- Body checks (right click) with knockback, stagger, and ball-loosening chance, for humans and AI.
- **Done when:** the headless sim shows AI-vs-AI matches with goals, turnovers, and no stuck players, and a human can play a full chaotic half-field game.

## M4 — Rules and match flow
- Every rule in SPEC §4: faceoffs, shot clock, crease, goalie protection, periods, overtime.
- HUD: score, clocks, period.
- **Done when:** a full match runs from opening faceoff to final whistle, overtime works, and every rule has unit tests.

## M5 — Mana and spells
- Mana bars, the three runner spells, and the goalie's Ward, per SPEC §6.
- AI spell use; spell visuals with the gold-orange glow.
- **Done when:** the sim shows every spell being used, with no single spell above 40% of casts, and matches still land in the goals-per-game band.

## M6 — Screens, polish, balance
- Title, team select (with difficulty), and results screens.
- Announcer text callouts; simple sound effects with a mute toggle.
- A balance pass using sim stats; Easy, Normal, and Hard feel distinct.
- Balance thresholds in CLAUDE.md become hard test failures.
- **Done when:** a new player can open the link, pick teams, and play a full match without instructions beyond a one-screen controls card.

## Backlog (post-v1, not started without Paul's go-ahead)
Real art, touch controls, local 2-player, more spells and teams, an announcer voice, a season or tournament mode.
