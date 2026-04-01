'use strict';

/**
 * Port `hs/server/src/lib/googleCalendar` here (or share a package). Use env:
 * - GOOGLE_CALENDAR_ID (or equivalent used by your calendar helper)
 * - GOOGLE_SERVICE_ACCOUNT_JSON / credentials as in the Express app
 *
 * Persist returned event id back onto the entry:
 * `strapi.documents('api::school-event.school-event').update({ documentId, data: { googleEventId } })`
 */

module.exports = ({ strapi }) => ({
  async afterCreate(/* result */) {
    strapi.log.debug('google-calendar-sync.afterCreate (stub)');
  },
  async afterUpdate(/* result */) {
    strapi.log.debug('google-calendar-sync.afterUpdate (stub)');
  },
  async afterDelete(/* result */) {
    strapi.log.debug('google-calendar-sync.afterDelete (stub)');
  },
});
