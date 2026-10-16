# Playtest notes — M13: pick your spells online, and M12's network log

**Build:** https://spellstick.games.darkspace.press (the git SHA is in the bottom-right corner)

## What changed

- **Spell picks in the online lobby.** Take a seat, press **Change spells**, and pick your three on the same screen as single-player (with **Done** instead of Start match). Your AI teammates carry the same three.
- **Both seats show their three**, to the players and to anyone watching, so you know what you're up against before the faceoff.
- **Your picks follow you.** You come into a room with the three you last picked (in either mode), and picks made online are remembered for single-player.
- **Changing spells takes back Ready**, so a last-second change can't sneak past the other player. Once the match starts, the spells are fixed.
- **No team pick.** The seat is still the team (Wyverns home, Ichthyocentaurs away), as you asked.
- **The server logs every online match (M12).** One anonymous line per match covers round trips, late controls, drops and rejoins, data per screen, and the server's own step cost. It holds no names or ids. infra/README.md, "Logs", has the command to read them.
- Anyone with a page open from before this update is asked to reload before playing online.

## How to run it

It's deployed. You need two Discord accounts in two browsers (or a private window), as for M11.

## Things to try

1. **Pick before a match.** Take a seat, press Change spells, and swap in three new ones. Check that the other player's lobby shows them on your seat.
2. **Change after readying.** Press I'm ready, then Not ready, then change spells. Ready should go away when you change, and the other player should see your new three.
3. **Play with them.** Start the match and check your spell bar shows your three, and that the other side casts theirs.
4. **Remembered.** After the online match, leave to the title and start a single-player match. The spell screen should start with the three you picked online.
5. **Inside Discord.** Pick spells in the Activity's lobby, the same as in a browser.
6. **After a match or two,** I'll pull the network log and report what it says about lag and late controls.

## Questions for you

1. Should picks stay **visible** to the other player in the lobby, or be hidden until the faceoff?
2. Should a player be able to **change spells between matches** without leaving their seat? (They can now, as long as they aren't ready.)
3. Is **Change spells** easy to find on the seat card, or should it sit next to I'm ready?
4. For M12: after you've played a few online matches, should I pull the logs and **tune the online feel** from them? Or should the in-game network readout (ping and corrections, on a debug key) come first?
