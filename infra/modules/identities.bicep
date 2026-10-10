// The game's two Azure identities:
// - id-game-spellstick: what the running app signs in as, to read its Key Vault secrets and pull images.
// - id-game-spellstick-deploy: what GitHub Actions signs in as (no stored password; GitHub proves
//   it's this repo's main branch).

param location string
param tags object
param appIdentityName string
param deployIdentityName string
param githubRepo string

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: appIdentityName
  location: location
  tags: tags
}

resource deployIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: deployIdentityName
  location: location
  tags: tags
}

resource githubMain 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: deployIdentity
  name: 'github-main'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${githubRepo}:ref:refs/heads/main'
    audiences: ['api://AzureADTokenExchange']
  }
}

output appIdentityId string = appIdentity.id
output appPrincipalId string = appIdentity.properties.principalId
output deployClientId string = deployIdentity.properties.clientId
output deployPrincipalId string = deployIdentity.properties.principalId
