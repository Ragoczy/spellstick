# Playtest notes — M11: online 1v1

**Branch:** `online-multiplayer` (not on `main` yet, so not deployed: M10's spell loadouts are in playtest there). The git SHA is in the bottom-right corner.

## What changed

- **Online 1v1** is a new button under Play on the title screen. Two people each run one team, exactly as in single-player: you control one witch, control follows the ball, Space switches on defense, and you take your own faceoffs. The AI plays everyone else on both teams.
- **Rooms.** In a browser, Online 1v1 makes a room and shows a link to send a friend; opening the link (after logging in) goes straight to that room. Inside Discord, everyone in the same Activity is in the same room, with no link needed.
- **Lobby.** Two seats: home is the Wyverns, away the Ichthyocentaurs. Take a seat, press I'm ready, and when both are ready a 3-second countdown starts the faceoff. Everyone else watches, and goes into the match with the players.
- **The server runs the match.** Your screen predicts a little ahead so your own witch answers at once, and smooths over the small corrections when the server's version arrives.
- **No pause online.** Esc opens a menu (Keep playing, Controls, Leave match); the match goes on behind it.
- **Dropping out.** If a player leaves or loses their connection, the AI takes their side straight away. Coming back to the same room (same Discord account) gives them their seat back mid-match. A screen retries a lost connection a few times on its own.
- **Goal replays** play for everyone while the match waits. Either player can skip; the match restarts when both have skipped or the replay ends.
- **Results** show both players' names; Back to the lobby keeps the seats for a rematch.

## How to run it

It isn't deployed, so for now it runs on your machine:

```bash
git switch online-multiplayer
npm ci
npm run env:pull
npm run serve
```

Open http://localhost:5190 and log in with Discord. The second player needs a **different Discord account** in another browser (or a private window): the same account in two windows bumps the first one out. To play a friend over the internet, or to try it inside Discord, it has to be deployed: merge `online-multiplayer` into `main` when you're ready, and the usual deploy puts it live.

## Things to try

1. **A full match against a friend.** One of you presses Online 1v1 and sends the link; take a seat each and ready up. Play all four periods, and notice whether your own witch ever feels late or slippery.
2. **Watch.** With a third person (or a third window) in the room, check that the watcher sees the match smoothly and hears the goals.
3. **Drop and come back.** Mid-match, close one player's tab, wait 10 seconds (the AI plays that side), then open the room link again. The seat should come back with the match still going.
4. **Goal replays.** After a goal, have one player skip and the other not: the skipper sees "Waiting for the other player…", then the faceoff comes for both together.
5. **Esc.** Open the menu mid-match and check the match keeps going and your witch stands still; Keep playing gives you control back.
6. **Inside Discord** (once deployed): launch the Activity in a voice channel with a friend and play from the lobby there.

## Questions for you

1. **Does your own witch feel as quick as in single-player?** If not, is it a delay before she moves, or her jumping a bit after she moves?
2. **How does your opponent's witch look on your screen:** smooth, or does she stutter or snap now and then (especially around checks and steals)?
3. Is the lobby clear (seats, ready, the link), or is a step confusing?
4. Should there be a rematch shortcut on the results screen ("Rematch" that readies you straight away), or is going back to the lobby fine?
5. Should watchers be able to take a seat between matches, or keep it to whoever sat first?
6. Seats are fixed teams for now (Wyverns home, Ichthyocentaurs away). Is picking your team and your three spells in the lobby (planned as M13) what you want next, or something else first?
