# Playtest notes — M8 (8-bit art and controller support)

**Build:** https://ragoczy.github.io/spellstick/ (the git SHA is in the bottom-right corner)

## What changed

- **The 8-bit look is now the default.** The original smooth look is still there if you add `?look=classic` to the URL.
- **You can play with a controller.** Any pad the browser sees as a standard gamepad works: Xbox, PlayStation, Switch Pro, and most PC pads. You can go from the title screen through a match to the results without touching the keyboard.

| Controller | Does |
| --- | --- |
| Left stick or D-pad | Move (a light push walks) |
| Right stick | Aim. Let go and you aim where you're running |
| RT or A | Tap to pass, hold and release to shoot, and take the faceoff |
| LT or LB | Body check |
| X / Y / B | Hex Shove / Quickstep / Bent Shot |
| RB | Switch player (on defense) |
| Menu (Start) | Pause and resume |
| View (Back) | Sound on/off |

  On a PlayStation pad, A/B/X/Y are Cross/Circle/Square/Triangle.
- **Aim assist for shots:** point the stick anywhere near the goal and the shot goes on net, just inside the post you pointed toward. Bent Shot curves onto that spot.
- **Menus work on the pad:** D-pad or stick to move, A to pick, B to go back. Each menu starts on its main button, so pressing A from the title screen goes to team select, and A again starts a match with your last choices.
- The spell icons show X / Y / B while you're on the pad and Q / E / R on the keyboard. They switch on their own, and the controls card now lists both.

## How to try it

1. Plug in a controller, open the build, and press any button. "Controller connected" should appear at the top.
2. Play a whole match on the pad only: pick a team in the menus, take the faceoff with RT, and score.
3. Try shooting both ways: aim with the right stick and pull RT, or let go of the right stick, run at the goal and press A.
4. Pause with Menu, and resume with A on "Resume". That A should not fire a pass.
5. Halfway through, grab the mouse and play on. The spell icons should switch back to Q / E / R.
6. Have a look at the 8-bit look over a whole match, and at `?look=classic` if you want to compare.

## Known issue

Browsers may not count a controller press as permission to play sound. If the game stays silent on the pad alone, click once or press any key.

## Questions for you

1. Does the button layout feel right? The main alternative is A to pass and RT to shoot, as in a lot of sports games; right now both do both.
2. Is the aim assist too generous (shots from bad angles still go on net) or about right?
3. Does aiming where you run (when the right stick is let go) help, or would you rather the aim stayed put?
4. Any controller that didn't work, or had its buttons mixed up?
5. Is the 8-bit look a keeper, or should it go back behind a flag?
