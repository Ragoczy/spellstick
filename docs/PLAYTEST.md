# Playtest notes — M5 (Mana and spells)

**Build:** https://ragoczy.github.io/spellstick/ (the git SHA is in the bottom-right corner)

The spell names and effects are placeholders from the spec. They're all in one file (`src/content/spells.ts`) for when you have the real ones.

## What changed

- **Mana:** each runner has a mana bar (bottom-left, under the Q/E/R icons). It refills slowly, a bit faster when you don't have the ball. The little ticks on the bar mark what each spell costs.
- **Q — Hex Shove** (50 mana, 10 s cooldown): a gold cone blast in the direction your stick points. Everyone on the other team inside it is knocked back and dazed, and a ball carrier it hits always loses the ball. It doesn't move a goalie standing in their crease.
- **E — Quickstep** (30 mana, 8 s): 40% faster for 2.5 seconds. You get a gold aura.
- **R — Bent Shot** (25 mana, 5 s): arms your next shot (your stick head pulses gold). Aim at a corner and shoot: the ball starts out wide of the post, as if it's going to miss, then curls back in onto your cursor, leaving a gold trail. The goalie reads it badly.
- **Ward (goalies, automatic):** a goalie can throw up a gold shield across the goal mouth that blocks one shot that beat them. It has a 3-minute cooldown, so each goalie gets about one per period. The AI goalie decides when.
- **Spell icons:** each shows its key, a dark shutter that lowers as it recharges, dims when you can't afford it, and lights gold while it's active or armed.
- **The AI casts too:** Hex Shove mostly against a shooter winding up or a carrier right on top of its goal, Quickstep on breakaways and races for loose balls, Bent Shot on a lot of its shots.
- **Headless sim (1,000 full matches):** 6.4 goals per game. 83 casts per game, none above 40% of casts: Quickstep 36%, Bent Shot 33%, Hex Shove 26%, Ward 6%. Ward blocks about 3 goals a game, home win 50.8%, 0 stuck players.

## How to run

- Play: open the build link above. Click the page once if keys don't respond.
- Local: `npm install`, then `npm run dev`.

## Things to try

1. Press R, then wind up a shot at a top or bottom corner from about 9 m. Watch it bend. Compare with a normal shot from the same spot.
2. On defense, get close to the carrier (Space to switch), point your stick at them, and press Q.
3. Press E with the ball and some open floor ahead. Is the speed boost noticeable?
4. Shoot hard from close in and see if the goalie throws up a Ward.
5. Spend all your mana and see how long it takes to come back. Is the regen too slow to matter?
6. Watch the AI: does its spell use look smart, or random and spammy?

## Questions for you

1. Which spell feels best? Which feels weakest or most pointless?
2. Is Hex Shove too strong? It always strips the ball, which is what the spec says, so the cost and cooldown are what keep it in check.
3. Does Bent Shot read as "curves toward the cursor side"? I made it a banana shot that swings in from outside the post; say if you pictured something different.
4. Is mana regen too slow (you rarely get to cast) or too fast (spells all the time)?
5. Is the Ward fun, or does it just feel like being robbed?
6. Are the spell visuals readable mid-chaos?
