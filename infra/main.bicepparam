using 'main.bicep'

// The image is passed on the command line: -p image=acrha7siia4h4zia.azurecr.io/game-spellstick:<tag>
param image = ''

// Discord settings shared by all Darkspace games live in Key Vault as Integrations--Discord--*
// (see infra/README.md). Only this game's own choices are here.

// This game's own Discord app: Developer Portal > General Information > Application ID (not a
// secret). Its client secret is the Key Vault secret SpellstickLive. Must be filled in to deploy.
param discordClientId = '1560321450576191569'

// Who may play. Empty = the shared Players role. Set a role ID to limit the game to, say, a beta role.
param gameAllowedRoleIds = ''

// Filled in after the custom domain is bound (infra/README.md, "Custom domain"), so re-running
// this template keeps it.
param customDomain = ''
param customDomainCertificateId = ''

// Badges (M14): off until the bot token is in Key Vault (SpellstickLiveBotToken) and the app's
// database login exists (infra/README.md, "Badges"). Then set true and fill in the five tier
// role IDs, lowest tier first.
param badgesEnabled = false
param tierRoleIds = ''
