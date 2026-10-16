# Badges, tier roles and achievements (Spellstick Live, M14)

Paul, 2026-10-16: "Propose 5 tiered roles and icons for Spellstick Live to use as Discord badges and an achievements profile page for each user that displays them. Propose 10 achievements."

Paul chose the following:
- **Storage:** achievements are stored in a new database on the card game's shared Postgres server.
- **Roles:** the Spellstick Live bot gives them out.
- **Tiers:** a tier is earned by how many achievements you've unlocked.

All names, colours and icons below are `[PLACEHOLDER]`. They live in `src/content/badges.ts` so Paul can rename them. "Prep" and "varsity" are the spec's own flavour words (§2), and nothing else adds lore.

## Scope

- **Online 1v1 only.** Only the server's own record of a match counts. Single-player runs in the browser and could be faked, and these records give out Discord roles.
- **Ordering.** M12 still has open items, so this is M14 and starts after M12 closes.

## Five tier roles

| Tier | Role | Unlocks at | Colour | Icon (16×16 pixel art, 8-bit like `src/render/retro.ts`) |
|---|---|---|---|---|
| 1 | **Prep Witch** | 1 achievement | Oak `#c89858` (the stick colour) | A plain wooden stick, one pip below |
| 2 | **Varsity Witch** | 3 | Iron `#bcbcbc` | A stick with a ball in the pocket, two pips |
| 3 | **First Line** | 5 | Violet `#8e6cd8` | Two crossed sticks over a ball, three pips |
| 4 | **Captain** | 7 | Deep gold `#c9761a` | A witch's hat with a captain's band, four pips |
| 5 | **Golden Stick** | 9 | Mana gold `#ffa630` (the canon glow) | A stick blazing golden-orange, the ball a star, five pips |

- **Colours.** They avoid both team colours (Wyverns crimson, Ichthyocentaurs teal) and climb to the canon mana gold.
- **No clash with the card game.** "Spellstick Master", the card game's top Elo tier, isn't reused.
- **One tier role at a time.** You hold only your highest tier role. On promotion the bot removes the old one. Tier roles are hoisted, so the icon shows next to your name.
- **Thresholds.** `[1, 3, 5, 7, 9]`, kept as tuning in config. Nine of ten means the luck-dependent Sudden Death isn't needed for the top tier.

## Ten achievements

"You" means the witch you were steering at that tick: `world.control[team]` while `world.humans[team]` (`src/net/world.ts`). Goals your AI teammates score aren't yours.

| id | Name | How to earn it | Icon |
|---|---|---|---|
| `firstWhistle` | **First Whistle** | Play an online match to the final whistle | Whistle |
| `offTheMark` | **Off the Mark** | Score a goal yourself | Ball in the net |
| `firstWin` | **First Win** | Win an online match | Raised stick and pennant |
| `hatTrick` | **Witch's Hat Trick** | Score 3 goals yourself in one match | Witch's hat with three balls |
| `intoTheBoards` | **Into the Boards** | Slam opponents into the boards 3 times in one match | Cracked board |
| `lightFingers` | **Light Fingers** | Knock the ball loose 3 times in one match (check, Thunderclap or Snare) | Open hand and a loose ball |
| `shutout` | **Shutout** | Win without conceding | Goal mouth with a ward glyph |
| `suddenDeath` | **Sudden Death** | Win in overtime | Hourglass |
| `comeback` | **Comeback** | Win after trailing by 3 or more goals | Rising arrow through the net |
| `fullLibrary` | **Full Library** | Cast all 10 spells at least once across your online matches | Open spellbook |

- **Expected curve.**
  - 1–3 come within the first few matches (tiers 1–2).
  - 4–7 take skill (tiers 3–4).
  - 8–10 take time or luck (tier 5).
- **Checking the rates.** The headless sim reports how often each per-match achievement unlocks in AI-vs-AI games. It warns above 60% (too easy) or below 1% (nearly impossible).
- **Full Library's hint is a count only.** It shows "7 / 10" and never names the spells you haven't cast. This keeps "spells hidden until used" intact.

## Which matches count

A match counts only if all of these hold:
- Both seats had **distinct signed-in Discord users** at the opening faceoff.
- The match reached the **final whistle**, not abandoned.
- You were **connected at the end**.

If your opponent quits, the AI takes their side and you still earn; the quitter earns nothing. Guests never earn anything.

## Profile page

- **Where.** The address is `/profile/<discordId>` or `/profile/me`. Any signed-in member can see it, since the whole site is members-only.
- **Header.** Your avatar, your name, and your tier badge drawn large in its colour. Below that, a five-pip ladder and "2 more achievements to Captain".
- **Achievement grid.** Ten tiles. Unlocked tiles show the coloured icon and the date earned. Locked tiles show a dim silhouette and how to earn it. Nothing is secret.
- **Career line.** Online matches, wins, and your goals.
- **Your own profile only.** "Delete my record".
- **How you get there.** Click the avatar and name in the title screen's account line, or a player's name in the lobby or on the results screen.
- **Results screen.** It adds "Unlocked: Witch's Hat Trick" and "New rank: Varsity Witch".

## Privacy

- **What's stored, by Discord id.** Your Discord name and avatar, achievements with dates, tier, career counts (matches, wins, goals), and which spells you've cast online. Nothing else.
- **No match history.** It isn't kept beyond those counts.
- **Unlink screen.** Today it promises "keeps no stats, match history, or profile on its server". That text changes to say what is kept. The screen gains **Also delete my Spellstick record**, which deletes the rows and removes the tier role.
- **M12 network log.** It stays anonymous.

## How it's built

1. **Content and art.**
   - Names, how-to text and colours go in `src/content/badges.ts`.
   - The 16×16 pixel grids go in `src/content/badgeArt.ts`, using palette letters like the witch sprites. A pure `toSvg(grid)` draws them for the profile page.
   - `tools/badge-png.ts` writes 64×64 and 128×128 PNGs to `assets/discord/` for the Discord role icons. It uses a small PNG encoder on `node:zlib`, so no new dependency.
2. **Pure evaluator** (`src/achievements/`).
   - It is Node-only, like `src/sim`, under the same ESLint no-Phaser rule and test.
   - `MatchCredit` builds each seat's tally from the `SimEvent` stream plus `control`/`humans` each tick: goals, board slams, loosened balls, spells cast, the score over time, overtime, and the winner.
   - It has `evaluate(credit, career)`, which returns what's newly unlocked, and `tierFor(count)`.
3. **Room hook** (`src/net/room.ts`).
   - The room feeds each step into the credit.
   - At `endMatch` it hands `{seat user ids, credit, final or abandoned, connected}` to an `onMatchRecorded` callback the server supplies.
   - The room stays pure.
4. **Storage** (`server/db.ts`, `server/migrations/`, `server/badges/store.ts`).
   - The pool is copied from the card game's `server/db.ts`: `DATABASE_URL` locally, a managed-identity token in Azure. **`pg` is the only new runtime dependency.**
   - Tables:
     - `players` (discord_id, username, avatar, tier, first_seen, last_seen)
     - `achievements` (discord_id, achievement_id, unlocked_at)
     - `career` (discord_id, matches, wins, goals, spells_cast)
   - The tables sit behind an `AchievementStore` interface, with an in-memory version for tests and for local dev without a database.
   - Writes are async and never touch the 60 Hz loop. With no database set, badges are off and everything else works.
5. **Discord role sync** (`server/badges/roles.ts`).
   - On a tier change it calls `PUT` for the new role and `DELETE` for the old one on `/guilds/{g}/members/{u}/roles/{r}`, using the bot token.
   - It re-syncs at sign-in to fix drift.
   - It reads `DISCORD_BOT_TOKEN` and `DISCORD_TIER_ROLE_IDS` (five ids, in order) from Key Vault. With them unset, sync is skipped.
6. **API and UI.**
   - `GET /api/profile/:id` and `/api/profile/me`, plus `DELETE /api/profile/me`.
   - `profileScreen` in `src/ui/screens.ts`, with routing for `/profile/...`.
   - The result message gains `unlocked` and `newTier`.
7. **Infra and docs.**
   - Infra adds the database and its managed-identity login, plus Key Vault references `SpellstickLiveBotToken` and `Integrations--Discord--TierRoleIds`. `infra/README.md` loses "No database".

## Paul's one-time setup

- **The 5 roles.** Create them in the Darkspace server with the colours above, hoisted, and upload the icons from `assets/discord/`. Role icons need **Server Boost level 2**; without it the roles still work, just with no icon.
- **The bot.** Give the Spellstick Live bot **Manage Roles**. Its own role must sit **above** the five tier roles.
- **Key Vault.** Put the bot token and the five role ids in.
- **The database.** Confirm the new `spellstick_live` database on `psql-ha7siia4h4zia`, or let bicep create it.
