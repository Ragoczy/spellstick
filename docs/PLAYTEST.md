# Playtest notes — M12: online feel tuned from a network sim

**Build:** https://spellstick.games.darkspace.press (the git SHA is in the bottom-right corner)

## What changed

- **A network sim.** `npm run sim -- --net` plays whole online matches between two simulated screens and the real server room. It runs over simulated connections to the East US server: east coast, west coast, Europe, Australia/Asia, and busy Wi-Fi. The screens run the game's own prediction code, and the report says how often and how far each screen gets corrected. The numbers are in docs/DECISIONS.md.
- **Online play predicts less far ahead.** Your screen used to send its controls about 5 ticks (83 ms) before the server needed them. It now aims for 2 ticks (33 ms) and stays there. That means less guessing about everyone else.
  - In the sim, on a good connection, other witches are drawn about half as far from where they really are (19 → 9 cm at worst, most of the time).
  - Your own witch is corrected about 40% less often.
- **A cushion for bad connections.** When your controls start arriving late (Wi-Fi hiccups, long distance), your screen adds up to 3 ticks of extra lead, then gives it back after 10 calm seconds.
- **Unchanged:** smoothing (0.1 s) and the update rate (30 a second). Faster updates would double the data for a small gain, and smoothing is a feel question for you (below).
- **The N readout's "aim"** now shows the live target: 2 normally, up to 5 when the cushion is in use.

## How to run it

It's deployed. Online needs two Discord accounts in two browsers (or a private window), as before. To run the sim yourself: `npm run sim -- --net --games 4 --seed 1`. It takes about a minute.

## Things to try

1. **Same-region match.** Play a full online match with someone close by. Press **N**: "Controls" should say about 1–2 ticks early (aim 2), and "Corrections" for others should be small.
2. **Contact.** Body-check and Thunderclap the other player's witch, and race them to loose balls. Those are the moments prediction gets wrong. Do hits land where they look like they land?
3. **Long distance.** If anyone outside North America can play, have them press N and watch "aim". It should climb to 3–5 when their controls run late. Does their witch still feel like it answers right away?
4. **Wi-Fi.** One player on a phone hotspot or far from the router. Do stutters clear up within a few seconds?
5. **Watching.** A third person watching: does play look smooth, with no jumps?

## Questions for you

1. Compared with before, do **other witches look steadier** (fewer small jumps when they turn or get hit)?
2. Does **your own witch** ever feel like it gets pulled back or nudged sideways? If so, when (checks, spells, loose balls)?
3. **Smoothing:** when something does get corrected, does it slide too slowly (looks floaty) or pop (looks jumpy)? I can make the slide shorter or longer.
4. If someone played from far away, what did the readout show at a bad moment (Ping, Controls, aim)? That's what I'd tune next, with real numbers instead of the sim's guesses.

Next up is M14 (badges, tier roles, achievements; docs/BADGES.md), started straight after this gate as you asked. Feedback here still comes first.
