# Playtest notes — M6 (Screens, polish, balance)

**Build:** https://ragoczy.github.io/spellstick/ (the git SHA is in the bottom-right corner)

This is the full v1 loop. Try it the way a reader from Discord or Patreon would: open the link cold and see if you can get into a match without help.

## What changed

- **Title screen**, with an AI-vs-AI match playing behind it, a credit line for the Warlock series, Play, and Controls.
- **Team select:** pick your team (Wyverns, Ichthyocentaurs, or Willowmere Witches), the opponent, and Easy, Normal, or Hard. It remembers your last choice. You always play the left side; difficulty sets the opponents, and your AI teammates are always Normal.
- **Controls card:** one screen with every control and four tips. It shows before your first match, and from the title and pause menus.
- **Pause (Esc):** Resume, Controls, or Quit to title.
- **Results:** final score (and "OT" if it went there), who won, and shots, saves, hits, and spells cast for each team. Then Rematch or Main menu.
- **Announcer:** text callouts at the bottom of the screen for goals, saves, Ward blocks, big hits, pile-ups, strips, shot-clock and crease calls. It uses all three canon exclamations ("Child's Tantrum!", "Crone's Corns!", "Third-witch in!"); everything else is plain sports filler and lives in `src/content/announcer.ts`.
- **Sound:** a hit thump, a pass whoosh, a shot crack, a goal horn, a whistle, and a spell shimmer. They're generated in the browser, so there are no audio files. Toggle with M or the button in the top-right corner.
- **Balance:**
  - Difficulties are distinct but beatable. Measured as a Normal AI team against each: it beats Easy 78%, Normal about 50%, Hard 30%.
  - Less chaotic, per your M3 note: about 76 checks a game (was 115), a check strips the ball 35% of the time (was 40%), and about 46 possession changes a game (was 72).
  - The CLAUDE.md thresholds are now a hard CI gate over 1,000 games: 6.6 goals per game, no spell above 36% of casts, home win 52.6%, 0 stuck players.

## How to run

- Play: open the build link above.
- Local: `npm install`, then `npm run dev`.

## Things to try

1. Open the link cold. Without reading anything but the controls card, can you get into a match and play a full one?
2. Play a match on each difficulty. Does Easy feel winnable for someone new, and Hard actually hard?
3. Score a goal and land a big hit into the boards; listen to the sound and watch for the announcer.
4. Pause mid-match with Esc, open Controls from there, then resume.
5. Finish a match and read the results screen. Then try Rematch, and Main menu.
6. Toggle sound with M, reload, and check that it stayed muted.

## Questions for you

1. Is the controls card enough for a new player, or is anything missing or confusing?
2. Do the announcer lines fit the tone? Any to cut or add? (There's a slot per situation in `src/content/announcer.ts`.)
3. Are the generated sounds OK as placeholders, or annoying? Would you rather start muted?
4. Is the difficulty spread right? Hard is tuned so a Normal AI team still wins about 30%.
5. The credit line reads "Set in the world of Daniel Kensington's Warlock series (Darkspace Press). A free fan game." Is that the right wording, or should it say something else (official, links)?
6. Anything you'd want before posting the link to Discord or Patreon?

## Bonus: the 8-bit look (optional)

Add `?look=8bit` to the address: https://ragoczy.github.io/spellstick/?look=8bit. The rink, players and effects draw as chunky pixel art, and the players become pixel witches with their own hair and skin. The scoreboard and menus stay in the normal font. Without the flag the game looks exactly as before. If you decide to keep it, the next steps are a pixel font for the HUD and menus and drawing the stick into the sprite.
