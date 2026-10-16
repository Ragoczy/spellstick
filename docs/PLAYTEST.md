# Playtest notes — M12 online feel, and M14 badges

**Build:** https://ca-game-spellstick.proudbush-0a90b692.eastus2.azurecontainerapps.io (the git SHA is in the bottom-right corner). The custom domain spellstick.games.darkspace.press doesn't resolve yet: binding it is still on the list in infra/README.md, "Custom domain".

## What changed

### M12: online feel, tuned from a network sim

- **A network sim.** `npm run sim -- --net` plays whole online matches between two simulated screens and the real server room. It runs over simulated connections to the East US server: east coast, west coast, Europe, Australia/Asia, and busy Wi-Fi. The screens run the game's own prediction code, and the report says how often and how far each screen gets corrected. The numbers are in docs/DECISIONS.md.
- **Online play predicts less far ahead.** Your screen used to send its controls about 5 ticks (83 ms) before the server needed them. It now aims for 2 ticks (33 ms) and stays there. That means less guessing about everyone else.
  - In the sim, on a good connection, other witches are drawn about half as far from where they really are.
  - Your own witch is corrected about 40% less often.
- **A cushion for bad connections.** When your controls start arriving late (Wi-Fi hiccups, long distance), your screen adds up to 3 ticks of extra lead, then gives it back after 10 calm seconds.
- **The N readout's "aim"** shows the live target: 2 normally, up to 5 when the cushion is in use.
- **Unchanged:** smoothing and the update rate.

### M14: tier roles, achievements, and profiles (docs/BADGES.md)

- **Ten achievements, online matches only.** The full list is in docs/BADGES.md. A match counts when two signed-in players play it to the final whistle; a player who quits gets nothing.
- **Five tiers.** Prep Witch, Varsity Witch, First Line, Captain, Golden Stick, at 1/3/5/7/9 achievements. Each has a pixel badge, and the Discord role icons are in `assets/discord/`.
- **Profile page.** Click your name on the title screen, or a seated player's name in the online lobby. It shows your rank badge, the five-step ladder, your counts, and all ten achievements, locked ones with how to earn them. Links work too: `/profile/me` or `/profile/<Discord id>`.
- **Results screen.** After an online match it shows what you unlocked and any new rank.
- **Privacy.** Unlinking now also deletes your online record and tier role, and the unlink screen says what's kept. Your own profile has "Delete my record".
- **Badges are off on the live server until your one-time setup** (below). Until then the profile says "Profiles are not available right now." and everything else works as before.

## Your one-time setup for badges

These steps are in infra/README.md, "Badges", with the exact commands:

1. Create the five roles in the Darkspace server, with these colours, and hoist them:

   | Role | Colour |
   |---|---|
   | Prep Witch | `#c89858` |
   | Varsity Witch | `#bcbcbc` |
   | First Line | `#8e6cd8` |
   | Captain | `#c9761a` |
   | Golden Stick | `#ffa630` |

   Upload `assets/discord/tier-<n>-128.png` as each role's icon. Role icons need Server Boost level 2.
2. Add the Spellstick Live bot to the server with Manage Roles. Drag its role above the five tier roles.
3. Put the bot token in Key Vault as `SpellstickLiveBotToken`.
4. In `infra/main.bicepparam`, set `badgesEnabled = true` and the five role IDs, then run the template.
5. Add the app's database login with SQL (the README has the commands), then restart the app.

## Things to try

1. **Online feel, same region.** Play a full match with someone close by, with **N** up. "Controls" should read 1–2 ticks early (aim 2), and corrections for others should stay small. Do hits and loose-ball races land where they look like they land?
2. **Online feel, far away or on Wi-Fi.** Watch "aim" climb to 3–5 when controls run late. Does your witch still answer right away, and do stutters clear within a few seconds?
3. **Badge art.** Open `assets/discord/` and the profile page (once badges are on). Do the five tier badges read at Discord's tiny role-icon size?
4. **First match (after setup).** Play one online match to the whistle with a friend. Both of you should see First Whistle (and maybe more) on the results screen, both profiles should show it, and both should get the Prep Witch role.
5. **Unlink (after setup).** On a test account, unlink. The profile and the tier role should both be gone.

## Questions for you

1. Compared with before, do **other witches look steadier** online? Does **your own witch** ever feel pulled back or nudged? When (checks, spells, loose balls)?
2. **Smoothing:** when something gets corrected, does it slide too slowly (floaty) or pop (jumpy)?
3. **Names:** keep Prep Witch / Varsity Witch / First Line / Captain / Golden Stick and the ten achievement names, or rename any? They're all placeholders in one file.
4. **The pace:** a first match usually earns three or four achievements, so tier 1 or 2 straight away. Tiers 4–5 need the rare ones (about 1 match in 15). Too fast, too slow, or right?
5. **The art:** is 8-bit right for Discord role icons, or do you want your ComfyUI art there later?
6. **Your Privacy Policy** page should mention the online record (achievements, rank, counts, Discord name and picture). Will you update it before badges go live?
