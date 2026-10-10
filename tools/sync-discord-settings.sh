#!/usr/bin/env bash
# Copies the shared Darkspace Games Discord settings from Key Vault without displaying them.
#
#   tools/sync-discord-settings.sh azure   # into swa-spellstick's app settings
#   tools/sync-discord-settings.sh local   # into .env (git-ignored), for npm run dev:swa
#
# Needs `az login` with read access to the vault. Run it again whenever a shared value
# changes (the Free plan can't read Key Vault live). SESSION_SECRET is Spellstick's own:
# an existing one is kept (so players stay logged in), otherwise a new one is generated.
set -euo pipefail

VAULT=kv-ha7siia4h4zia
APP=swa-spellstick
RG=rg-game-spellstick

# Setting name = Key Vault secret name. Never add Integrations--Discord--BotToken here.
SHARED=(
  "DISCORD_CLIENT_ID=Integrations--Discord--ClientId"
  "DISCORD_CLIENT_SECRET=Integrations--Discord--ClientSecret"
  "DISCORD_GUILD_ID=Integrations--Discord--GuildId"
  "DISCORD_PLAYER_ROLE_IDS=Integrations--Discord--PlayerRoleIds"
  "DISCORD_MODERATOR_ROLE_IDS=Integrations--Discord--ModeratorRoleIds"
  "DISCORD_ADMIN_ROLE_IDS=Integrations--Discord--AdminRoleIds"
  "ADMIN_DISCORD_IDS=Integrations--Discord--AdminUserIds"
)

read_secret() {
  az keyvault secret show --vault-name "$VAULT" --name "$1" --query value -o tsv | tr -d '\r\n'
}
new_session_secret() { openssl rand -base64 48 | tr -d '\r\n'; }

case "${1:-}" in
  azure)
    settings=()
    for pair in "${SHARED[@]}"; do
      settings+=("${pair%%=*}=$(read_secret "${pair#*=}")")
    done
    current=$(az staticwebapp appsettings list -n "$APP" -g "$RG" --query "properties.SESSION_SECRET" -o tsv | tr -d '\r\n')
    if [ -z "$current" ]; then
      settings+=("SESSION_SECRET=$(new_session_secret)")
      echo "Generated a new SESSION_SECRET."
    fi
    # -o none: the command would otherwise print every setting back, values included.
    az staticwebapp appsettings set -n "$APP" -g "$RG" --setting-names "${settings[@]}" -o none
    echo "Set on $APP: $(az staticwebapp appsettings list -n "$APP" -g "$RG" --query "keys(properties)" -o tsv | tr '\r\n' '  ')"
    ;;
  local)
    git check-ignore -q .env || { echo ".env is not git-ignored; refusing to write it." >&2; exit 1; }
    session=""
    if [ -f .env ]; then session=$(sed -n 's/^SESSION_SECRET=//p' .env | tr -d '\r\n'); fi
    [ -n "$session" ] || session=$(new_session_secret)
    tmp=$(mktemp)
    chmod 600 "$tmp"
    {
      echo "# Written by tools/sync-discord-settings.sh from Key Vault $VAULT. Never commit."
      for pair in "${SHARED[@]}"; do
        echo "${pair%%=*}=$(read_secret "${pair#*=}")"
      done
      echo "SESSION_SECRET=$session"
    } > "$tmp"
    mv "$tmp" .env
    echo "Wrote .env: $(sed -n 's/=.*//p' .env | grep -v '^#' | tr '\n' ' ')"
    ;;
  *)
    echo "Usage: $0 azure|local" >&2
    exit 1
    ;;
esac
