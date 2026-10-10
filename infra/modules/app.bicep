// The game's container app, running in aiuthor's Container Apps environment.

param location string
param tags object
param appName string
param image string
param environmentId string
param registryServer string
param appIdentityId string
param deployPrincipalId string
param keyVaultUrl string
@description('Shared settings: { env: environment variable, secret: Key Vault secret name }.')
param sharedSettings { env: string, secret: string }[]
param gameAllowedRoleIds string
param minReplicas int
param customDomain string
param customDomainCertificateId string
@secure()
param sessionSecret string

var containerAppsContributor = '358470bc-b998-42bd-ab17-a7e34c199c0f'

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: last(split(environmentId, '/'))
  scope: resourceGroup(split(environmentId, '/')[4])
}

var fqdn = '${appName}.${environment.properties.defaultDomain}'

// Each shared setting is read from Key Vault into an app secret (named like discord-client-id),
// then into its environment variable. The app picks up changes when it restarts.
var keyVaultSecrets = [for s in sharedSettings: {
  name: toLower(replace(s.env, '_', '-'))
  keyVaultUrl: '${keyVaultUrl}/secrets/${s.secret}'
  identity: appIdentityId
}]
var sharedEnv = [for s in sharedSettings: { name: s.env, secretRef: toLower(replace(s.env, '_', '-')) }]

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${appIdentityId}': {} }
  }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
        customDomains: empty(customDomain)
          ? []
          : [{ name: customDomain, certificateId: customDomainCertificateId, bindingType: 'SniEnabled' }]
      }
      registries: [{ server: registryServer, identity: appIdentityId }]
      secrets: concat(keyVaultSecrets, [{ name: 'session-secret', value: sessionSecret }])
    }
    template: {
      containers: [
        {
          name: 'game'
          image: image
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: concat([
            { name: 'PORT', value: '8080' }
            { name: 'GAME_ALLOWED_ROLE_IDS', value: gameAllowedRoleIds }
            { name: 'SESSION_SECRET', secretRef: 'session-secret' }
          ], sharedEnv)
          probes: [
            { type: 'Liveness', httpGet: { path: '/healthz', port: 8080 }, periodSeconds: 30 }
            { type: 'Readiness', httpGet: { path: '/healthz', port: 8080 }, periodSeconds: 10 }
          ]
        }
      ]
      scale: { minReplicas: minReplicas, maxReplicas: 1 }
    }
  }
}

// GitHub Actions may update this app (new image) and nothing else.
resource deployCanUpdate 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: app
  name: guid(app.id, deployPrincipalId, containerAppsContributor)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', containerAppsContributor)
    principalId: deployPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output fqdn string = fqdn
output url string = 'https://${fqdn}'
