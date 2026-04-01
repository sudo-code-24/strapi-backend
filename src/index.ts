import type { Core } from '@strapi/strapi';

/**
 * Duplicate Users & Permissions rules from the default Authenticated role onto
 * school roles `faculty` and `admin` so `/api/auth/local` and `/api/users/me` work.
 */
async function clonePermissionsToRole(strapi: Core.Strapi, sourceRoleId: number, targetRoleId: number) {
  const perm = strapi.db.query('plugin::users-permissions.permission');
  const existing = await perm.findMany({ where: { role: targetRoleId } });
  if (existing.length > 0) return;

  const source = await perm.findMany({ where: { role: sourceRoleId } });
  for (const p of source) {
    await perm.create({
      data: {
        action: p.action,
        role: targetRoleId,
      },
    });
  }
}

export default {
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    const roleQuery = strapi.db.query('plugin::users-permissions.role');
    const auth = await roleQuery.findOne({ where: { type: 'authenticated' } });
    if (!auth?.id) {
      strapi.log.warn('[bootstrap] Authenticated role not found; skip school role setup');
      return;
    }

    for (const name of ['faculty', 'admin'] as const) {
      let r = await roleQuery.findOne({ where: { name } });
      if (!r) {
        r = await roleQuery.create({
          data: {
            name,
            description: `${name} (school site)`,
            type: 'authenticated',
          },
        });
        strapi.log.info(`[bootstrap] created Users & Permissions role "${name}"`);
      }
      await clonePermissionsToRole(strapi, auth.id, r.id);
    }
  },
};
