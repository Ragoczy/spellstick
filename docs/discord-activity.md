# Spellstick as a Discord Activity

Players can launch Spellstick inside Discord from a voice channel's App Launcher (the rocket
button). They're signed in as their Discord account automatically, and their Discord profile shows
"Playing <app name>" with what they're doing: "In the menu", "Training · Pass", or
"Wyverns vs Ichthyocentaurs · Period 2 · 3–2" with an elapsed timer, then "Won 6–4".

Normal browser play is unchanged. The Discord code runs only when Discord launches the page, and
browser players never download Discord's SDK.

This follows the card game's Activity (`docs/discord-activity.md` in Ragoczy/spellstick-cardgame),
trimmed to what this game needs: no database, and no online play.

## Its own Discord app

One Discord app can host only one Activity, and the card game's app (`Integrations--Discord--ClientId`)
already points at the card game. So from 2026-10-15 this game has its own Discord app, used for
both browser login and the Activity:

| Setting | Where |
|---|---|
| Application ID (`DISCORD_CLIENT_ID`, not a secret) | `discordClientId` in `infra/main.bicepparam` |
| Client secret (`DISCORD_CLIENT_SECRET`) | Key Vault `kv-ha7siia4h4zia`, secret `SpellstickLive` |
| Darkspace server and roles | Key Vault `Integrations--Discord--*`, shared with the other games (unchanged) |

Players see Discord's "allow" screen once more the first time they log in after the switch.

## How it works

1. Discord loads the game in a frame from `https://<client id>.discordsays.com/?frame_id=...`.
   Discord's proxy fetches it from our container app through the `/` URL mapping.
2. `src/main.ts` calls `startDiscord()` (`src/ui/discord.ts`). Only when the address is
   `<digits>.discordsays.com` *and* has a `frame_id` does it load `src/ui/discordActivity.ts`, a
   separate file holding `@discord/embedded-app-sdk`.
3. `discordActivity.ts` follows Discord's guide: `new DiscordSDK(clientId)` (the ID comes from the
   address), `await sdk.ready()`, then **once** `sdk.commands.authorize(...)` with `identify`,
   `guilds.members.read` (the same as browser login) and `rpc.activities.write` (the profile
   details). Discord asks the player the first time.
4. The page POSTs the one-time code to `/api/discord/signin` (relative, so it goes through the
   proxy). The server (`activitySignIn` in `server/auth/auth.ts`) trades it for a token with the
   app secret, runs the same server-and-role checks as browser login, and:
   - **allowed:** sets the `dsg_session` cookie with `SameSite=None; Secure; Partitioned; HttpOnly`
     and no `Domain`, so it belongs to `<client id>.discordsays.com` only, inside Discord.
   - **refused** (`not-member`, `no-role`): ends any earlier session there and says why.
   - **Discord trouble** (`failed`): keeps any earlier session.

   It returns the access token either way (for the profile details), and never stores or logs it.
   Each launch signs in again, so roles are checked every time.
5. The page calls `sdk.commands.authenticate` with that token, then `setActivity` when the screen,
   period, or score changes. Repeats are skipped, and at most one change goes out every 5 s
   (Discord rate-limits presence).
6. Clicks on links to other sites (Terms, Privacy) go to `sdk.commands.openExternalLink`, which asks
   the player and opens their browser. "Report a problem" sends its `mailto:` the same way.

Inside Discord the title has no "Log in with Discord" or "Log out" (the frame can't go to Discord's
login page), and Settings points to the browser version for unlinking. While signing in, the main
button reads "Signing in through Discord…". If anything fails, the title says what to do (relaunch,
join the server, or ask for the Players role) and the console has one warning:
"Spellstick: Discord features are off."

### Server changes

- `POST /api/discord/signin`. Request bodies are now read (API routes only, capped at 4 KB).
- Non-GET requests are accepted from the game's own origin **and** from
  `https://<DISCORD_CLIENT_ID>.discordsays.com`, which serves only this game. Other Activities'
  addresses are still refused.
- The game sends no `X-Frame-Options` or `frame-ancestors`, so Discord can frame it with no change.
  Adding `frame-ancestors` (as the card game does) would be a hardening step; it isn't needed.

### Not done, or untested

- **Mobile.** The game's touch support inside Discord's mobile app is untested; the portal steps
  below leave mobile off.
- **The `mailto:` link inside Discord.** `openExternalLink` is documented for web links; if Discord
  refuses `mailto:`, the console shows the warning and nothing opens. Settings also shows the
  address to write to.
- **Avatars.** The account line's avatar comes from `cdn.discordapp.com`. If Discord's sandbox
  blocks it, the name still shows with a broken image.
- **Revoking Discord's token on Unlink.** Possible now that the game has its own app (see
  DECISIONS 2026-10-10); not done yet.

## URL mappings (Developer Portal > Activities > URL Mappings)

| Prefix | Target |
|---|---|
| `/` | `ca-game-spellstick.proudbush-0a90b692.eastus2.azurecontainerapps.io` |

That's the only one: the game makes no requests to other sites at runtime. The custom domain
`spellstick.games.darkspace.press` isn't set up yet (no DNS record, not bound in Azure); once it
is, the mapping can point there instead.

## Testing

`npm test` covers the endpoint (`server/auth/auth.test.ts`, `server/http.test.ts`) and the
presence text (`src/ui/discord.test.ts`). `e2e/discord.spec.ts` serves the game at a fake
`1234.discordsays.com` address and checks that the SDK loads there (and not on the normal site),
that the title shows "Signing in through Discord…", and that a failed launch explains itself.

To try it in Discord before deploying, run the built game locally (`npm run serve`), start a tunnel
(`cloudflared tunnel --url http://localhost:5190`), and point the `/` mapping at the tunnel's host
(no `https://`). Point it back at the container app's host afterwards.

## Developer Portal checklist (by hand, in order)

1. **New Application.** Its name is what Discord shows as "Playing <name>" and on the login
   screen. Upload the icon (General Information > App Icon).
2. Put the **Application ID** in `infra/main.bicepparam` (`discordClientId`), and the **client
   secret** (OAuth2 > Reset Secret) in Key Vault as `SpellstickLive`, typed or pasted, never in the repo.
3. **OAuth2 > Redirects:** `https://spellstick.games.darkspace.press/api/auth/callback`,
   `https://ca-game-spellstick.proudbush-0a90b692.eastus2.azurecontainerapps.io/api/auth/callback`,
   `http://localhost:5190/api/auth/callback`, and the placeholder `https://127.0.0.1` (Discord's
   Activity guide requires one).
4. **Installation > Installation Contexts:** User Install and Guild Install.
5. **Activities > URL Mappings:** `/` > `ca-game-spellstick.proudbush-0a90b692.eastus2.azurecontainerapps.io`.
6. **Activities > Settings:** Enable Activities; Supported Platforms: Web and Desktop. Add the
   cover art under Art Assets.
7. **App Testers:** add whoever should try it before it's public.
8. **Apply the Bicep template** (infra/README.md) so the container app uses the new app. This
   **logs everyone out** (a new session secret); they log back in with one click.
9. **Install the app to the Darkspace server**, launch it from a voice channel, and check the
   profile shows "Playing …".
