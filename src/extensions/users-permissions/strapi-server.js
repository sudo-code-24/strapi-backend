'use strict';

/**
 * School site (Next.js) resolves admin vs faculty from `role.name` on `/users/me`.
 * The default handler runs the request query through Content API sanitization, which
 * can drop `populate=role` or strip nested role fields, so clients only see a role id
 * and fall back to "faculty".
 *
 * For the authenticated user only, always attach the role row loaded from the DB
 * after the usual user sanitization (passwords etc. stay protected).
 */
module.exports = (plugin) => {
  plugin.controllers.user.me = async (ctx) => {
    const authUser = ctx.state.user;
    if (!authUser) {
      return ctx.unauthorized();
    }

    const user = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id: authUser.id },
      populate: ['role'],
    });

    if (!user) {
      return ctx.unauthorized();
    }

    const schema = strapi.getModel('plugin::users-permissions.user');
    const body = await strapi.contentAPI.sanitize.output(user, schema, {
      auth: ctx.state.auth,
    });

    if (user.role && typeof user.role === 'object') {
      const r = user.role;
      body.role = {
        id: r.id,
        documentId: r.documentId,
        name: r.name,
        type: r.type,
        description: r.description ?? null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
      if (r.publishedAt !== undefined) {
        body.role.publishedAt = r.publishedAt;
      }
    }

    ctx.body = body;
  };

  return plugin;
};
