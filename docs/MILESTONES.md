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
- From Paul's M5 playtest (2026-10-06): "slow the movement down a bit. Cut it to half-speed."
  - [x] Halve player movement: runner and goalie top speed, acceleration, and friction (same feel, half the pace).
  - [x] Scale movement-like effects with it: check dash and knockback, Hex Shove knockback, the goalie-protection bounce, and the board-slam threshold.
  - [x] Keep ball speeds (passes, shots) as they are.
  - [x] Re-run the sim; retune if goals per game leave the 6–20 band or a spell goes over 40%; no stuck players.
  - [x] Fix any tests that assumed the old speeds; re-gate.

## M6 — Screens, polish, balance
- Title, team select (with difficulty), and results screens.
- Announcer text callouts; simple sound effects with a mute toggle.
- A balance pass using sim stats; Easy, Normal, and Hard feel distinct.
- Balance thresholds in CLAUDE.md become hard test failures.
- [x] From Paul's M3 playtest (2026-10-06): "a little too chaotic"; tune it down in the balance pass. Levers to try, checked against the sim: fewer AI checks (`checkChancePerTick`), a lower strip chance (`check.looseChance`), longer check cooldown, fewer possession changes per game (M3 sim: ~72), and longer settled possessions before shots. Done: AI checks 115 → 76 a game, strip chance 40% → 35%, possession changes 72 → 46 a game.
- **Done when:** a new player can open the link, pick teams, and play a full match without instructions beyond a one-screen controls card.

## M7 — Announcer voice (from the backlog; Paul, 2026-10-09)
Paul's call: recorded clips only (no browser text-to-speech). The game stays text-only until recordings are added.
- [x] Give every announcer line a stable id that names its recording; lines keep their id when the wording changes.
- [x] Load whatever clips are in `src/content/announcer-voice/` at build time (`<id>.mp3`, `.ogg`, or `.wav`); lines without one stay text-only.
- [x] Speak the same line the text shows; a more important call cuts off a less important one; effects duck under the voice; the M mute covers it.
- [x] Generate a recording script (`docs/ANNOUNCER_SCRIPT.md`) from the line list, with situations, delivery notes, and file specs; a test keeps it in sync and catches mis-named clip files.
- **Done when:** dropping a correctly named clip into the folder makes that line speak in the deployed game with no code changes, and the game behaves exactly as before with no clips.
- From Paul (2026-10-10): generate the recordings with ElevenLabs, voice `hA4zGnmTwX2NQiTRMt7o`.
  - [x] Generator script (`npm run announcer:voice`) with the key in a git-ignored `.env.local`.
  - [x] Generate all 28 lines; measure them; regenerate any bad take.
  - [x] Trim silence and level loudness at load time so uneven takes play cleanly.
  - [x] Paul listens and flags any lines to redo.
- From Paul (2026-10-10): redo `hit-01` and `hit-05` without the laugh; reactions to the opponent should be angrier.
  - [x] Drop the laugh tag from big hits and regenerate `hit-01` and `hit-05`.
  - [x] Home announcer: an angry take (`<id>-against`) for every line, played when the moment favors the opponent, falling back to the regular take.
  - [x] Generate all 28 angry takes and measure them.
  - [x] Paul listens to the new takes and flags any to redo (2026-10-10: "things look good").

## M8 — 8-bit art and controller support (Paul, 2026-10-10)
Paul's call: "merge the art, can we add controller support?"
- [x] The 8-bit look is the default; the old look stays one URL flag away (`?look=classic`).
- [x] Play a whole match on a gamepad (standard mapping: Xbox, PlayStation, Switch Pro, most PC pads): left stick or D-pad moves (analog: a light push walks); right stick aims; pass, shoot (hold and release), check, all three spells, switch player, pause, and mute.
- [x] Aiming with a stick is helped: the aim point lands on the goal line when the stick points at the goal, so shots and Bent Shot go where you point.
- [x] Menus work on the pad: D-pad or left stick moves between buttons, A picks, B goes back, Start pauses and resumes.
- [x] The HUD shows pad buttons when you're playing on a pad and keys when you're on keyboard and mouse, switching automatically; the controls card lists both.
- [x] Keyboard and mouse still work exactly as before, and you can switch between them mid-match.
- [x] Tests: unit tests for stick deadzones, aim, button mapping, and press edges; a Playwright test that plays the menus and a match with a simulated gamepad.
- **Done when:** with only a gamepad, Paul can go from the title screen through a match to the results and back, and the 8-bit look is what loads by default.
- Paul signed off (2026-10-10): "keep it as is for now." Layout, aim assist, aim-where-you-run, and the 8-bit default stay as built.

## Title-screen changelog (Paul, 2026-10-10)
Paul's ask: "add a changelog to startup that shows the most recent updates."
- [x] A "What's new" section on the title screen with the latest 3 updates (title, date, a few plain lines each), newest first.
- [x] The entries live in `src/content/changelog.ts`; tests keep them dated, non-empty, and in order.
- [x] It fits the title panel on desktop and phone widths, and the panel scrolls on short windows.
- Paul signed off (2026-10-10): "three is good." The latest three entries stay; no separate full-history screen.

## M9 — Goal replays, team identities, training ground (Paul, 2026-10-15)
Paul's call: "Turn items 1–3 (goal replays, team identities, training ground) into M9 and start building."
- Goal replays
  - [x] After a goal in a played match, an instant replay of the run-up at half speed, with the spell and hit effects, then the faceoff as usual.
  - [x] Click, Space, or A skips it; Esc still pauses. No replays in the title-screen demo or in training.
  - [x] Render-only: the sim never knows a replay ran, so a match plays out exactly as it would without them.
- Team identities
  - [x] Each team has a playing style its AI follows: the Wyverns hit hard and carry the ball, the Ichthyocentaurs move it, and the Willowmere Witches cast more spells. Styles are AI tuning only: every witch has the same speed, stick, and spells, and your own player is unchanged.
  - [x] Team select shows each team's style.
  - [x] No style is the obvious pick: in the headless sim every style wins 42–58% of its games against the others (sides swapped), and the same-AI balance gate still passes.
  - [x] The sim runs any style matchup (`--home-style`, `--away-style`) and a matrix of all of them (`--style-matrix`) with per-team stats; CI checks the matrix.
- Training ground
  - [x] A Training button on the title screen opens a lesson list: Run and scoop, Pass, Shoot, Bent Shot, Body check, Hex Shove, Faceoff.
  - [x] Each lesson sets up a small drill with a short goal and a progress count, says what went wrong on a miss, and moves on when done; after the last one you can start a match.
  - [x] Instructions name keyboard-and-mouse or controller buttons, whichever you're using.
  - [x] Esc pauses, with Skip lesson and Quit training.
  - [x] Drill setups and goals are pure sim code with unit tests; a Playwright test plays through the first lesson.
- **Done when:** a goal in a real match replays and can be skipped; the three teams play noticeably differently (sim stats and a real match) without one being the obvious pick; and a new player can go through every training lesson from the title screen on keyboard and mouse or a controller.
- From Paul's M9 playtest (2026-10-15): "Wyverns are the Willowmere team, so remove the Willowmere Witches. We'll add some other teams later." Replays stay at about 6 s, styles stay AI-only until more teams arrive, and the blurbs stay. Training progress: "yes", remember it. "Please commit the terms/privacy."
  - [x] Commit the Terms of Service and Privacy Policy links (Paul's uncommitted work), without the `?auth=true` guest mode that sits alongside it.
  - [x] Remove the Willowmere Witches team; the spec's canon notes say the Wyverns are Willowmere's team.
  - [x] Drop the spellcraft style with it (no team plays it), and check the Wyverns vs Ichthyocentaurs matchup is still no one's obvious pick.
  - [x] Remember finished training lessons in this browser: a ✓ on each in the lesson list, and the main button continues from the first unfinished one. Unlinking clears it, and the unlink screen says so.
  - [x] Re-gate.
- From Paul (2026-10-15): "two teams are fine, add the nudge".
  - [x] Until a training lesson is finished in this browser, the title screen points new players at Training: the button glows and a line under it says "New? Start here: seven short lessons." Play stays the main button.
  - [x] Re-gate.
- Paul moved on to M10 (2026-10-15) with no further notes.

## M10 — Spell loadouts: ten spells from the card game (Paul, 2026-10-15)
Paul's call: pick 10 of the card game's spells "that fit this version of the game for players to choose from", then "plan these 10 spells as M10: choose 3 before each match, the AI uses them, and a balance pass. Then start building."
- The ten (names from the card game's spell library; the first three keep their old ids, `hexShove`, `quickstep`, `bentShot`):
  - [x] Thunderclap, Burst of Speed, and Misdirection: today's Hex Shove, Quickstep, and Bent Shot, renamed, same effects.
  - [x] Pinpoint: your next shot has no aim error and is harder to save.
  - [x] Blink: teleport a few meters the way you're moving (or aiming), keeping the ball; never into a crease, a goal, or the boards.
  - [x] Snare: pins the nearest opponent in a narrow cone in place for about a second.
  - [x] Ice Wall: a short wall in front of you for a few seconds; balls and players bounce off it. It can't be raised touching a crease.
  - [x] Stone Skin: for a couple of seconds, checks and Thunderclaps don't knock you back, daze you, or strip the ball.
  - [x] Tailwind: your next pass flies faster and farther, can't be intercepted, and your teammate always catches it.
  - [x] Glamour Self: two illusions run beside you for a few seconds; a check, Thunderclap, or Snare aimed at you hits an illusion two times in three.
  - [x] One armed spell at a time (Misdirection, Pinpoint, or Tailwind).
  - [x] Every spell has a unit test for its effect, cost, and cooldown, and a gold visual that reads at a glance (replays too).
- Loadouts
  - [x] Before each match, pick 3 of the 10 for your team (Q / E / R, or X / Y / B, in the order picked), remembered with your team choice. Thunderclap, Burst of Speed, and Misdirection to start. Works on a controller.
  - [x] Your AI teammates carry your three; the opponents get three at random. The title demo uses random sets; training keeps the starting three.
  - [x] The spell bar shows your three; the controls card says spells are picked before the match.
- AI
  - [x] The AI casts every spell situationally (SPEC §7), by the same rules as the player.
- Balance
  - [x] The headless sim plays random loadouts. A new `--spell-edges` run measures each spell: matches where one team always carries it against a team that never does, sides swapped. Every spell wins 42–58% over 400 games per spell (no obvious pick and no dead one), no spell is above 40% of casts, goals per game stay 6–20, and home wins stay 45–55%. CI checks the spell edges with a quicker 300 games per spell, allowing 40–60% for the extra noise.
- **Done when:** a player can pick any 3 of the 10 before a match and play with them on keyboard and mouse or a controller; the AI casts all ten; and the sim shows no spell is the obvious pick.
- Paul signed off (2026-10-16): "good for now, more tuning later." Spell numbers stay as built; the playtest questions (opponents' spells on the HUD, team styles preferring spells, renames) wait for the later tuning pass.

## M11 — Online 1v1 (Paul, 2026-10-15)
Paul: "1v1", and yes to spectators, the AI taking over on disconnect with rejoin, no online pause, Darkspace members only, and keeping single-player in the browser. Built on its own branch (`online-multiplayer`) while M10 (spell loadouts) is in playtest on `main`. SPEC §11.
- Rooms and lobby
  - [x] A room per Discord Activity instance; in a browser, **Play online** makes a room link (`?room=<code>`) to share.
  - [x] Lobby: the room's members, two seats (Wyverns home, Ichthyocentaurs away), take a seat / leave it / watch, Ready. Both ready: the match starts.
  - [x] Only signed-in Darkspace members can join (the session cookie, checked on connect).
- The match
  - [x] The server runs the match at 60 Hz with the same sim and AI, and sends it to everyone in the room.
  - [x] Control switching (follow the ball, Space on defense, faceoff takers) is shared code the server and the screens both run.
  - [x] Each player's screen predicts ahead from the latest server state with their own inputs, and smooths corrections.
  - [x] Sounds, announcer, and stats come from the server's events. The announcer takes your side.
  - [x] Goal replays for everyone; the match waits; ends early when both players skip.
  - [x] No pause: Esc offers Keep playing or Leave match.
  - [x] Disconnect: the AI takes that side; the same account rejoins and takes it back.
  - [x] Spectators watch live.
  - [x] Results for everyone, then Rematch (back to the lobby, seats kept) or Leave.
- Testing
  - [x] Unit tests: control switching, the shared world step, prediction (same inputs give the server's state exactly), the server's input handling, room flow.
  - [x] A headless test: two scripted clients play a whole match through the real server over WebSockets.
  - [x] Playwright: two browser pages join one room, ready up, and play a few seconds; screenshot.
  - [x] Re-gate: playtest notes in docs/PLAYTEST.md; Discord itself still to try (needs a deploy).
- **Done when:** two Darkspace members can play a full 1v1 against each other in a browser room or a Discord Activity, others can watch, and a player who drops can come back.
- Paul signed off (2026-10-16): "good for now, more tuning later", and online play "works in discord".
  - [x] Add a "What's new" entry for online play and the Discord Activity, now that both are live.

## M12 — Online feel (started 2026-10-16)
Paul: "start by logging a per-match network summary from the server."
- [x] The server logs one anonymous line per online match (`online: match summary {...}`): each seat's round trips, how early its controls arrive and how many come late, ticks played on carried-forward controls, connected share, drops and rejoins; plus snapshot KB/s per screen, the server's step cost, and stalls. A match cut off by a room closing or a restart is logged as abandoned. How to read them: infra/README.md, "Logs".
- [x] `npm run sim -- --net` plays matches through the prediction code with simulated lag, jitter, and loss, and reports how often and how far screens are corrected. It runs the real room and the game's own screen code (`NetScreen`, pulled out of the match scene) over simulated connections to the East US server: east, west, europe, pacific, and busy Wi-Fi. `--links` picks pairings and `--set` tries other `online` settings.
- [x] A network readout on a debug key (Paul, 2026-10-16: "build the onscreen readout first"). **N** in an online match shows ping, how far the screen runs ahead of the server, how early your controls arrive, updates per second and KB/s, and corrections a second with their size for your witch and everyone else (and snaps). The controls card lists it.
- [x] Tune input lead, smoothing, and snapshot rate. Done from the net sim across simulated regions; Paul's playtests across real regions can still move them.
  - The input lead is now 2 ticks with a tighter clock (was 3, sitting at 5), plus a cushion of up to 3 ticks that a screen adds while its controls arrive late.
  - Smoothing stays at 0.1 s and snapshots at 30 a second.
  - The N readout's "aim" shows the live target.

## M13 — Online spell picks (Paul, 2026-10-16)
Paul: "drop the team pick and keep only spell picks in the lobby." The two teams differ only in their AI teammates' style, so the seat stays the team (Wyverns home, Ichthyocentaurs away).
- [x] Each seated player picks their three spells in the lobby (Change spells, the same picker as single-player); their AI teammates carry them too.
- [x] Both seats show their three to everyone in the room; a screen brings its saved picks into the room, and picks made online are saved for single-player too.
- [x] Changing spells takes back Ready; a match keeps the spells it started with.
- [x] Tests: the room plays each seat's picks, the protocol rejects bad loadouts, and the two-browser Playwright test picks spells in the lobby and checks both teams carry the right three.
- **Done when:** two players can each pick their three in the lobby, see each other's, and play the match with them.
- From Paul's M13 playtest (2026-10-16): "Hidden until used."
  - [x] The lobby shows only your own picks: the server sends each person their own three and nobody else's ("Spells: hidden until cast").
  - [x] In a match, the other team's three show as "?" in the bottom-right corner, each revealed when that team first casts it. Single-player too; a watcher sees both teams' (home's bottom-left).
  - [x] Re-gate.

## M14 — Badges, tier roles, and achievements (planned; Paul, 2026-10-16)
Paul: "Propose 5 tiered roles and icons for Spellstick Live to use as Discord badges and an achievements profile page for each user that displays them. Propose 10 achievements." The design is in docs/BADGES.md. Starts after M12 closes. Online 1v1 only.
- [ ] Tier and achievement names, how-to text, colours, and 16×16 pixel icons in `src/content/`; PNG role icons (64 and 128 px) exported to `assets/discord/` with no new dependency.
- [ ] A pure evaluator in `src/achievements/` (no Phaser, deterministic) that credits only the witch you were steering, plus tier thresholds 1/3/5/7/9; the online room hands each counting match to the server.
- [ ] Storage in a `spellstick_live` database on the shared Postgres server (`pg` the only new dependency), with an in-memory store when no database is set.
- [ ] The Spellstick Live bot gives the tier role (only the highest one) after a match and re-syncs at sign-in; skipped when the bot token or role ids aren't set.
- [ ] A profile page at `/profile/<id>` and `/profile/me`, linked from the account line, lobby, and results; results list new achievements and a new rank.
- [ ] The unlink screen says what's stored and can delete the record and the tier role.
- [ ] Tests for every achievement (earned and not), the counting rules, role sync with a fake `fetch`, and the room hook; the sim reports each achievement's unlock rate; a Playwright screenshot of the profile page.
- [ ] Paul's one-time Discord and Key Vault setup listed in docs/PLAYTEST.md.
- **Done when:** two Darkspace members play an online match to the final whistle, both see First Whistle on results and on their profile, and both get the Prep Witch role in Discord.

## Discord touches (planned, was part of M13)
- [ ] Discord presence for online matches ("Online vs <name>"), and an invite button inside Discord.

## Backlog (post-v1, not started without Paul's go-ahead)
Real art, touch controls, local 2-player, more spells and teams, a season or tournament mode.
