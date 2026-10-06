# Playtest notes — M1 (Movement and the ball)

**Build:** https://ragoczy.github.io/spellstick/ (the git SHA is in the bottom-right corner)

## What changed

- You control one Wyvern (#7, the white chevron above them). WASD moves with acceleration and a short glide when you let go. The stick follows your mouse.
- The ball starts loose at center. Run over it to scoop it up automatically. Scoops can fail (more often when you hit the ball fast), and a miss knocks the ball a little way off your stick.
- While carrying, the ball sits in your stick head and you run 8% slower.
- Debug keys: **G** drops the ball at your feet; **T** tosses it toward the cursor at pass-like speed so you can test bounces. A loose ball moving fast glows gold.
- The ball rolls, slows, and bounces off the boards (and off the goals, which are solid until scoring arrives in M2).
- The headless sim now runs a 1v1 duel with a placeholder AI. 1,000 games: 0 stuck players, 70% scoop success. Goals are still 0, so the goals-per-game warning is expected.

## How to run

- Play: open the build link above. Click the page once if keys don't respond.
- Local: `npm install`, then `npm run dev`.

## Things to try

1. Run in circles and figure eights. Stop suddenly. Change direction hard.
2. Run straight into the boards and into a corner, with and without the ball.
3. Pick up the ball, press **T** aiming at the side boards at a shallow angle, then at a steep angle, then into a corner.
4. Toss the ball, chase it down, and scoop it while it's still rolling fast. Then try approaching a slow ball gently.
5. Press **G** while sprinting and watch where the ball goes.
6. Toss the ball at a goal from the front and from behind.

## Questions for you

1. Does movement feel too floaty, too twitchy, or about right? Is the top speed right for a rink this size? (It takes about 8 seconds to run end to end.)
2. Does the stop-glide after releasing a key feel good, or should players stop dead?
3. Do board bounces feel believable: too bouncy, too dead, or about right?
4. Does a tossed ball roll too far, or die too quickly?
5. Is the scoop failure rate fun (a bit of scramble) or just annoying?
6. Are the players a readable size now (I made them a little bigger than life), and can you read the number?
