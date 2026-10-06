# Spellstick

A fast, top-down, arcade box-lacrosse game for the browser, set in Daniel Kensington's _Warlock_ series (Darkspace Press). Witches, sticks, legal violence, and golden-orange magic.

**Play:** https://ragoczy.github.io/spellstick/

Pick your team, an opponent, and a difficulty, then play a full match: four 2:30 periods, faceoffs, a 30-second shot clock, the crease rule, sudden-death overtime, body checks, and three spells.

| Input | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Aim your stick |
| Left click / hold and release | Pass / shoot |
| Right click | Body check |
| Q / E / R | Spells: Hex Shove, Quickstep, Bent Shot (placeholder names) |
| Space | Switch to the teammate nearest the ball (on defense) |
| Esc | Pause |
| M | Sound on/off |

## Develop

```bash
npm install
npm run dev          # local dev server
npm test             # unit tests (Vitest)
npm run sim -- --games 1000 --seed 1 --strict   # headless AI-vs-AI stats; fails if balance thresholds break
npm run sim -- --games 300 --home-level normal --away-level hard   # compare difficulty levels
npm run build        # production build to dist/
npm run test:e2e     # Playwright: plays through the menus and a match against the built game
```

## Layout

- `src/sim/` — pure, deterministic game logic (no Phaser, no DOM). All tuning numbers are in `src/sim/config.ts`.
- `src/ai/` — AI controllers that emit the same input commands a human does.
- `src/render/` — Phaser rendering of the match (rink, players, HUD); reads sim state only.
- `src/ui/` — DOM menus (title, team select, controls card, pause, results), announcer, sound, and input.
- `src/content/` — names, colors, and text that may change: teams, spells (placeholders), announcer lines, HUD text.
- `tools/` — the headless sim runner and its report.
- `docs/` — spec, milestones, decisions, and playtest notes.
