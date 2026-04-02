import type { Core } from '@strapi/strapi';

/**
 * Ensure school roles have every Users & Permissions action that the built-in
 * "Authenticated" role has. Runs on every bootstrap so mirroring stays correct
 * after admins change the Authenticated role (the old one-time clone left
 * faculty/admin stuck with the first-boot permission set only).
 */
async function syncPermissionsFromRole(strapi: Core.Strapi, sourceRoleId: number, targetRoleId: number) {
  const perm = strapi.db.query('plugin::users-permissions.permission');
  const existing = await perm.findMany({ where: { role: targetRoleId } });
  const targetActions = new Set(existing.map((p) => p.action));

  const source = await perm.findMany({ where: { role: sourceRoleId } });
  for (const p of source) {
    if (targetActions.has(p.action)) continue;
    await perm.create({
      data: {
        action: p.action,
        role: targetRoleId,
      },
    });
    targetActions.add(p.action);
  }
}

export default {
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    const roleQuery = strapi.db.query('plugin::users-permissions.role');
    const auth = await roleQuery.findOne({ where: { name: 'Authenticated' } });
    if (!auth?.id) {
      strapi.log.warn('[bootstrap] Role "Authenticated" not found; skip school role setup');
      return;
    }

    for (const name of ['faculty', 'admin'] as const) {
      let r = await roleQuery.findOne({ where: { name } });
      if (!r) {
        r = await roleQuery.create({
          data: {
            name,
            description: `${name} (school site)`,
            // `type` is unique per role (see plugin schema). Only the built-in
            // "Authenticated" row may use type `authenticated`. Custom roles
            // use their own type strings — same as Strapi's admin `createRole`.
            // Using `authenticated` here breaks `default_role` lookups and can
            // assign the wrong role on register / OAuth flows.
            type: name,
          },
        });
        strapi.log.info(`[bootstrap] created Users & Permissions role "${name}"`);
      } else if (r.type === 'authenticated') {
        await roleQuery.update({ where: { id: r.id }, data: { type: name } });
        strapi.log.info(`[bootstrap] corrected role "${name}" type (was invalid duplicate "authenticated")`);
      }
      await syncPermissionsFromRole(strapi, auth.id, r.id);
    }
  },
};
