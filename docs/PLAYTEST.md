# Playtest notes — M9: goal replays, team styles, training ground

**Build:** https://spellstick.games.darkspace.press (the git SHA is in the bottom-right corner)

## What changed

- **Goal replays.** About a second after a goal, the run-up (the last 2.5 seconds before it) replays at half speed, with a "● REPLAY" tag and the hit and spell flashes. Then the faceoff happens as usual. Click, Space, or A skips it. Esc still pauses. The title-screen demo and training don't replay.
- **Team styles.** Each team's AI now has a way of playing:
  - Wyverns: hit hard and carry the ball (about 50% more checks, fewer spells, shoot through traffic).
  - Ichthyocentaurs: move the ball (about twice the passes, sideways passes too, shoot from a bit farther out).
  - Willowmere Witches: cast more spells (about 60% more casts, fewer hits).

  The style applies to your AI teammates and to the opponents. Your own witch is the same whichever team you pick, and every witch on the floor has the same speed, stick, and spells. The style shows under each team name on team select.
- **Training ground.** There's a new Training button on the title screen with seven short lessons: Run and scoop, Pass, Shoot, Bent Shot, Body check, Hex Shove, and Faceoff. Each lesson has a goal ("Score 2 goals") with progress dots, says what went wrong when you miss ("Saved! Aim for a corner"), and moves on to the next lesson by itself. After the last one you can start a match. Esc pauses, and the pause menu has Skip lesson and Quit training. The instructions name keyboard keys or controller buttons, whichever you used last.

## How to try it

1. **Training, start to finish.** Title → Training → Start training. Go through all seven lessons on keyboard and mouse. Notice whether any lesson is confusing or too slow to finish.
2. **Training on a controller.** Do a few lessons with a pad. The card should switch to pad buttons (X / Y / B, RT or A) as soon as you touch it.
3. **A replay.** Play a match and score, or let them score. Watch one replay all the way through, then skip the next one with a click (or A).
4. **Team styles.** Play the Wyverns against the Willowmere Witches, then the Ichthyocentaurs against the Wyverns. Does each team feel different from the other side of the floor?
5. **Skip and quit.** In training, press Esc → Skip lesson, then Esc → Quit training. You should land back on the title with the demo running.

## Questions for you

1. Replays: is half speed and about 6 seconds right, or too long to sit through after every goal? Would you rather only see replays for some goals (overtime winners, or your own)?
2. Should a replay show the whole floor (as now), or zoom in on the play?
3. Team styles: can you tell the teams apart from how they play? Should styles stay AI-only, or should a team's witches actually be different (for example, the Wyverns hit a little harder)? That would make your team choice matter for your own witch too.
4. The style names and blurbs ("Hit hard and carry the ball" and so on) are placeholders. Do they fit these teams, or does the canon say something different?
5. Training: are seven lessons the right set? Is anything missing (Quickstep and Space-to-switch only get a mention), and are any too fiddly (the shooting lessons need goals against an Easy goalie)?
6. Should the game remember which lessons you've finished? It doesn't yet, so that nothing new gets stored per player.
