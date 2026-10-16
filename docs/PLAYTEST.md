# Playtest notes — hidden spells, and M12's network readout

**Build:** https://spellstick.games.darkspace.press (the git SHA is in the bottom-right corner)

## What changed

- **Spells are hidden until used.** In the online lobby you see only your own three; the other seat says "Spells: hidden until cast". The server no longer sends anyone else's picks to your screen.
- **The other team's spells in the corner.** In a match (single-player and online), the other team's three show as "?" in the bottom-right corner. Each one turns into its name the first time anyone on that team casts it. A watcher sees both teams' panels, home's at the bottom left.
- **Network readout (M12): press N in an online match.** A small panel at the top left shows:
  - **Ping:** the latest round trip and its average.
  - **Ahead:** how far your screen runs ahead of the server, in ticks and milliseconds.
  - **Controls:** how early your controls reach the server. It aims for 3 ticks early; "late" means the server had to guess.
  - **Updates:** how many updates arrive a second, and the data rate.
  - **Corrections:** how often and how far your screen's guesses get corrected. Your own witch and everyone else are listed separately.

  Press N again to hide it. It's off after a reload.
- The controls card lists N.
- Anyone with a page open from before this update is asked to reload before playing online.

## How to run it

It's deployed. Online needs two Discord accounts in two browsers (or a private window), as before.

## Things to try

1. **Lobby.** Take seats and change your spells. The other player should see "hidden until cast" on your seat, never the names.
2. **Reveal.** In a match (single-player is fine), watch the bottom-right "?"s fill in as the other team casts. In single-player, do the ones that appear match what you saw them cast?
3. **Readout.** In an online match, press N and play for a minute. Note the Ping and Controls lines, and whether Corrections for "you" stay small (a few cm) while you run, check, and cast.
4. **Bad network.** If you can, try one player on a weaker connection (phone hotspot, far-away Wi-Fi) with N up. Does "Controls" go late, and do Corrections jump? Does the witch feel worse at the same moments?
5. **Inside Discord.** Press N in the Activity. Discord sometimes adds its own delay.

## Questions for you

1. Does the **"?" panel** read clearly, and is the bottom-right the right place, or does it get lost?
2. The panel is in **single-player** too, where the opponents' spells were never shown before. Keep it there, or online only?
3. In the readout, which numbers matched what you **felt**? For example, did the witch feel late when Controls said late, or slippery when Corrections for "you" went up? Tell me what the readout showed in a bad moment, and I'll tune from it (input lead, smoothing, or update rate).
4. Is **N** a fine key for it, or would you rather it lived in the online Esc menu?
