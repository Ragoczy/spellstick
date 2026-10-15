# Playtest notes — M10: choose your spells, and M11: online 1v1

**Build:** https://spellstick.games.darkspace.press (the git SHA is in the bottom-right corner)

## M10: choose your spells

### What changed

- **Ten spells, from the card game's library.** Before each match you pick three for your team. They go on Q, E, and R (X, Y, and B on a controller) in the order you pick them. Your AI teammates carry the same three; the other team gets three at random.
- **The old three are renamed:** Hex Shove is now **Thunderclap**, Quickstep is **Burst of Speed**, and Bent Shot is **Misdirection**, and they're your starting picks. Thunderclap works as before; Burst of Speed is now +50% for 3 seconds and much cheaper; Misdirection costs a little more and is a little easier to save.
- **Seven new spells:**
  - **Pinpoint:** your next shot goes exactly where you aim, and is harder to save.
  - **Blink:** teleport a few steps the way you're moving, ball and all. It won't take you into the crease you attack.
  - **Snare:** pins the nearest opponent in front of you in place and binds their stick: no shooting, catching, or scooping until it breaks, and a carrier may have the ball yanked loose toward you. A hit knocks them free, and the same player can't be snared again for a few seconds.
  - **Ice Wall:** a short wall appears in front of you for a few seconds; balls and witches bounce off it. It won't go up touching a crease.
  - **Stone Skin:** for a few seconds, checks and Thunderclaps can't knock you down or strip the ball.
  - **Tailwind:** your next pass flies fast and far, can't be picked off, and is always caught.
  - **Glamour Self:** two illusions run beside you; a check, Thunderclap, or Snare at you hits an illusion two times in three.
- Team select's button is now **Choose spells**, which leads to the spell screen. Your picks are remembered with your team.
- Training still teaches the starting three.

### How to try it

1. Play → Choose spells. Tap the starting three to drop them, then pick three new ones. Note which key each lands on.
2. Try each new spell at least once. Good tests: Blink past a defender; Ice Wall between a shooter and your goal; Stone Skin when someone lines up a check; Tailwind before a long pass.
3. Watch what the other team casts (their three are random each match).
4. On a controller: the spell screen works with the D-pad and A, and X / Y / B cast your three.
5. Rematch keeps your three; Main menu → Play lets you change them.

### Questions for you

1. Which spells feel too strong or too weak? In the sim, every spell's team wins between 45% and 58% against teams without it, but the computer plays them, not people.
2. Are the effects readable? Especially Snare's gold bindings, Stone Skin's ring, and the Glamour Self illusions.
3. Should the opponents' spells show somewhere (on the HUD or the faceoff banner), so you know what you're up against?
4. Should team styles prefer certain spells (the Wyverns on Thunderclap and Stone Skin, the Ichthyocentaurs on Tailwind and Blink), rather than random picks?
5. The names and blurbs come from the card game. Any you'd change for this game?

## M11: online 1v1

### What changed

- **Online 1v1** is a new button under Play on the title screen. Two people each run one team, exactly as in single-player: you control one witch, control follows the ball, Space switches on defense, and you take your own faceoffs. The AI plays everyone else on both teams.
- **Rooms.** In a browser, Online 1v1 makes a room and shows a link to send a friend; opening the link (after logging in) goes straight to that room. Inside Discord, everyone in the same Activity is in the same room, with no link needed.
- **Lobby.** Two seats: home is the Wyverns, away the Ichthyocentaurs. Take a seat, press I'm ready, and when both are ready a 3-second countdown starts the faceoff. Everyone else watches, and goes into the match with the players.
- **The server runs the match.** Your screen predicts a little ahead so your own witch answers at once, and smooths over the small corrections when the server's version arrives.
- **No pause online.** Esc opens a menu (Keep playing, Controls, Leave match); the match goes on behind it.
- **Dropping out.** If a player leaves or loses their connection, the AI takes their side straight away. Coming back to the same room (same Discord account) gives them their seat back mid-match. A screen retries a lost connection a few times on its own.
- **Goal replays** play for everyone while the match waits. Either player can skip; the match restarts when both have skipped or the replay ends.
- **Results** show both players' names; Back to the lobby keeps the seats for a rematch.

### How to run it

It's on `main` now, so it's in the deployed build with M10. The second player needs a **different Discord account** in another browser (or a private window): the same account in two windows bumps the first one out. Online matches still use the starting three spells for both sides; picking spells in the lobby is M13.

### Things to try

1. **A full match against a friend.** One of you presses Online 1v1 and sends the link; take a seat each and ready up. Play all four periods, and notice whether your own witch ever feels late or slippery.
2. **Watch.** With a third person (or a third window) in the room, check that the watcher sees the match smoothly and hears the goals.
3. **Drop and come back.** Mid-match, close one player's tab, wait 10 seconds (the AI plays that side), then open the room link again. The seat should come back with the match still going.
4. **Goal replays.** After a goal, have one player skip and the other not: the skipper sees "Waiting for the other player…", then the faceoff comes for both together.
5. **Esc.** Open the menu mid-match and check the match keeps going and your witch stands still; Keep playing gives you control back.
6. **Inside Discord** (once deployed): launch the Activity in a voice channel with a friend and play from the lobby there.

### Questions for you

1. **Does your own witch feel as quick as in single-player?** If not, is it a delay before she moves, or her jumping a bit after she moves?
2. **How does your opponent's witch look on your screen:** smooth, or does she stutter or snap now and then (especially around checks and steals)?
3. Is the lobby clear (seats, ready, the link), or is a step confusing?
4. Should there be a rematch shortcut on the results screen ("Rematch" that readies you straight away), or is going back to the lobby fine?
5. Should watchers be able to take a seat between matches, or keep it to whoever sat first?
6. Seats are fixed teams for now (Wyverns home, Ichthyocentaurs away). Is picking your team and your three spells in the lobby (planned as M13) what you want next, or something else first?
