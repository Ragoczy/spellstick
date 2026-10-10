// One game's Azure Static Web App (Free plan). Deploy into rg-game-<gameName>:
//   az group create -n rg-game-<gameName> -l eastus2
//   az deployment group create -g rg-game-<gameName> -f infra/main.bicep -p gameName=<gameName>
// Content and the /api functions are uploaded by GitHub Actions with the deployment token,
// so the site isn't linked to a repository here.

@description('Short lowercase game name: swa-<gameName>, <gameName>.games.darkspace.press.')
@minLength(2)
@maxLength(30)
param gameName string

@description('Static Web Apps region.')
param location string = 'eastus2'

resource site 'Microsoft.Web/staticSites@2024-04-01' = {
  name: 'swa-${gameName}'
  location: location
  tags: {
    game: gameName
  }
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    allowConfigFileUpdates: true
    stagingEnvironmentPolicy: 'Enabled'
  }
}

output name string = site.name
output defaultHostname string = site.properties.defaultHostname
