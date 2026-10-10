# Playtest notes — M7 (Announcer voice: no laugh, and a home announcer)

**Build:** https://ragoczy.github.io/spellstick/ (the git SHA is in the bottom-right corner)

## What changed

- **No more laugh on big hits.** `hit-01` "Child's Tantrum!" and `hit-05` "Crone's Corns!" are new takes, and the big-hit mood tag is now just "excited", so later hit takes won't laugh either. `hit-02` to `hit-04` are unchanged; tell me if any of them laugh too.
- **The announcer is on your side now.** Every line has a second, angry take (28 new files, `<id>-against.mp3`). Same words, angry read. It plays when the moment goes the opponent's way:
  - they score, or win in overtime
  - their goalie saves or Wards your shot
  - one of yours gets flattened, stripped or shoved off the ball
  - they intercept a pass
  - your team breaks the shot clock or the crease
- Moments that go your way still use the regular, excited take: your goals, your saves, your hits, their violations.

## How to try it

1. Open the build link, turn sound on (top-right button, or M), and start a match against **Hard**, so the other team scores and hits you often.
2. Let them score once, and score once yourself. You should hear the same kind of line read two ways.
3. Get checked into the boards, and check one of theirs into the boards.
4. Hold the ball until the shot clock runs out.
5. To hear every take without playing, the files are in `src/content/announcer-voice/`: `goal-01.mp3` next to `goal-01-against.mp3`, and so on.

## Lines to listen to closely

I can't hear audio, so these are picked from the measurements:

- **`hit-01` and `hit-05`**: is the laugh gone?
- **`goal-01-against`** "Crone's Corns! It's in!" and **`shotclock-01-against`** run about 3 seconds, long for a callout. Do they drag?
- **`otwin-02-against`** runs 4.2 s, but it's the last call of a lost match, so it may be fine.
- **`crease-01-against`** has a half-second pause mid-line.
- Do any angry takes sound wrong for the line, such as an angry "What a save!" when their goalie stops you?

## Redoing a line

Tell me which ones, or run it yourself. One take: `npm run announcer:voice -- --only goal-01 --takes angry --force`. Use `--takes regular` for the normal one. Each run picks a fresh take.

## Questions for you

1. Is the angry announcer more fun, or would you rather have a neutral one? Going back is a small change.
2. Are the angry takes angry enough, or too much (shouting at a crease call)?
3. Any situations where the announcer picks the wrong side?
