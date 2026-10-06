# Decisions log

Append-only. Format: `YYYY-MM-DD — decision — why — how to change`.

- 2026-10-06 — Box-lacrosse format (enclosed boards, 4 runners + goalie) — fewer players means simpler AI, the ball stays in play, and spells are more readable — change the team size in `config.ts`; switching to field lacrosse is a design change, so ask Paul.
- 2026-10-06 — Only penalty-like rules are the crease and goalie protection — canon says violence is legal; simpler — revisit after playtests.
- 2026-10-06 — Starter spells are placeholders — Paul to supply canon spell names and effects — edit `src/content/`.
- 2026-10-06 — Repo is public at `Ragoczy/spellstick`, deployed to https://ragoczy.github.io/spellstick/ — Paul chose public so GitHub Pages works on any plan — change visibility in GitHub settings (Pages on a private repo needs a paid plan).
- 2026-10-06 — Sim units are meters and seconds; origin at rink center; home team defends the −x (left) goal and attacks +x — keeps physics numbers intuitive and the renderer is a single scale factor — `src/sim/config.ts` and `src/sim/arena.ts`.
- 2026-10-06 — Rink is 60 × 28 m with 8 m corner radius; goal mouth 1.8 m wide, 1.0 m deep, 5 m out from the end boards; crease radius 3 m — roughly real box-lacrosse proportions, goal slightly enlarged for a top-down view — tune in `config.rink`.
- 2026-10-06 — The game clock counts integer ticks, not float seconds — no float drift, exact determinism — `periodTicksLeft` in `src/sim/match.ts`.
- 2026-10-06 — Fixed 1280 × 720 canvas scaled to fit the window (Phaser `Scale.FIT`) — simple, and keeps the UI scalable for later touch/mobile — `src/render/view.ts` and `src/main.ts`.
- 2026-10-06 — M0 shows a temporary title/clock header drawn by Phaser; the real HUD arrives in M4 — `src/render/MatchScene.ts`.
- 2026-10-06 — CI runs lint, format check, typecheck, unit tests, a 50-game sim, the build, and the Playwright smoke test before deploying; the full 1,000-game sim is run locally at each gate — keeps CI fast — `.github/workflows/deploy.yml`.
- 2026-10-06 — Prettier ignores Markdown so the docs stay exactly as written — remove `*.md` from `.prettierignore` to format them.
- 2026-10-06 — A small build tag (git SHA) sits in the bottom-right corner so playtest feedback can name the build — `src/ui/buildTag.ts`.
- 2026-10-06 — Movement model: velocity steers toward (input × top speed) at a capped rate (accel 32 m/s²), and bleeds off at 24 m/s² with no input; top speed 7.5 m/s, 8% slower while carrying — arcade-responsive but with a little weight and glide — `config.player`.
- 2026-10-06 — Player body radius 0.6 m and stick reach 0.95 m, a bit larger than life — at this zoom a 0.45 m player was only 9 px and the number was hard to read — `config.player.radius`, `config.player.stickReach`.
- 2026-10-06 — The stick always points at the aim point (mouse for humans); a carried ball sits at the stick head — makes aim visible before passes and shots exist — `stickHead()` in `src/sim/match.ts`.
- 2026-10-06 — Scooping: the nearest eligible player within 1.15 m gets one attempt per tick; success chance slides from 95% (same velocity as the ball) to 55% (≥ 9 m/s relative speed). A miss knocks the ball away and that player waits 0.3 s; a player who just released the ball waits 0.6 s — one attempt with a retry delay keeps the speed bonus meaningful (a per-tick roll would make every scoop near-certain) — `config.scoop`.
- 2026-10-06 — The ball is 2D (no height). Loose-ball friction is constant deceleration plus drag; board bounces keep 65% of normal speed and 90% of tangential speed. Fast balls substep so they can't tunnel — `config.ball`.
- 2026-10-06 — Until M2 adds scoring, goals are solid boxes for both players and the ball — `src/sim/physics.ts` (`goalBox`).
- 2026-10-06 — Debug keys: G drops the ball, T tosses it toward the cursor at 14 m/s. They're `debugDrop`/`debugToss` on the input command and will be removed or hidden before v1 — `config.debug`, `src/ui/humanInput.ts`.
- 2026-10-06 — Until real team AI lands in M3, the headless sim plays a 1v1 duel with a placeholder "chaser" AI: chase loose balls, mark the carrier from the goal side, and run laps when carrying — gives movement, scooping, and the stuck detector something to measure — `src/ai/chaser.ts`, `duelRoster()`.
- 2026-10-06 — "Stuck" means staying within 1 m of one spot for more than 5 s of live play; each 5 s window counts as one incident — `config.diagnostics`, `tools/stuck.ts`.
- 2026-10-06 — The browser build interpolates rendered positions between sim ticks — smooth on 120/144 Hz monitors without touching the 60 Hz sim — `src/render/MatchScene.ts`.
- 2026-10-06 — In the M1 practice build, the match restarts when the 10-minute clock runs out — `src/render/MatchScene.ts`.
