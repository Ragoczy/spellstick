// This game's share of the aiuthor resources in rg-aiuthor. Adds only access grants:
// - registry: the app pulls images; GitHub Actions pushes them (and reads the registry's address),
// - "join" on the Container Apps environment for GitHub Actions, so it can update the app,
// - read access to each shared Darkspace Games Discord setting in Key Vault, and nothing else there.
// No database: the game is single-player and stores nothing server-side.

param registryName string
param keyVaultName string
@description('Key Vault secrets the app may read (the shared Discord settings).')
param sharedSecretNames string[]
param containerAppsEnvironmentName string
param appPrincipalId string
param deployPrincipalId string

var roles = {
  acrPull: '7f951dda-4ed3-4680-a7ca-43fe172d538d'
  acrPush: '8311e382-0749-4cb8-b61a-304f252e45ec'
  reader: 'acdd72a7-3385-48ef-bd42-f606fba81ae7'
  keyVaultSecretsUser: '4633458b-17de-408a-b874-0445c86b69e6'
  containerAppsOperator: 'f3bd1b5c-91fa-40e7-afe7-0c11d331232c'
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

resource appPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, appPrincipalId, roles.acrPull)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.acrPull)
    principalId: appPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource deployPush 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, deployPrincipalId, roles.acrPush)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.acrPush)
    principalId: deployPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// "az acr login" looks up the registry's address first, which needs read access to it.
resource deployReadRegistry 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, deployPrincipalId, roles.reader)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.reader)
    principalId: deployPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Updating an app inside the shared environment needs "join" on the environment. Operator on the
// environment itself gives read and join only; it doesn't reach the other apps.
resource environment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: containerAppsEnvironmentName
}

resource deployJoinEnvironment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: environment
  name: guid(environment.id, deployPrincipalId, roles.containerAppsOperator)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.containerAppsOperator)
    principalId: deployPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource sharedSecrets 'Microsoft.KeyVault/vaults/secrets@2023-07-01' existing = [for name in sharedSecretNames: {
  parent: vault
  name: name
}]

// One grant per shared setting, so the game can't read aiuthor's API keys or anything else.
resource appSecretRead 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for (name, i) in sharedSecretNames: {
  scope: sharedSecrets[i]
  name: guid(sharedSecrets[i].id, appPrincipalId, roles.keyVaultSecretsUser)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.keyVaultSecretsUser)
    principalId: appPrincipalId
    principalType: 'ServicePrincipal'
  }
}]
