import { describe, expect, it } from 'vitest';
import { accessSettings, checkAccess, parseIdList, type AccessSettings } from './access.js';

const S: AccessSettings = {
  guildId: '900',
  playerRoleIds: ['501'],
  moderatorRoleIds: ['502'],
  adminRoleIds: ['503'],
  adminUserIds: ['777'],
  gameRoleIds: [],
};

describe('access rule (shared Darkspace Games contract, first match wins)', () => {
  it('lets the emergency admin in, even outside the server', () => {
    expect(checkAccess('777', null, S)).toEqual({ allowed: true, role: 'admin' });
    expect(checkAccess('777', [], S)).toEqual({ allowed: true, role: 'admin' });
  });

  it('refuses people outside the server', () => {
    expect(checkAccess('1', null, S)).toEqual({ allowed: false, reason: 'not-member' });
  });

  it('Admins outrank Mods, which outrank Players', () => {
    expect(checkAccess('1', ['501', '502', '503'], S)).toEqual({ allowed: true, role: 'admin' });
    expect(checkAccess('1', ['501', '502'], S)).toEqual({ allowed: true, role: 'moderator' });
    expect(checkAccess('1', ['501'], S)).toEqual({ allowed: true, role: 'player' });
  });

  it('refuses members without an allowed role', () => {
    expect(checkAccess('1', [], S)).toEqual({ allowed: false, reason: 'no-role' });
    expect(checkAccess('1', ['999'], S)).toEqual({ allowed: false, reason: 'no-role' });
  });

  it("uses the game's own role list instead of Players when it has one", () => {
    const beta = { ...S, gameRoleIds: ['600'] };
    expect(checkAccess('1', ['600'], beta)).toEqual({ allowed: true, role: 'player' });
    expect(checkAccess('1', ['501'], beta)).toEqual({ allowed: false, reason: 'no-role' });
    expect(checkAccess('1', ['502'], beta)).toEqual({ allowed: true, role: 'moderator' });
  });

  it('with no allowed roles at all, any server member may play (but still only members)', () => {
    const open = { ...S, playerRoleIds: [] };
    expect(checkAccess('1', [], open)).toEqual({ allowed: true, role: 'player' });
    expect(checkAccess('1', null, open)).toEqual({ allowed: false, reason: 'not-member' });
  });

  it('reads comma-separated id lists, and fails closed without the server id', () => {
    expect(parseIdList(' 1, 2,,3 ')).toEqual(['1', '2', '3']);
    expect(parseIdList(undefined)).toEqual([]);
    expect(accessSettings({})).toBeNull();
    expect(accessSettings({ DISCORD_GUILD_ID: '900', DISCORD_PLAYER_ROLE_IDS: '1,2' })).toMatchObject({
      guildId: '900',
      playerRoleIds: ['1', '2'],
      gameRoleIds: [],
    });
  });
});
