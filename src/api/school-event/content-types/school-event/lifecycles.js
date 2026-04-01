'use strict';

/**
 * Mirror custom-backend behaviour: create/update/delete Google Calendar rows when
 * `school-event` entries change. Implement HTTP calls in a dedicated service and call it here.
 *
 * @see hs/server/src/services/eventService.ts
 * @see hs/server/src/lib/googleCalendar.ts
 */

module.exports = {
  async afterCreate(event) {
    const result = event?.result;
    if (result?.googleEventId) return;
    // await strapi.service('api::school-event.google-calendar-sync').afterCreate(result);
  },

  async afterUpdate(event) {
    const result = event?.result;
    // await strapi.service('api::school-event.google-calendar-sync').afterUpdate(result);
  },

  async afterDelete(event) {
    const result = event?.result;
    // await strapi.service('api::school-event.google-calendar-sync').afterDelete(result);
  },
};
