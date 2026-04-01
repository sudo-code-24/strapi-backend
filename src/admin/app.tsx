import type { StrapiApp } from "@strapi/strapi/admin";

import "./custom.css";

export default {
  config: {
    locales: [],
    
  },
  bootstrap(_app: StrapiApp) {
    // Optional: register admin extensions here
  },
};
