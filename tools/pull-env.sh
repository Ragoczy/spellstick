#!/usr/bin/env bash
# Local development only: writes .env (git-ignored) with the shared Darkspace Games Discord
# settings from Key Vault, without displaying them, for `npm run serve`. The deployed app reads
# Key Vault directly; nothing is copied there. Needs `az login` with read access to the vault.
#
#   npm run env:pull
#
# SESSION_SECRET is a local one: kept if .env already has it, otherwise generated.
set -euo pipefail

VAULT=kv-ha7siia4h4zia
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

git check-ignore -q .env || { echo ".env is not git-ignored; refusing to write it." >&2; exit 1; }

session=""
if [ -f .env ]; then session=$(sed -n 's/^SESSION_SECRET=//p' .env | tr -d '\r\n'); fi
[ -n "$session" ] || session=$(openssl rand -base64 48 | tr -d '\r\n')

tmp=$(mktemp)
chmod 600 "$tmp"
{
  echo "# Written by npm run env:pull from Key Vault $VAULT. Never commit."
  for pair in "${SHARED[@]}"; do
    value=$(az keyvault secret show --vault-name "$VAULT" --name "${pair#*=}" --query value -o tsv | tr -d '\r\n')
    echo "${pair%%=*}=$value"
  done
  echo "SESSION_SECRET=$session"
  echo "# Local port; add http://localhost:5190/api/auth/callback to the Darkspace Games Discord app."
  echo "PORT=5190"
} > "$tmp"
mv "$tmp" .env
echo "Wrote .env: $(grep -v '^#' .env | sed 's/=.*//' | tr '\n' ' ')"
