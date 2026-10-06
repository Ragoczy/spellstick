# Spellstick — Game Spec (v1)

Items marked **[DEFAULT]** are choices Claude made for v1 that Paul can override.
Items marked **[PLACEHOLDER]** are non-canon content to be renamed or replaced.
Items marked **[CANON]** come from the Warlock books. Don't contradict them.

## 1. Pitch

A fast, top-down, arcade sports game in the browser. You control one witch at a time on a spellstick team in a short match against an AI team. It plays like box lacrosse with legal violence and spells. A match lasts about 8–10 minutes.

**Purpose:** a free promotional and community piece for Warlock readers, playable from a link posted on Discord or Patreon. **[DEFAULT]**

**Platforms (v1):** desktop browsers with keyboard and mouse. Mobile and touch are out of scope for v1, but don't make choices that rule them out (e.g., keep the UI scalable).

## 2. Canon

- **[CANON]** Spellstick is a full-contact magical sport based on lacrosse, played by witches.
- **[CANON]** Checks that are illegal in real lacrosse are legal in spellstick: hits from behind, hits into the boards, cross-checks. Violence is part of the sport, not a foul.
- **[CANON]** The positions are attack, midfield ("middies"), defense, and goalie.
- **[CANON]** Magic shows as a golden-orange glow (mana): sticks, shots, and spell effects glow gold-orange.
- **[CANON]** Team names include the Wyverns, the Ichthyocentaurs, and the Willowmere Witches.
- **[CANON]** The announcer uses witch-flavored exclamations such as "Child's Tantrum!", "Crone's Corns!", and "third-witch in".
- **[CANON]** Prep teams feed a varsity squad. This is flavor only and has no gameplay effect in v1.

**v1 match-up:** the Wyverns (the player's team by default) vs the Ichthyocentaurs. The team select screen also offers the Willowmere Witches. **[DEFAULT]**

## 3. Format

- **Arena:** enclosed rink with boards (box-lacrosse style). The ball never goes out of bounds; it bounces off the boards. **[DEFAULT]**
- **Teams:** 4 runners + 1 goalie per side. **[DEFAULT]** The team size is a config value; the code must also work with 3 runners or 5.
- **Runner roles:** 2 attack-leaning and 2 defense-leaning. Roles only bias where the AI positions a player; anyone can go anywhere.
- **Match length:** 4 periods of 2:30 game-clock time (config), with a short break screen between periods.
- **Overtime:** if tied at the end, sudden-death overtime; first goal wins.
- **Goals:** small goals with a circular crease in front of each.

## 4. Rules (implement all of these, each with unit tests)

1. **Faceoff:** at center at the start of each period and after every goal. Two players are locked at center. On the whistle, both press the action button, and the faster timing wins the ball. The AI's timing is randomized within a skill window. A misfire before the whistle loses the faceoff.
2. **Possession:** a player carries the ball in their stick head. The carrier is "the ball carrier." Loose balls are picked up automatically when a player without the ball moves over them, with a scoop chance from config (higher if moving slowly).
3. **Shot clock:** 30 s (config), starting when a team gains possession. It resets when possession changes or a shot hits the goal frame or the goalie. On expiry, possession turns over at the spot.
4. **Crease:** offensive players may not enter the opponent's crease. If one does while carrying the ball, it's a turnover to the goalie. A goal scored while any attacker is in the crease is disallowed and turns over. Defenders may enter their own crease freely.
5. **Checks are legal (canon).** Body checks and stick checks are allowed from any direction. A body check on the carrier has a config chance to knock the ball loose. A body check on any player knocks them back and briefly staggers them.
6. **Goalie protection [DEFAULT]:** a goalie standing inside their own crease cannot be body-checked, because the checking player bounces off. This keeps scoring sane. It's the only "you can't hit them" rule.
7. **No other penalties in v1.** There's no penalty box. The sport is brutal by design.
8. **Score:** a goal is worth 1. The team with the most goals at the end of regulation wins; if tied, overtime (see §3).

## 5. Controls (desktop)

| Input | Action |
|---|---|
| WASD | Move the controlled player |
| Mouse | Aim (passes, shots, and directional spells aim at the cursor) |
| Left click (tap) | Pass toward the cursor; the nearest teammate in the cone gets assist magnetism |
| Left click (hold, release) | Shot: hold to charge power, release to fire |
| Right click | Body check: a short dash in the move direction, with a cooldown |
| Q / E / R | Spells 1–3 (see §6) |
| Space | Switch to the teammate nearest the ball (on defense). On offense, control follows the ball automatically. |
| Esc | Pause |

Auto-switching: when your team gains possession, you control the carrier. After you pass, control follows the ball to the receiver. **[DEFAULT]**

## 6. Mana and spells

- Each runner has a mana bar (default max 100) that regenerates slowly and refills a bit faster while not carrying the ball. **[DEFAULT]**
- Each spell has a mana cost and a cooldown. All numbers are in config.
- Spells use the gold-orange glow. Keep visuals readable: a big shape and a short duration.
- The AI uses spells using the same rules as the player.

**Starter spell set [PLACEHOLDER — names and effects are not canon; Paul to replace]:**

| Key | Spell | Effect |
|---|---|---|
| Q | **Hex Shove** | A short-range cone blast: knocks back and staggers opponents in the cone, and knocks the ball loose if it hits the carrier |
| E | **Quickstep** | +40% move speed for 2.5 s |
| R | **Bent Shot** | The next shot curves toward the cursor side mid-flight, making it harder for the goalie to read |

**Goalie [PLACEHOLDER]:** the goalie has one automatic spell, **Ward**, which blocks one shot completely. It has a long cooldown and the AI decides when to use it. The player never controls the goalie in v1; the goalie is always AI.

## 7. AI

- The AI uses the same input commands as a human player (see the architecture rules in CLAUDE.md).
- **Off the ball on offense:** spread to open spots, cut toward the goal, and make themselves available for passes.
- **On defense:** each defender marks an opponent; the nearest defender pressures the carrier; others guard passing lanes and the crease.
- **Carrier decisions:** shoot when there's an open lane in range; otherwise pass to an open teammate or carry the ball. Respect the shot clock (shoot more as it runs down).
- **Spells:** use them situationally (e.g., Hex Shove on a nearby carrier, Quickstep on a breakaway), not on cooldown spam.
- **Difficulty:** Easy / Normal / Hard via config: reaction delay, aim error, decision quality, and faceoff timing window.
- **Watch for stuck players:** if a player barely moves for more than 5 s while play is live, that's a bug. The headless sim reports it.

## 8. Presentation

- **v1 art:** placeholder shapes only. Players are colored circles with a stick line and a number; the ball is a small white dot with a gold glow while in flight; goals are rectangles; the crease is a circle outline. Team colors: Wyverns crimson, Ichthyocentaurs sea-teal, Willowmere Witches violet. **[DEFAULT]**
- **Gold-orange glow** on spell effects and charged shots: a simple glow via additive blending or a sprite.
- **HUD:** score, period, game clock, shot clock, the controlled player's mana bar, spell cooldown icons, and a marker over the controlled player.
- **Announcer callouts (M6):** short text pop-ups on goals, saves, big hits, and turnovers, drawn from a line list in `src/content/announcer.ts` that includes the canon exclamations from §2. Text only; no audio in v1.
- **Audio (v1):** simple sound effects (hit, pass, shot, goal horn, whistle) from free or generated sources, with a mute toggle. Keep it optional.
- **Art pass is out of scope for v1.** Keep rendering sprite-swappable so real art (Paul's ComfyUI work) can replace the shapes later without touching the sim.

## 9. Screens

Title screen → team select (your team, opponent, difficulty) → match → results (score and simple stats: shots, saves, hits, spells cast) → back to title.

## 10. Out of scope for v1

Online multiplayer, local 2-player, mobile/touch, accounts and leaderboards, season mode, player progression, real art, music, and voiced announcer audio.
