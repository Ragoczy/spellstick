# Spellstick

A fast, top-down, arcade box-lacrosse game for the browser, set in Daniel Kensington's _Warlock_ series (Darkspace Press). Witches, sticks, legal violence, and golden-orange magic.

**Play:** https://spellstick.games.darkspace.press (log in with Discord; open to Players in the Darkspace Discord server)

Pick your team, an opponent, and a difficulty, then play a full match: four 2:30 periods, faceoffs, a 30-second shot clock, the crease rule, sudden-death overtime, body checks, and three spells.

| Keyboard & mouse | Controller | Action |
| --- | --- | --- |
| W A S D | Left stick or D-pad | Move |
| Mouse | Right stick | Aim your stick |
| Left click / hold and release | RT or A / hold and release | Pass / shoot |
| Right click | LT or LB | Body check |
| Q / E / R | X / Y / B | Spells: Hex Shove, Quickstep, Bent Shot (placeholder names) |
| Space | RB | Switch to the teammate nearest the ball (on defense) |
| Esc | Menu (Start) | Pause |
| M | View (Back) | Sound on/off |

Any controller the browser sees as a standard gamepad works (Xbox, PlayStation, Switch Pro, most PC pads); press a button so the browser notices it. Menus work on the pad too: D-pad to move, A to pick, B to go back.

The 8-bit look is the default; add `?look=classic` to the URL for the original smooth look.

## Develop

```bash
npm install
npm run dev          # local dev server
npm test             # unit tests (Vitest)
npm run sim -- --games 1000 --seed 1 --strict   # headless AI-vs-AI stats; fails if balance thresholds break
npm run sim -- --games 300 --home-level normal --away-level hard   # compare difficulty levels
npm run build        # production build to dist/
npm run test:e2e     # Playwright: plays through the menus and a match against the built game
npm run announcer:script   # regenerate docs/ANNOUNCER_SCRIPT.md after editing announcer lines
npm run announcer:voice    # generate missing announcer clips with ElevenLabs (key in .env.local)
npm run dev:swa      # built game + Discord login API at http://localhost:4280 (needs .env, see below)
```

`npm run dev` skips the login (there's no auth API behind the Vite dev server). To try the real login locally, run `tools/sync-discord-settings.sh local` (writes the git-ignored `.env` from Key Vault without showing it; needs `az login`), make sure `http://localhost:4280/api/auth/callback` is a redirect on the Darkspace Games Discord app, and run `npm run dev:swa`. The first run downloads the Static Web Apps CLI, Azure Functions Core Tools, and (on Node newer than 22) a Node 22 for the Functions worker.

## Hosting and login

Azure Static Web Apps (Free), `swa-spellstick` in `rg-game-spellstick` (eastus2), defined in `infra/main.bicep`. GitHub Actions tests every push and deploys `main` (the built `dist/` plus the functions in `api/`) with the `AZURE_STATIC_WEB_APPS_API_TOKEN` repo secret. `public/staticwebapp.config.json` sets the SPA fallback and caching (hashed `/assets/*` immutable, everything else no-cache).

Login uses the shared Darkspace Games Discord app and access rule (the contract is `docs/darkspace-discord-signin.md` in the card game repo): scopes `identify guilds.members.read`; only members of the Darkspace Discord server with the Players, Mods, or Admins role (or an emergency admin) get in, and roles are re-read at every sign-in. Routes: `/api/auth/login`, `/api/auth/callback`, `/api/auth/me`, `/api/auth/logout`. The session is a 30-day HS256 JWT (Discord id, username, avatar, role) in the `dsg_session` cookie (HttpOnly, Secure, SameSite=Lax; `Domain=.games.darkspace.press` on that domain, host-only elsewhere). Nothing is stored server-side.

Settings are app settings only. The shared ones (`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID`, `DISCORD_PLAYER_ROLE_IDS`, `DISCORD_MODERATOR_ROLE_IDS`, `DISCORD_ADMIN_ROLE_IDS`, `ADMIN_DISCORD_IDS`) are copied from Key Vault `kv-ha7siia4h4zia` by `tools/sync-discord-settings.sh azure`; rerun it when a shared value changes. `SESSION_SECRET` is Spellstick's own; `GAME_ALLOWED_ROLE_IDS` is an optional Spellstick-only override of the Players roles.

## Announcer voice

The announcer speaks any line that has a recording. Drop `<line id>.mp3` files into `src/content/announcer-voice/` (the ids, lines, and delivery notes are in [docs/ANNOUNCER_SCRIPT.md](docs/ANNOUNCER_SCRIPT.md)), commit, and push. Each line can also have an angry take, `<line id>-against.mp3`, which plays when the moment favors the opponent (it is a home announcer for your team). Lines without a recording are shown as text only.

## Layout

- `src/sim/` — pure, deterministic game logic (no Phaser, no DOM). All tuning numbers are in `src/sim/config.ts`.
- `src/ai/` — AI controllers that emit the same input commands a human does.
- `src/render/` — Phaser rendering of the match (rink, players, HUD); reads sim state only.
- `src/ui/` — DOM menus (title, team select, controls card, pause, results), announcer, sound, and input.
- `src/content/` — names, colors, and text that may change: teams, spells (placeholders), announcer lines, HUD text.
- `tools/` — the headless sim runner and its report, and the local SWA runner.
- `api/` — the Discord login functions (Azure Functions, Node, TypeScript).
- `infra/` — Bicep for the Static Web App.
- `docs/` — spec, milestones, decisions, and playtest notes.
