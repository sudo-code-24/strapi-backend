# JBCMHS Strapi CMS (v5)

Headless CMS for Jose B. Cardenas Memorial High School: announcements, events, school profile, faculty board, and Users & Permissions for the public Next.js site.

- **Stack:** [Strapi 5](https://docs.strapi.io/) (Node 20–24), SQLite by default (Postgres supported)
- **Related app:** Next.js frontend in the **`hs`** repo, `client/` folder (e.g. `../../hs/client` from this directory if both live under `projects/`)

## Prerequisites

- **Node.js** `>=20` and `<=24` (see `package.json` `engines`)
- **npm** 6+

## Project setup

1. **Clone and install**

   ```bash
   cd my-strapi-backend
   npm install
   ```

2. **Environment**

   Copy `.env.example` to `.env` and set **unique random values** for every secret (do not use the example placeholders in production):

   | Variable | Purpose |
   |----------|---------|
   | `APP_KEYS` | Session / cookie signing (comma-separated keys) |
   | `API_TOKEN_SALT` | API token hashing |
   | `ADMIN_JWT_SECRET` | Strapi **Admin panel** JWT |
   | `JWT_SECRET` | **Users & Permissions** (Content API) JWT — must match Next `STRAPI_JWT_SECRET` |
   | `TRANSFER_TOKEN_SALT` | Data transfer tokens |
   | `ENCRYPTION_KEY` | Encrypted field storage |

   Optional database overrides: `DATABASE_CLIENT` (`sqlite` default), `DATABASE_FILENAME`, or Postgres via `DATABASE_URL` / `DATABASE_CLIENT=postgres` (see `config/database.ts`).

3. **First run**

   ```bash
   npm run develop
   ```

   Open the admin UI (default [http://localhost:1337/admin](http://localhost:1337/admin)), create the first admin user, then:

   - **Settings → API Tokens:** create a **Full access** (or scoped) token for the Next.js server (`STRAPI_API_TOKEN`).
   - **Settings → Users & Permissions → Roles:** ensure **Public** (and/or **Authenticated**) allow the actions you need for public reads; the school site also uses a **Bearer API token** from Next for many calls.

On first boot, `src/index.ts` **bootstrap** ensures `faculty` and `admin` roles exist and **copies permissions** from the built-in **Authenticated** role so `/api/auth/local` and `/api/users/me` work for site logins.

## Content types (REST)

Strapi exposes the Content API under `/api/…`. In **Strapi 5**, collection types use the **plural** API ID; **single types** use the **singular** API ID for `GET`/`PUT`/`DELETE`.

| Content type | Kind | REST base (examples) |
|--------------|------|----------------------|
| Announcement | Collection | `GET/POST /api/announcements`, `GET/PUT/DELETE /api/announcements/:documentId` |
| Announcement category | Collection | `GET /api/announcement-categories` |
| School event | Collection | `GET/POST /api/school-events`, … |
| Grade level | Collection | `GET /api/grade-levels` |
| Board section | Collection | `GET /api/board-sections` |
| Faculty member | Collection | `GET /api/faculty-members` |
| School profile | **Single** | **`GET/PUT /api/school-profile`** (singular — not `school-profiles`) |

Use Strapi’s **documentId** (string) in URLs for a single document where applicable (Strapi 5).

## Data migration / import

Legacy content can be loaded from the Excel workbook used by the school:

```bash
npm run import:data
# or
node scripts/import-data.js --file ./path/to/JBCMHS.xlsx
```

Default workbook path: `./JBCMHS.xlsx` at the project root. The script uses Strapi’s programmatic API (`@strapi/core`) to upsert grade levels, board sections, faculty members, categories, announcements, events, and school profile fields where defined.

**Requirements:** Run against a Strapi instance with matching content types; prefer a **stopped** `develop` process or run in maintenance—see `scripts/import-data.js` for details and constraints.

For a **fresh environment**:

1. `npm run develop` once to apply migrations and create the admin user.
2. Configure roles and API token.
3. Run `npm run import:data` (or import via Admin if you prefer manual entry).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run develop` | Admin + API with auto-reload |
| `npm run start` | Production mode (run `build` first) |
| `npm run build` | Build the admin panel |
| `npm run import:data` | Import `JBCMHS.xlsx` (see above) |

## Admin UI customization

Do **not** edit generated files under `.strapi/client/` (they are overwritten on build).

- **`src/admin/app.tsx`** — entry for admin extensions; imports global CSS.
- **`src/admin/custom.css`** — persistent overrides for the Strapi admin.

After changes: `npm run develop` or `npm run build`.

## Production notes

- Set `NODE_ENV=production` and secure `HOST` / `PORT` as needed (`config/server.ts`).
- Use a managed **Postgres** (or your chosen DB) for production; point `DATABASE_URL` / `DATABASE_CLIENT` accordingly.
- **CORS:** configure if the public site is on another origin (Strapi or reverse proxy).
- Rotate `JWT_SECRET` only with a coordinated plan: existing user JWTs and the Next.js `STRAPI_JWT_SECRET` must stay in sync.

## Learn more

- [Strapi 5 documentation](https://docs.strapi.io/)
- [REST API](https://docs.strapi.io/cms/api/rest)
- [Users & Permissions](https://docs.strapi.io/cms/features/users-permissions)
