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
