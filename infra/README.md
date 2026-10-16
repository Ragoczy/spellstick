# Spellstick on Azure

The game runs as one container app, `ca-game-spellstick`, in the Darkspace.Press subscription
(East US 2), on the same shared architecture as the Spellstick card game
([Ragoczy/spellstick-cardgame](https://github.com/Ragoczy/spellstick-cardgame), `infra/`). It
uses aiuthor's shared resources in `rg-aiuthor` and keeps its own pieces in `rg-game-spellstick`.
The card game already has the `spellstick` names, so this game's are `game-spellstick`.

| Resource | Where | What it's for |
| --- | --- | --- |
| `ca-game-spellstick` | rg-game-spellstick | Serves the built game and the Discord login (`server/`). 0.25 CPU, 0.5 GB, 0–1 copies: it sleeps when idle, so the first visit after a quiet spell takes up to about 30 s. |
| `id-game-spellstick` | rg-game-spellstick | The app's identity: reads its Key Vault secrets, pulls images. |
| `id-game-spellstick-deploy` | rg-game-spellstick | GitHub Actions' identity (main branch of Ragoczy/spellstick only): pushes images, updates `ca-game-spellstick`. |
| `game-spellstick` images | `acrha7siia4h4zia` (rg-aiuthor) | Container images, tagged by git commit. |
| `SpellstickLive` secret | `kv-ha7siia4h4zia` (rg-aiuthor) | This game's own Discord app's client secret (since 2026-10-15; its Application ID is `discordClientId` in `main.bicepparam`). See `docs/discord-activity.md`. |
| `Integrations--Discord--*` secrets | `kv-ha7siia4h4zia` (rg-aiuthor) | The shared Darkspace server settings (server ID, role IDs, admin IDs). With `SpellstickLive`, the app can read only these six secrets. |
| Logs | `log-aiuthor` via `cae-aiuthor` | Server logs. |

Online 1v1 (SPEC §11) runs on the same app: WebSockets at `/api/online`, with every room kept in
the server's memory. So the app must stay **one copy** (`maxReplicas: 1`), and a deploy or restart
ends any online matches in progress (players see "The server is busy or restarting"). Never set
`ONLINE_GUESTS` here: it lets people play online without logging in, for local tests only.

Sessions are signed cookies (30 days). The only thing stored server-side is each online player's
record for badges (M14, `docs/BADGES.md`): achievements, tier, and match/win/goal counts, in the
`spellstick_live` database on the shared Postgres server. Badges stay off, and the game works without
them, until they're set up (see "Badges" below).

Live: https://spellstick.games.darkspace.press (once the domain is bound), and
https://ca-game-spellstick.proudbush-0a90b692.eastus2.azurecontainerapps.io

## Deploys

Every push to `main` deploys automatically (`.github/workflows/deploy.yml`): the tests and the
1,000-game balance run first; then the image is built, tagged with the commit, pushed, the app is
switched to it, and the job waits until the new version is healthy. It signs in as
`id-game-spellstick-deploy` using the repository variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
and `AZURE_SUBSCRIPTION_ID` (IDs, not secrets).

To roll back, point the app at an earlier image:

```bash
az containerapp update -g rg-game-spellstick -n ca-game-spellstick --image acrha7siia4h4zia.azurecr.io/game-spellstick:<earlier commit sha>
```

Logs: `az containerapp logs show -g rg-game-spellstick -n ca-game-spellstick --tail 50`

The logs are kept in `log-aiuthor`. Every online match ends with one line,
`online: match summary {...}` (M12): no names or ids, just how it went over the network. Each
seat gets its round trips (`rttMs`), how many ticks early its controls arrived (`earlyTicks`;
negative means late), the share that came too late (`late`), and the share of ticks played on
carried-forward controls (`held`), with drops and rejoins. The match as a whole gets snapshot
KB/s per screen (before compression), the server's step cost (`stepMs`), and `stalls`, the
times the server fell far behind. A match still going when its room closes or the app stops is
logged with `"end":"abandoned"`. To read the latest:

```bash
az monitor log-analytics query -w $(az monitor log-analytics workspace show -g rg-aiuthor -n log-aiuthor --query customerId -o tsv) --analytics-query "ContainerAppConsoleLogs_CL | where ContainerAppName_s == 'ca-game-spellstick' and Log_s startswith 'online: match summary' | project TimeGenerated, Log_s | order by TimeGenerated desc | take 20" -o table
```

## Settings

The shared Discord settings come straight from Key Vault as Key Vault references; nothing is
copied. To change one (it affects every Darkspace game, so only with Paul's OK), update the
secret, then restart the app so it reads the new value:

```bash
az containerapp revision restart -g rg-game-spellstick -n ca-game-spellstick --revision $(az containerapp show -g rg-game-spellstick -n ca-game-spellstick --query properties.latestRevisionName -o tsv)
```

This game's own settings are in `main.bicepparam`: `discordClientId` (its Discord app), `gameAllowedRoleIds` (empty = the shared
Players role), the custom domain, and badges (`badgesEnabled`, `tierRoleIds`; with badges on, the
bot token comes from the Key Vault secret `SpellstickLiveBotToken` and the database settings
`DB_HOST`, `DB_NAME`, `DB_USER`, `AZURE_CLIENT_ID` from the template). `SESSION_SECRET` is generated by the template and kept as a
container app secret. **Re-running the template generates a new one, which logs everyone out**
(they log back in with one click). Image deploys from GitHub don't touch it.

## First-time setup (done 2026-10-10)

In Git Bash from the repo root, signed in with `az login` as the subscription owner.

```bash
# 1. Push an image
tag=$(git rev-parse HEAD)
az acr login -n acrha7siia4h4zia
docker build --build-arg BUILD_SHA=$tag -t acrha7siia4h4zia.azurecr.io/game-spellstick:$tag .
docker push acrha7siia4h4zia.azurecr.io/game-spellstick:$tag

# 2. Create or update the Azure resources (preview, then apply). Pass the image that's deployed now:
#    tag=$(az containerapp show -g rg-game-spellstick -n ca-game-spellstick --query "properties.template.containers[0].image" -o tsv | cut -d: -f2)
az deployment sub what-if -l eastus2 -n game-spellstick -f infra/main.bicep -p infra/main.bicepparam -p image=acrha7siia4h4zia.azurecr.io/game-spellstick:$tag
az deployment sub create -l eastus2 -n game-spellstick -f infra/main.bicep -p infra/main.bicepparam -p image=acrha7siia4h4zia.azurecr.io/game-spellstick:$tag

# 3. Let GitHub Actions sign in (IDs, not secrets)
gh variable set AZURE_CLIENT_ID --body "$(az identity show -g rg-game-spellstick -n id-game-spellstick-deploy --query clientId -o tsv)"
gh variable set AZURE_TENANT_ID --body "$(az account show --query tenantId -o tsv)"
gh variable set AZURE_SUBSCRIPTION_ID --body "$(az account show --query id -o tsv)"
```

If step 2 fails with a Key Vault or registry access error, wait a minute and run it again: new
access grants take a moment to reach every Azure service.

This game's Discord app needs these redirects (Developer Portal → OAuth2 → Redirects; the full portal checklist, including the Activity, is in `docs/discord-activity.md`):
`https://spellstick.games.darkspace.press/api/auth/callback`,
`https://ca-game-spellstick.proudbush-0a90b692.eastus2.azurecontainerapps.io/api/auth/callback`,
for local runs `http://localhost:5190/api/auth/callback`, and the Activity's placeholder `https://127.0.0.1`.

## Badges (M14): database and tier roles

Off until these steps are done; the game runs fine meanwhile. In Git Bash, signed in with `az login`.

1. **Discord roles.** In the Darkspace server, create the five tier roles, lowest first: Prep Witch
   `#c89858`, Varsity Witch `#bcbcbc`, First Line `#8e6cd8`, Captain `#c9761a`, Golden Stick
   `#ffa630`. Tick "Display role members separately". Upload `assets/discord/tier-<n>-128.png` as
   each role's icon (needs Server Boost level 2; without it they work, with no icon). Copy each
   role's ID (Developer Mode, right-click the role).
2. **The bot.** Developer Portal → this game's app → Bot: copy (or reset) the token. Invite the bot
   to the Darkspace server with Manage Roles (OAuth2 → URL Generator: scope `bot`, permission
   Manage Roles). In Server Settings → Roles, drag the bot's role **above** the five tier roles.
3. **Key Vault.** `az keyvault secret set --vault-name kv-ha7siia4h4zia -n SpellstickLiveBotToken --value '<token>'`
4. **Turn it on.** In `infra/main.bicepparam` set `badgesEnabled = true` and
   `tierRoleIds = '<id1>,<id2>,<id3>,<id4>,<id5>'`, then run step 2 of "First-time setup" (what-if,
   then create). That adds the database and the app's settings.
5. **The app's database login** (once). Entra logins can only be added with SQL by the server's
   Entra admin, and the firewall only admits Azure, so this opens it to your IP for a minute:

```bash
ip=$(curl -s https://api.ipify.org)
az postgres flexible-server firewall-rule create -g rg-aiuthor -n psql-ha7siia4h4zia -r game-spellstick-setup --start-ip-address $ip --end-ip-address $ip
export PGPASSWORD=$(az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv)
admin='pjackson_darkspace.press#EXT#@pjacksondarkspace.onmicrosoft.com'
host=psql-ha7siia4h4zia.postgres.database.azure.com
docker run --rm -e PGPASSWORD postgres:16-alpine psql "host=$host dbname=postgres user=$admin sslmode=require" -v ON_ERROR_STOP=1   -c "select * from pgaadauth_create_principal('id-game-spellstick', false, false);"   -c 'grant all privileges on database spellstick_live to "id-game-spellstick";'
docker run --rm -e PGPASSWORD postgres:16-alpine psql "host=$host dbname=spellstick_live user=$admin sslmode=require" -v ON_ERROR_STOP=1   -c 'grant all on schema public to "id-game-spellstick";'
az postgres flexible-server firewall-rule delete -g rg-aiuthor -n psql-ha7siia4h4zia -r game-spellstick-setup --yes
unset PGPASSWORD
```

6. **Restart** so the app connects and creates its tables:
   `az containerapp revision restart -g rg-game-spellstick -n ca-game-spellstick --revision $(az containerapp show -g rg-game-spellstick -n ca-game-spellstick --query properties.latestRevisionName -o tsv)`.
   The log should say `badges: applied 001_badges` (the first time) and nothing about badges being off.

## Custom domain

`spellstick.games.darkspace.press` (DNS at GoDaddy, managed by Paul):

1. At GoDaddy: CNAME `spellstick.games` → `ca-game-spellstick.proudbush-0a90b692.eastus2.azurecontainerapps.io`,
   and TXT `asuid.spellstick.games` → the environment's verification ID
   (`az containerapp env show -g rg-aiuthor -n cae-aiuthor --query properties.customDomainConfiguration.customDomainVerificationId -o tsv`).
2. Bind it with a free managed certificate:
   ```bash
   az containerapp hostname add -g rg-game-spellstick -n ca-game-spellstick --hostname spellstick.games.darkspace.press
   az containerapp hostname bind -g rg-game-spellstick -n ca-game-spellstick --hostname spellstick.games.darkspace.press --environment cae-aiuthor --validation-method CNAME
   ```
3. Put the domain and its certificate ID in `main.bicepparam` (`customDomain`,
   `customDomainCertificateId`), so re-running the template keeps them:
   `az containerapp hostname list -g rg-game-spellstick -n ca-game-spellstick -o table`.

On that domain the session cookie is set for `.games.darkspace.press`; elsewhere it's host-only.

## Local

`npm run env:pull` writes the git-ignored `.env` from Key Vault (without showing it) plus a local
`SESSION_SECRET` and `PORT=5190`; then `npm run serve` builds and runs the server at
http://localhost:5190. `npm run dev` (Vite, no login) is still the quickest way to play.
