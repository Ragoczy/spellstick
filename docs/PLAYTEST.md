# Playtest notes — title-screen changelog

**Build:** https://ragoczy.github.io/spellstick/ (the git SHA is in the bottom-right corner)

## What changed

- **"What's new" on the title screen.** Under Play and Controls there's a short list of the latest three updates, newest first, each with a date and a line or two in plain words.
- The SPELLSTICK logo is a little smaller so it fits inside the panel. It used to spill past the panel's edges.
- Nothing in the match itself changed.

## How to try it

1. Open the build. The "What's new" list should be on the title screen right away, with "Controllers and 8-bit witches" at the top.
2. Make the window short. The title panel should scroll rather than cut anything off.
3. On a controller, check that A still goes straight to team select from the title screen.
4. Try it on a phone-sized window if you like: the logo and the list should fit with no sideways scrolling.

## How to edit it

The entries are in `src/content/changelog.ts`. Add a new one at the top; the title shows the top three.

## Questions for you

1. Is three updates the right amount, or would you rather see one or two and keep the title screen cleaner?
2. Is the wording right for players? I kept it plain and skipped developer details.
3. Should the full history get its own screen (a "What's new" button), or is the latest few enough?
