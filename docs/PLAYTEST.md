# Playtest notes — M5 re-gate (half-speed movement)

**Build:** https://ragoczy.github.io/spellstick/ (the git SHA is in the bottom-right corner)

## What changed since the M5 build

- **Movement is half speed**, as you asked. Runners top out at 3.75 m/s (was 7.5) and goalies at 3.25 (was 6.5). Acceleration and the stop-glide were halved too, so it feels the same, just slower.
- **Things that move players were scaled to match:** the check dash, check knockback, Hex Shove knockback, the bounce off a goalie in the crease, and how hard a board slam has to be.
- **Ball speeds are unchanged**, since you said movement. Passes and shots fly as before, so the ball now outruns players by more. If you meant the whole game at half speed, that's a quick change.
- **Retuned so AI-vs-AI matches still land in the 6–20 goals band:**
  - The AI shoots from about 2 m farther out.
  - It checks about 40% less often, which also helps your "too chaotic" note: 76 checks a game, down from 115.
  - It uses Quickstep less and Bent Shot a bit less.
  - Bodies block fewer shots.
  - Goalies are a touch weaker on corner shots.
  - The Ward recharges every 4 minutes instead of 3.
- **Headless sim (1,000 full matches):** 6.5 goals per game. Spell casts: Bent Shot 36%, Quickstep 33%, Hex Shove 23%, Ward 8% (none above 40%). Home win 48.9%, 0 stuck players. Shot-clock violations now happen (0.2 a game): possessions are slower, so the clock actually bites.

Everything else from the M5 build is the same: mana, Q (Hex Shove), E (Quickstep), R (Bent Shot), and the goalie's automatic Ward. See the spell list in `src/content/spells.ts`.

## How to run

- Play: open the build link above. Click the page once if keys don't respond.
- Local: `npm install`, then `npm run dev`.

## Things to try

1. Run end to end. It takes about 16 seconds now. Is the pace right, or did half overshoot?
2. Pass to a teammate who's running. With the ball relatively faster, do passes feel too quick or hard to lead?
3. Use Quickstep. At the slower base speed, does the 40% boost feel more meaningful?
4. Shoot from about 9 m at a corner with nobody in the way, then straight at the goalie.
5. Throw some checks. Do the hits still feel like hits at the smaller knockback?
6. Play a full period and see whether it feels less chaotic.

## Questions for you

1. Is half speed right, or would you like something in between (two-thirds, say)?
2. Should the ball slow down too, so the whole game runs at half pace?
3. **Shooting might be too easy now.** An open, well-placed hard shot from 9 m scores about 57% (it was about 35%); straight at the goalie, about 33%. The half-speed goalie can't get across as fast, and I weakened its saves a little to keep AI scoring in range. In real play most shots are contested (the AI shoots 22%). Does open shooting feel too easy?
4. Do checks and Hex Shove still have enough punch at half the knockback?
