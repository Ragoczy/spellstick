# Playtest notes — M7 (Announcer voice)

**Build:** https://ragoczy.github.io/spellstick/ (the git SHA is in the bottom-right corner)

## What changed

- **The announcer can talk.** Following your choice (recorded clips only), every announcer line now has an id, and the game speaks any line that has a recording. With no recordings yet, the game looks and sounds exactly as it did in M6. That's on purpose.
- **Adding recordings needs no code.** Name a file after its line (`goal-01.mp3`, `save-03.mp3`, …), drop it in `src/content/announcer-voice/`, commit, and push. The next deploy speaks that line. You can add them a few at a time.
- **The recording script is ready:** [docs/ANNOUNCER_SCRIPT.md](ANNOUNCER_SCRIPT.md). 28 lines grouped by situation (goal, overtime winner, save, Ward block, big hit, pile-up, turnover, shot clock, crease), each with when it fires, a delivery note, and file specs (mono MP3, 96–128 kbps, trimmed, similar loudness). Hand it to a voice actor, or paste it into a text-to-speech service with the delivery notes as direction.
- **How it plays:**
  - The voice always says the same line the text shows.
  - A bigger moment cuts off a smaller one: a goal call interrupts a save call, never the other way round.
  - Sound effects dip while the announcer talks.
  - M mutes everything.
- **Checked end to end** with a throwaway test tone named `goal-01.wav` (since removed). The build picked it up, and a goal in a real match played it alongside "Crone's Corns! It's in!".

## How to try it

1. Record or generate one or two lines from the script, for example `goal-01.mp3` ("Crone's Corns! It's in!") and `save-01.mp3` ("Stopped cold!").
2. Put them in `src/content/announcer-voice/`, then `npm run dev` locally, or commit and push to deploy.
3. Play a match and score a goal. With sound on, you should hear it.

If a file name doesn't match a line id, `npm test` (and CI) will say so, to catch typos.

## Questions for you

1. Who or what will voice it: you, a voice actor, or a TTS service? If TTS, I can suggest how to batch it.
2. Should I add more lines per situation (more variety) before you record, so you only book one session?
3. Any situations you'd want called that aren't covered (faceoff wins, end of period, spells)?
4. Should the voice have its own on/off, separate from sound effects?

## Still open from M6

The M6 questions (credit line, spell names, open-shot difficulty, starting muted) you said are fine for now. The optional 8-bit look is still available at https://ragoczy.github.io/spellstick/?look=8bit.
