# Playtest notes — M7 (Announcer voice, now with recordings)

**Build:** https://ragoczy.github.io/spellstick/ (the git SHA is in the bottom-right corner)

## What changed

- **The announcer talks.** All 28 lines are recorded in your ElevenLabs voice and play in matches alongside the text callouts.
- Each situation got a mood tag so the read fits: excited and shouting for goals, awed for the Ward, gleeful for big hits, exasperated for the shot clock, firm for crease calls.
- **The game cleans up each recording as it loads.** It skips the silence before each line, cuts long tails, and evens out loudness between quiet and shouted takes. Your future recordings get the same treatment.
- One take ("Stripped!") came back with over a second of silence on each side, so I regenerated it.
- **How it plays:** the voice always says the line on screen. A bigger moment cuts off a smaller one (a goal call interrupts a save call), sound effects dip while it talks, and M mutes everything.

## How to try it

1. Open the build link above, make sure sound is on (top-right button, or M), and start a match.
2. Score a goal, make a save, and throw some hits into the boards.
3. To hear every line without playing, listen to the files in `src/content/announcer-voice/` (the names match the script in [docs/ANNOUNCER_SCRIPT.md](ANNOUNCER_SCRIPT.md)).

## Lines to listen to closely

I can't hear audio, so these are the ones the measurements made me unsure about:

- **`hit-01` "Child's Tantrum!" and `hit-05` "Crone's Corns!"** run about 3 seconds for two words. The "[laughing]" tag on big hits probably adds a laugh. Fun, or dragging?
- **`otwin-02` "Child's Tantrum! Sudden death, and that's the game!"** is 5 seconds. That's fine for the very last call of a match, but say if it's too much.
- **`save-03` "Robbed!"** and **`goal-03` "Buried it!"** came out the loudest and get turned down the most; check they don't sound squashed.

## Redoing a line

Tell me which ones, or run it yourself: `npm run announcer:voice -- --only hit-01,hit-05 --force`. Each run picks a fresh take. I can also drop or change a mood tag for a situation (for example, no laugh on big hits).

## Questions for you

1. Does the voice fit Spellstick? Are any lines off in tone or pronunciation, especially "Ichthyocentaurs"-style words (none in the script yet) and the canon phrases?
2. Is the voice too loud or too quiet against the sound effects?
3. Want more lines per situation (variety), or calls for faceoff wins, end of period, or spells? Each new line is one command once it's in the script.
