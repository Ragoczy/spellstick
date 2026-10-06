# Playtest notes — M2 (Passing, shooting, goalie)

**Build:** https://ragoczy.github.io/spellstick/ (the git SHA is in the bottom-right corner)

## What changed

- **2v0 + goalie drill:** you (#7) and an AI teammate (#12) attack the Ichthyocentaurs' goalie (#1, white ring).
- **Pass:** click (tap) to pass toward the cursor. If a teammate is roughly where you're aiming (within about 22°), the pass leads them and bends toward their stick. A faint white ring shows who would get it.
- **Shoot:** hold the button to wind up (a gold arc fills around you and your stick head glows), release to fire. A longer hold means a harder shot, up to 1 second. You move slower while winding up, and running shots are a little less accurate.
- **Control follows the ball:** when your teammate catches your pass, you control them and the other player goes back to AI.
- **Goals:** the net is open at the front. Shots can ring off the posts or the back of the frame. A goal shows a "GOAL!" banner, pauses 2 seconds, then resets.
- **Goalie:** shadows the ball, jumps toward the shot's line after a short reaction, saves (sometimes catching, sometimes giving up a rebound), and clears the ball back up the floor after holding it for a moment.
- **Headless sim:** now 2 runners + goalie per side with real AI. Over 1,000 games: 15.2 goals per game, home win 50.4%, 0 stuck players. Shot volume is high (~135 per game) and the AI shoots into defenders a lot (~69 blocks per game); M3's full teams and M4's shot clock will reshape that.

## How to run

- Play: open the build link above. Click the page once if keys don't respond.
- Local: `npm install`, then `npm run dev`.

## Things to try

1. Pick up the ball and pass to #12 with a quick click. Aim a bit off them and see whether the magnetism feels helpful or like it's taking control from you.
2. Get the ball back (#12 will be under your control after the catch), then shoot from about 9 m out, roughly halfway between the crease and the center line, aiming for the corners.
3. Shoot straight at the goalie, then at a corner, then from close in, then from far out. Do the results feel fair?
4. Compare a quick-release shot (short hold) with a full wind-up.
5. Pass while running and while your teammate is running; check whether the lead feels right.
6. Shoot from a sharp angle and watch for post hits and rebounds.

## Questions for you

1. Does the tap vs hold split feel right? (A press under 0.18 s is a pass.) Do you ever pass when you meant to shoot, or the reverse?
2. Is the pass speed right: too slow, too zippy?
3. Is the goalie too good, too weak, or about right? My measurements: a well-placed hard shot from 9 m goes in about a third of the time; straight at the goalie, about 15%.
4. Does the wind-up (1 s to full power) feel too long?
5. Is the assist magnetism too strong (it steers passes you didn't intend) or too weak (passes miss teammates you were clearly aiming at)?
6. Should control switch to the teammate who catches your pass (the current default), or should you stay on one player?
