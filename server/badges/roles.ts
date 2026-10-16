/**
 * Tier roles in the Darkspace Discord server (M14, docs/BADGES.md). The Spellstick Live bot,
 * with Manage Roles and its own role above the five tier roles, gives each player the role for
 * their tier and takes the others away: one tier role at a time.
 *
 * Settings: DISCORD_BOT_TOKEN and DISCORD_TIER_ROLE_IDS (the five role ids, lowest tier first,
 * comma-separated), both from Key Vault. Without them, nothing is synced and badges still work
 * on the profile page.
 */

const DISCORD_API = 'https://discord.com/api/v10';
const TIMEOUT_MS = 5000;
const ID_RE = /^\d{5,25}$/;
/** On a rate limit, wait at most this long (ms) and try once more. */
const MAX_RETRY_WAIT_MS = 5000;

export interface RoleSyncOptions {
  token: string;
  guildId: string;
  /** Five role ids, tier 1 first. */
  tierRoleIds: readonly string[];
  fetch: typeof fetch;
  /** Never passed tokens or Discord ids. */
  log: (message: string) => void;
  /** Tests: how to wait out a rate limit. */
  sleep?: (ms: number) => Promise<void>;
}

/** Reads the settings; null (with a log line if half-set) when tier roles are off. */
export function roleSyncFromEnv(
  env: Record<string, string | undefined>,
  deps: { fetch: typeof fetch; log: (m: string) => void },
): RoleSync | null {
  const token = env.DISCORD_BOT_TOKEN;
  const ids = (env.DISCORD_TIER_ROLE_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const guildId = env.DISCORD_GUILD_ID;
  if (!token && ids.length === 0) return null;
  if (!token || !guildId || ids.length !== 5 || !ids.every((id) => ID_RE.test(id))) {
    deps.log('badges: tier roles are off (DISCORD_BOT_TOKEN and five DISCORD_TIER_ROLE_IDS are needed)');
    return null;
  }
  return new RoleSync({ token, guildId, tierRoleIds: ids, fetch: deps.fetch, log: deps.log });
}

export class RoleSync {
  constructor(private readonly o: RoleSyncOptions) {}

  /** The role for `tier` (1–5), or null for 0. */
  roleFor(tier: number): string | null {
    return tier >= 1 ? (this.o.tierRoleIds[tier - 1] ?? null) : null;
  }

  /**
   * Gives `userId` the role for `tier` and removes the other tier roles. `current`: the roles
   * they hold now, if known (sign-in); otherwise only `previousTier`'s role is removed.
   */
  async setTier(
    userId: string,
    tier: number,
    opts: { current?: readonly string[]; previousTier?: number } = {},
  ): Promise<void> {
    if (!ID_RE.test(userId)) return;
    const want = this.roleFor(tier);
    const held = opts.current
      ? this.o.tierRoleIds.filter((r) => opts.current!.includes(r))
      : [this.roleFor(opts.previousTier ?? 0)].filter((r): r is string => r !== null);
    for (const role of held) if (role !== want) await this.call('DELETE', userId, role);
    if (want && !(opts.current?.includes(want) ?? false)) await this.call('PUT', userId, want);
  }

  private async call(method: 'PUT' | 'DELETE', userId: string, roleId: string): Promise<void> {
    const url = `${DISCORD_API}/guilds/${this.o.guildId}/members/${userId}/roles/${roleId}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Response;
      try {
        res = await this.o.fetch(url, {
          method,
          headers: { Authorization: `Bot ${this.o.token}`, 'X-Audit-Log-Reason': 'Spellstick tier' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (e) {
        this.o.log(`badges: tier role ${method} failed (${(e as Error).name})`);
        return;
      }
      if (res.ok) return;
      if (res.status === 429 && attempt === 0) {
        const body = (await res.json().catch(() => ({}))) as { retry_after?: number };
        const wait = Math.min(MAX_RETRY_WAIT_MS, Math.max(0, (body.retry_after ?? 1) * 1000));
        await (this.o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(wait);
        continue;
      }
      // 404: they left the server. 403: the bot's role is below the tier roles, or lacks Manage Roles.
      this.o.log(`badges: tier role ${method} returned ${res.status}`);
      return;
    }
  }
}
