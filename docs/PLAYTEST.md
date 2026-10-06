# Playtest notes — M4 (Rules and match flow)

**Build:** https://ragoczy.github.io/spellstick/ (the git SHA is in the bottom-right corner)

## What changed

- **Faceoffs:** every period starts, and play restarts after every goal, with a faceoff at center. You always take your team's draw. Wait for the "WHISTLE!" flash, then click; first click wins the ball. Click early and it's a misfire: the other team gets it. The whistle comes at a random moment 1–2 seconds after everyone sets.
- **Shot clock:** 30 seconds, shown under the game clock and outlined in the color of the team it's running for. It turns red at 10. It restarts when the ball changes teams or a shot hits the post or the goalie. If it runs out, the other team gets the ball where it is.
- **Crease:** carry the ball into the other team's crease circle and it's a turnover to their goalie. A goal scored while any attacker is standing in the crease is waved off. Defenders can stand in their own crease.
- **Periods and overtime:** 4 periods of 2:30 with a short "End of period" break between them. If it's tied after four, it goes to sudden-death overtime (OT, then 2OT if needed). First goal wins.
- **HUD:** both scores, the period, the game clock, the shot clock, and callouts for goals, misfires, crease and shot-clock turnovers, and overtime. A final screen at the end; click to play again.
- **AI:** takes faceoffs with a reaction time and an occasional misfire, gets more shot-happy as the shot clock runs down, and stays out of the opponent's crease.
- **Headless sim (1,000 full matches):** every match finishes (no ties); 16.5% go to overtime; faceoffs split 51/49 with 7.5% misfires; 6.5 goals per game; 0.4 crease violations per game (26 goals waved off in 1,000 games); home win 49.8%; 0 stuck players. Shot-clock violations are 0 in AI play because possessions rarely last 30 seconds in this chaotic game; the rule is covered by unit tests.

## How to run

- Play: open the build link above. Click the page once if keys don't respond.
- Local: `npm install`, then `npm run dev`.

## Things to try

1. Win the opening faceoff. Then try jumping the whistle on purpose to see the misfire.
2. Sit on the ball in your own half and let the shot clock run out.
3. Carry the ball into the opponent's crease. Then stand a teammate in the crease (switch to them with Space when you don't have the ball) and score.
4. Play through a period break and watch the shot clock and game clock pause.
5. If you can, get a tied game to overtime and score the winner (or lose it).
6. Check the HUD is readable at a glance mid-play.

## Questions for you

1. Is the faceoff fun? Too easy, too hard to win against Normal? Is a 1–2 second random whistle delay right?
2. Is 30 seconds the right shot clock for a game this fast, or would you rather it bite more often?
3. Is the crease rule clear when it happens, or does the turnover feel like it came from nowhere?
4. Are 2:30 periods the right length? (A match is about 10–11 minutes with breaks.)
5. Anything missing from the HUD you'd look for during play?
