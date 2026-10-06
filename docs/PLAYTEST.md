# Playtest notes — M3 (Full teams and AI)

**Build:** https://ragoczy.github.io/spellstick/ (the git SHA is in the bottom-right corner)

## What changed

- **A full 5v5 match:** Wyverns vs Ichthyocentaurs, 4 runners and a goalie each, 4 periods of 2:30. You control one Wyvern; everyone else (including your teammates) is AI at Normal difficulty. There's no faceoff yet: after a goal everyone resets and races to a loose ball at center (faceoffs, the shot clock, and the crease rule come in M4).
- **Body checks (right click):** a short dash in the direction you're moving (or where your stick points if you're standing still). Hit someone and they're knocked back and dazed (little stars, about 0.6 s with no control); hit the carrier and there's a 40% chance the ball pops loose. Drive someone into the boards for a longer daze and a little screen shake. Your marker turns grey while your check recharges (1.4 s).
- **Goalie protection:** a goalie in their own crease can't be hit; you bounce off and get dazed yourself.
- **Space:** when your team doesn't have the ball, jump to the teammate nearest the ball (press again for the next nearest). When your team gets the ball, you automatically take the carrier.
- **Team AI:** on offense players spread out, drift, get open, and cut to the crease; the carrier shoots with an open look, jukes or sidesteps defenders, or passes. On defense each player marks someone goal-side, the nearest defender pressures and checks the carrier, and the others shade passing lanes or sag to the crease. Easy, Normal, and Hard presets exist and clearly differ (Hard beats Easy 36 of 40); you'll pick difficulty on the team-select screen in M6.
- **Headless sim (1,000 full matches):** 6.4 goals per game, ~50 shots, 13% shooting, ~118 checks (38% knock the ball loose), ~72 possession changes, home win 49.6%, 0 stuck players.

## How to run

- Play: open the build link above. Click the page once if keys don't respond.
- Local: `npm install`, then `npm run dev`.

## Things to try

1. Play a full period. Does it feel like a chaotic box-lacrosse game, or like a mob chasing the ball?
2. On defense, use Space to grab the defender nearest the ball, then right-click to check the carrier. Try from behind, and try driving them into the boards.
3. Carry the ball into traffic and see how often the AI checks you and strips it. Then try passing out of pressure.
4. Try to check the goalie while they're in the crease (you should bounce off), then while they're out chasing a loose ball.
5. Watch your AI teammates when you have the ball: are they getting open, or standing in the way?
6. Wind up a shot with a defender nearby; the AI is more likely to hit someone who's winding up.

## Questions for you

1. Is checking too strong, too weak, or about right? (Knockback, the 0.6 s daze, the 40% strip chance, the 1.4 s cooldown.)
2. Is the AI too hit-happy, or not physical enough? It checks roughly once every 4 seconds of close pressure.
3. Does the dash-check feel good to aim with WASD, or would you rather it go toward the mouse?
4. Is Space-switching picking the player you expect?
5. Scoring is around 6 goals a game AI-vs-AI, the low end of the 6–20 target. Do you want more scoring (weaker goalies, fewer blocks) or is a tight game right?
6. Anything the AI does that looks dumb or broken? Notes on what and where are gold.
