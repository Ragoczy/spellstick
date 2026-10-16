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
| `intoTheBoards` | **Into the Boards** | Slam opponents into the boards 3 times in one match (within 1.5 s of your hit) | Cracked board |
| `lightFingers` | **Light Fingers** | Knock the ball loose 10 times in one match (check, Thunderclap or Snare) | Open hand and a loose ball |
| `shutout` | **Shutout** | Win without conceding | Goal mouth with a ward glyph |
| `suddenDeath` | **Sudden Death** | Win in overtime | Hourglass |
| `comeback` | **Comeback** | Win after trailing by 2 or more goals | Rising arrow through the net |
| `fullLibrary` | **Full Library** | Cast all 10 spells at least once across your online matches | Open spellbook |

- **The numbers are tuning** (`config.badges`). The how-to lines read them, so changing one changes the text too.
- **Measured rates.** `npm run sim` reports how often a first-time player on each side would unlock each one. "You" is the witch control follows, as online. Over 1,000 AI-vs-AI games with random spells:

  | Achievement | Rate |
  |---|---|
  | First Whistle | 100% |
  | Off the Mark | 95% |
  | First Win | 50% |
  | Hat Trick | 62% |
  | Light Fingers | about 18% (at 10) |
  | Into the Boards | 7% |
  | Shutout | 5% |
  | Sudden Death | 8% |
  | Comeback | 6% |

  - **Light Fingers was 100% at 3.** At 10 it's about half of matches with the starting spells (Thunderclap loosens a lot) and about 18% with random ones.
  - **Comeback was under 1% at 3**, so it's 2.
  - **Hat Trick stays at 3**, because that's what the name means. It's one of the early ones.
  - **The sim notes** any skill one over 60% or under 1%.
- **The curve.** A first match usually brings three or four achievements, so tier 1 or 2 straight away. Tier 3 comes after a few matches. Tiers 4 and 5 need the rare ones (Into the Boards, Shutout, Sudden Death, Comeback, Full Library), which take weeks of play.
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
- **Unlink screen.** It used to promise "keeps no stats, match history, or profile on its server"; it now lists the online record among what you lose. **Unlinking deletes the record and the tier role** on the server, before it ends the session. If the delete fails, nothing changes and the screen says so. Your own profile also has **Delete my record**, which deletes it without unlinking.
- **The Privacy Policy** (an external page) should mention the online record. That's Paul's to update.
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
   - Tables (the migration is in `server/migrations.ts`, so the one-file server bundle carries it):
     - `players` (discord_id, username, avatar_url, tier, matches, wins, goals, spells_cast, first_seen, last_seen)
     - `achievements` (discord_id, achievement_id, unlocked_at), deleted with the player
   - The tables sit behind an `AchievementStore` interface, with an in-memory version for tests and for local dev without a database.
   - Writes are async and never touch the 60 Hz loop. With no database set, badges are off and everything else works.
5. **Discord role sync** (`server/badges/roles.ts`).
   - On a tier change it calls `PUT` for the new role and `DELETE` for the old one on `/guilds/{g}/members/{u}/roles/{r}`, using the bot token.
   - It re-syncs at sign-in to fix drift.
   - It reads `DISCORD_BOT_TOKEN` (Key Vault secret `SpellstickLiveBotToken`) and `DISCORD_TIER_ROLE_IDS` (five IDs, lowest first; a plain setting, as IDs aren't secret). With them unset, sync is skipped.
6. **API and UI.**
   - `GET /api/profile/:id` and `/api/profile/me`, plus `DELETE /api/profile/me`.
   - `profileScreen` in `src/ui/screens.ts`, with routing for `/profile/...`.
   - The result message gains `unlocked` and `newTier`.
7. **Infra and docs.**
   - Infra adds the database, the bot token's Key Vault reference, and the database settings, all behind `badgesEnabled` (off by default). A missing Key Vault secret would stop the app starting, so it stays off until the secret exists. The steps are in `infra/README.md`, "Badges".

## Paul's one-time setup

- **The 5 roles.** Create them in the Darkspace server with the colours above, hoisted, and upload the icons from `assets/discord/`. Role icons need **Server Boost level 2**; without it the roles still work, just with no icon.
- **The bot.** Give the Spellstick Live bot **Manage Roles**. Its own role must sit **above** the five tier roles.
- **Key Vault.** Put in the bot token as `SpellstickLiveBotToken`. The five role IDs go in `infra/main.bicepparam`.
- **Turn it on.** Set `badgesEnabled = true`, run the template (it creates `spellstick_live`), add the app's database login with SQL, and restart. The exact commands are in `infra/README.md`, "Badges".
