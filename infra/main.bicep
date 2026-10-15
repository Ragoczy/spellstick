// Spellstick (the box-lacrosse browser game): Azure setup.
//
// Same shared architecture as the Spellstick card game (Ragoczy/spellstick-cardgame): one
// container app in aiuthor's Container Apps environment, reading its Discord settings straight
// from Key Vault, deployed by GitHub Actions with its own identity.
// Everything of ours lives in rg-game-spellstick; in rg-aiuthor we only add access grants.
// The card game already uses the "spellstick" names, so this game's are "game-spellstick".
//
// Deploy (see infra/README.md):
//   az deployment sub create -l eastus2 -n game-spellstick -f infra/main.bicep -p infra/main.bicepparam -p image=<image>

targetScope = 'subscription'

param location string = 'eastus2'

@description('Container image to run, for example acrha7siia4h4zia.azurecr.io/game-spellstick:<git sha>.')
param image string

// ---- Existing shared resources (aiuthor) ----
param sharedResourceGroup string = 'rg-aiuthor'
param containerAppsEnvironmentName string = 'cae-aiuthor'
param registryName string = 'acrha7siia4h4zia'
param keyVaultName string = 'kv-ha7siia4h4zia'

// ---- This game's settings ----
param resourceGroupName string = 'rg-game-spellstick'
param appName string = 'ca-game-spellstick'
param appIdentityName string = 'id-game-spellstick'
param deployIdentityName string = 'id-game-spellstick-deploy'
@description('GitHub repo as GitHub names it in sign-in tokens: owner@ownerId/repo@repoId. The IDs stop a renamed or re-created repo from inheriting access.')
param githubRepo string = 'Ragoczy@2834782/spellstick@1407734666'

@description('This game\'s own Discord app (Developer Portal > General Information > Application ID), used for login and the Discord Activity. Not a secret.')
@minLength(1)
param discordClientId string
@description('The Key Vault secret holding that Discord app\'s client secret.')
param discordClientSecretName string = 'SpellstickLive'

@description('This game only: comma-separated Discord role IDs allowed to play instead of the shared Players role (for example a beta role). Empty = the shared Players role.')
param gameAllowedRoleIds string = ''

@description('0 = stop when idle (cheap, slow first visit). 1 = always on.')
param minReplicas int = 0

@description('Custom domain, once bound (see infra/README.md); keeps it attached when this is re-run. Empty = none.')
param customDomain string = ''
@description('The managed certificate for customDomain (its resource ID in the environment).')
param customDomainCertificateId string = ''

@secure()
@description('Signs the session cookies. Generated fresh on every run of this template, which logs everyone out; pass the same value to keep sessions.')
param sessionSecret string = '${newGuid()}${newGuid()}'

// Settings kept in Key Vault: this game's Discord client secret, and the Darkspace server settings
// shared by every Darkspace game. Each becomes an environment variable on the app, read when it
// starts. (Until 2026-10-15 the game used the card game's Discord app, Integrations--Discord--ClientId
// and --ClientSecret; one Discord app can host only one Activity.)
var sharedSettings = [
  { env: 'DISCORD_CLIENT_SECRET', secret: discordClientSecretName }
  { env: 'DISCORD_GUILD_ID', secret: 'Integrations--Discord--GuildId' }
  { env: 'DISCORD_PLAYER_ROLE_IDS', secret: 'Integrations--Discord--PlayerRoleIds' }
  { env: 'DISCORD_MODERATOR_ROLE_IDS', secret: 'Integrations--Discord--ModeratorRoleIds' }
  { env: 'DISCORD_ADMIN_ROLE_IDS', secret: 'Integrations--Discord--AdminRoleIds' }
  { env: 'ADMIN_DISCORD_IDS', secret: 'Integrations--Discord--AdminUserIds' }
]

var tags = { app: 'game-spellstick' }

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module identities 'modules/identities.bicep' = {
  scope: rg
  name: 'game-spellstick-identities'
  params: {
    location: location
    tags: tags
    appIdentityName: appIdentityName
    deployIdentityName: deployIdentityName
    githubRepo: githubRepo
  }
}

module shared 'modules/shared.bicep' = {
  scope: resourceGroup(sharedResourceGroup)
  name: 'game-spellstick-shared'
  params: {
    registryName: registryName
    keyVaultName: keyVaultName
    sharedSecretNames: map(sharedSettings, s => s.secret)
    containerAppsEnvironmentName: containerAppsEnvironmentName
    appPrincipalId: identities.outputs.appPrincipalId
    deployPrincipalId: identities.outputs.deployPrincipalId
  }
}

module app 'modules/app.bicep' = {
  scope: rg
  name: 'game-spellstick-app'
  dependsOn: [shared]
  params: {
    location: location
    tags: tags
    appName: appName
    image: image
    environmentId: resourceId(subscription().subscriptionId, sharedResourceGroup, 'Microsoft.App/managedEnvironments', containerAppsEnvironmentName)
    registryServer: '${registryName}.azurecr.io'
    appIdentityId: identities.outputs.appIdentityId
    deployPrincipalId: identities.outputs.deployPrincipalId
    keyVaultUrl: 'https://${keyVaultName}${environment().suffixes.keyvaultDns}'
    sharedSettings: sharedSettings
    discordClientId: discordClientId
    gameAllowedRoleIds: gameAllowedRoleIds
    minReplicas: minReplicas
    customDomain: customDomain
    customDomainCertificateId: customDomainCertificateId
    sessionSecret: sessionSecret
  }
}

output appUrl string = app.outputs.url
output appFqdn string = app.outputs.fqdn
output deployClientId string = identities.outputs.deployClientId
