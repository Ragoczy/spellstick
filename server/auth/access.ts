/**
 * Who may play: the shared Darkspace Games access rule (Darkspace Discord server roles),
 * from docs/darkspace-discord-signin.md in the card game repo. First match wins:
 *   1. emergency admin id → admin (even outside the server)
 *   2. not in the server → refused, not-member
 *   3. an Admins role → admin
 *   4. a Mods role → moderator
 *   5. an allowed role → player (the game's own list if set, else the shared Players roles;
 *      if both are empty, any server member)
 *   6. otherwise → refused, no-role
 */

export type AccessRole = 'player' | 'moderator' | 'admin';
export type AccessRefusal = 'not-member' | 'no-role';
export type Access = { allowed: true; role: AccessRole } | { allowed: false; reason: AccessRefusal };

export interface AccessSettings {
  guildId: string;
  playerRoleIds: string[];
  moderatorRoleIds: string[];
  adminRoleIds: string[];
  adminUserIds: string[];
  /** This game's own allowed roles (e.g. a beta role); overrides the Players roles when set. */
  gameRoleIds: string[];
}

export const ACCESS_ROLES: readonly AccessRole[] = ['player', 'moderator', 'admin'];

/** "1, 2,3" → ["1", "2", "3"]. */
export function parseIdList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/** The shared settings from app settings; null if the server id is missing (fail closed). */
export function accessSettings(env: Record<string, string | undefined>): AccessSettings | null {
  const guildId = env.DISCORD_GUILD_ID?.trim();
  if (!guildId) return null;
  return {
    guildId,
    playerRoleIds: parseIdList(env.DISCORD_PLAYER_ROLE_IDS),
    moderatorRoleIds: parseIdList(env.DISCORD_MODERATOR_ROLE_IDS),
    adminRoleIds: parseIdList(env.DISCORD_ADMIN_ROLE_IDS),
    adminUserIds: parseIdList(env.ADMIN_DISCORD_IDS),
    gameRoleIds: parseIdList(env.GAME_ALLOWED_ROLE_IDS),
  };
}

/** `memberRoles` is null when the user isn't in the server. */
export function checkAccess(userId: string, memberRoles: string[] | null, s: AccessSettings): Access {
  if (s.adminUserIds.includes(userId)) return { allowed: true, role: 'admin' };
  if (memberRoles === null) return { allowed: false, reason: 'not-member' };
  const has = (ids: string[]) => ids.some((id) => memberRoles.includes(id));
  if (has(s.adminRoleIds)) return { allowed: true, role: 'admin' };
  if (has(s.moderatorRoleIds)) return { allowed: true, role: 'moderator' };
  const allowed = s.gameRoleIds.length > 0 ? s.gameRoleIds : s.playerRoleIds;
  if (allowed.length === 0 || has(allowed)) return { allowed: true, role: 'player' };
  return { allowed: false, reason: 'no-role' };
}
