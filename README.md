# Spellstick

A fast, top-down, arcade box-lacrosse game for the browser, set in Daniel Kensington's _Warlock_ series (Darkspace Press). Witches, sticks, legal violence, and golden-orange magic.

**Play:** https://ragoczy.github.io/spellstick/

## Develop

```bash
npm install
npm run dev          # local dev server
npm test             # unit tests (Vitest)
npm run sim -- --games 1000 --seed 1   # headless AI-vs-AI stats
npm run build        # production build to dist/
npm run test:e2e     # Playwright smoke test against the built game
```

## Layout

- `src/sim/` — pure, deterministic game logic (no Phaser, no DOM). All tuning numbers are in `src/sim/config.ts`.
- `src/ai/` — AI controllers that emit the same input commands a human does.
- `src/render/`, `src/ui/` — Phaser rendering and DOM UI; they only read sim state.
- `src/content/` — names, colors, and text that may change (placeholders live here).
- `tools/` — the headless sim runner.
- `docs/` — spec, milestones, decisions, and playtest notes.
