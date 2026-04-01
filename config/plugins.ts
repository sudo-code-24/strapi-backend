import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
    'review-workflows': { enabled: false },
    'sso': { enabled: false },
    'audit-logs': { enabled: false },
    'release': { enabled: false }, // important for "Releases"
});

export default config;
