'use strict';

/**
 * JBCMHS spreadsheet → Strapi import (runs inside Strapi application context).
 *
 * Usage (from project root):
 *   node scripts/import-data.js
 *   node scripts/import-data.js --file ./JBCMHS.xlsx
 */

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { parse } = require('csv-parse/sync');
const core = require('@strapi/core');

const DEFAULT_WORKBOOK = path.join(__dirname, '..', 'JBCMHS.xlsx');

const UID = {
  gradeLevel: 'api::grade-level.grade-level',
  boardSection: 'api::board-section.board-section',
  facultyMember: 'api::faculty-member.faculty-member',
  announcementCategory: 'api::announcement-category.announcement-category',
  announcement: 'api::announcement.announcement',
  schoolEvent: 'api::school-event.school-event',
  schoolProfile: 'api::school-profile.school-profile',
};

/** Strapi Users & Permissions content-type (not under api::) */
const UP_USER_UID = 'plugin::users-permissions.user';
const UP_ROLE_UID = 'plugin::users-permissions.role';

function parseArgs(argv) {
  const args = { file: DEFAULT_WORKBOOK };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--file' && argv[i + 1]) {
      args.file = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

function emptyToNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function parseDate(v) {
  const n = emptyToNull(v);
  if (!n) return null;
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function findOneByField(strapi, uid, field, value) {
  if (value === undefined || value === null || value === '') return null;
  const rows = await strapi.entityService.findMany(uid, {
    filters: { [field]: value },
    limit: 1,
  });
  return rows[0] || null;
}

/**
 * Insert when no row exists for uniqueField === uniqueValue; otherwise return existing.
 */
async function createIfMissing(strapi, uid, uniqueField, uniqueValue, data, label = '') {
  const key = emptyToNull(uniqueValue);
  if (!key) {
    throw new Error(`createIfMissing(${label}): missing unique value for ${uniqueField}`);
  }
  const existing = await findOneByField(strapi, uid, uniqueField, key);
  if (existing) {
    strapi.log.info(`[import] skip duplicate ${label || uid} (${uniqueField}=${key})`);
    return existing;
  }
  try {
    const created = await strapi.entityService.create(uid, { data });
    strapi.log.info(`[import] created ${label || uid} (${uniqueField}=${key})`);
    return created;
  } catch (err) {
    strapi.log.error(`[import] failed creating ${label || uid}: ${err.message}`);
    throw err;
  }
}

function loadWorkbookRows(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv') {
    const text = fs.readFileSync(filePath, 'utf8');
    return {
      announcements: parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true }),
      events: [],
      school_info: [],
      faculty: [],
      users: [],
    };
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`Workbook not found: ${filePath}`);
  }
  const wb = XLSX.readFile(filePath);
  const sheetJson = (name) => {
    if (!wb.Sheets[name]) return [];
    return XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false });
  };
  return {
    announcements: sheetJson('announcements'),
    events: sheetJson('events'),
    school_info: sheetJson('school_info'),
    faculty: sheetJson('faculty'),
    users: sheetJson('users'),
  };
}

function parseSectionOrder(facultyRows) {
  const meta = facultyRows.find((r) => String(r.id || '').trim() === '__meta__');
  if (!meta || !meta.rowsJson) return [];
  try {
    const parsed = JSON.parse(meta.rowsJson);
    return Array.isArray(parsed) ? parsed.map((s) => String(s).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function gradeNameFromSectionTitle(title) {
  const m = String(title).match(/^Grade\s+(\d+)\s+Teachers$/i);
  if (!m) return null;
  return `Grade ${m[1]}`;
}

async function seedGradeLevels(strapi) {
  const levels = [7, 8, 9, 10, 11, 12].map((n) => ({
    name: `Grade ${n}`,
    sortOrder: n,
  }));
  const byName = new Map();
  for (const row of levels) {
    const created = await createIfMissing(strapi, UID.gradeLevel, 'name', row.name, row, 'grade-level');
    byName.set(row.name, created);
  }
  return byName;
}

async function seedBoardSections(strapi, sectionOrder, gradeByName) {
  const byTitle = new Map();
  for (let i = 0; i < sectionOrder.length; i += 1) {
    const title = sectionOrder[i];
    const gradeName = gradeNameFromSectionTitle(title);
    const gradeLevel = gradeName ? gradeByName.get(gradeName) : null;
    const existing = await findOneByField(strapi, UID.boardSection, 'title', title);
    if (existing) {
      strapi.log.info(`[import] skip duplicate board-section (title=${title})`);
      byTitle.set(title, existing);
      continue;
    }
    try {
      const created = await strapi.entityService.create(UID.boardSection, {
        data: {
          title,
          sortOrder: i,
          ...(gradeLevel ? { gradeLevel: gradeLevel.id } : {}),
        },
      });
      strapi.log.info(`[import] created board-section (title=${title})`);
      byTitle.set(title, created);
    } catch (err) {
      strapi.log.error(`[import] board-section ${title}: ${err.message}`);
      throw err;
    }
  }
  return byTitle;
}

async function seedAnnouncementCategories(strapi, announcements) {
  const names = new Set();
  for (const row of announcements) {
    const c = emptyToNull(row.category);
    if (c) names.add(c);
  }
  const byName = new Map();
  for (const name of names) {
    const created = await createIfMissing(
      strapi,
      UID.announcementCategory,
      'name',
      name,
      { name },
      'announcement-category'
    );
    byName.set(name, created);
  }
  return byName;
}

async function seedAnnouncements(strapi, rows, categoryByName) {
  for (const row of rows) {
    const sourceId = emptyToNull(row.id);
    if (!sourceId) continue;
    const title = emptyToNull(row.title);
    if (!title) {
      strapi.log.warn(`[import] announcement row ${sourceId}: missing title, skip`);
      continue;
    }
    const existing = await findOneByField(strapi, UID.announcement, 'sourceId', sourceId);
    if (existing) {
      strapi.log.info(`[import] skip duplicate announcement (sourceId=${sourceId})`);
      continue;
    }
    const catName = emptyToNull(row.category);
    const category = catName ? categoryByName.get(catName) : null;
    try {
      await strapi.entityService.create(UID.announcement, {
        data: {
          sourceId,
          title,
          content: emptyToNull(row.content) || '',
          publishedAt: parseDate(row.datePosted),
          imageUrl: emptyToNull(row.imageUrl),
          ...(category ? { category: category.id } : {}),
        },
      });
      strapi.log.info(`[import] created announcement (sourceId=${sourceId})`);
    } catch (err) {
      strapi.log.error(`[import] announcement ${sourceId}: ${err.message}`);
    }
  }
}

function normalizeEventType(v) {
  const s = String(v || '').toLowerCase().trim();
  if (s === 'academic' || s === 'event' || s === 'other') return s;
  return 'other';
}

async function seedSchoolEvents(strapi, rows) {
  for (const row of rows) {
    const sourceId = emptyToNull(row.id);
    if (!sourceId) {
      strapi.log.warn('[import] event row missing id, skip');
      continue;
    }
    const existingSource = await findOneByField(strapi, UID.schoolEvent, 'sourceId', sourceId);
    if (existingSource) {
      strapi.log.info(`[import] skip duplicate school-event (sourceId=${sourceId})`);
      continue;
    }
    const googleEventId = emptyToNull(row.googleEventId);
    if (googleEventId) {
      const existingG = await findOneByField(strapi, UID.schoolEvent, 'googleEventId', googleEventId);
      if (existingG) {
        strapi.log.info(`[import] skip duplicate school-event (googleEventId=${googleEventId})`);
        continue;
      }
    }
    const title = emptyToNull(row.title);
    if (!title) {
      strapi.log.warn(`[import] event ${sourceId}: missing title, skip`);
      continue;
    }
    try {
      await strapi.entityService.create(UID.schoolEvent, {
        data: {
          sourceId,
          title,
          description: emptyToNull(row.description) || '',
          startsAt: parseDate(row.date),
          endsAt: parseDate(row.endDate),
          eventType: normalizeEventType(row.type),
          imageUrl: emptyToNull(row.imageUrl),
          googleEventId,
        },
      });
      strapi.log.info(`[import] created school-event (sourceId=${sourceId})`);
    } catch (err) {
      strapi.log.error(`[import] school-event ${sourceId}: ${err.message}`);
    }
  }
}

async function upsertSchoolProfile(strapi, rows) {
  const row = rows[0];
  if (!row) {
    strapi.log.warn('[import] school_info sheet empty');
    return;
  }
  const data = {
    name: emptyToNull(row.name) || 'School',
    history: emptyToNull(row.history) || '',
    mission: emptyToNull(row.mission) || '',
    vision: emptyToNull(row.vision) || '',
    phone: emptyToNull(row.phone),
    email: emptyToNull(row.email),
    address: emptyToNull(row.address),
    officeHours: emptyToNull(row.officeHours),
    heroImageUrl: emptyToNull(row.heroImageUrl),
    schoolImageUrl: emptyToNull(row.schoolImageUrl),
  };
  const existing = await strapi.entityService.findMany(UID.schoolProfile, { limit: 1 });
  const existingEntry =
    existing == null ? null : Array.isArray(existing) ? existing[0] || null : existing;
  try {
    if (existingEntry) {
      await strapi.entityService.update(UID.schoolProfile, existingEntry.id, { data });
      strapi.log.info('[import] updated school-profile (single type)');
    } else {
      await strapi.entityService.create(UID.schoolProfile, { data });
      strapi.log.info('[import] created school-profile (single type)');
    }
  } catch (err) {
    strapi.log.error(`[import] school-profile: ${err.message}`);
    throw err;
  }
}

function looksLikeBcryptHash(value) {
  const s = emptyToNull(value);
  if (!s) return false;
  return s.startsWith('$2a$') || s.startsWith('$2b$') || s.startsWith('$2y$');
}

/**
 * Value that ends up in `up_users.password` — always a bcrypt string.
 * - Existing bcrypt in `hashedPassword` is stored as-is.
 * - Plain text in `password` is hashed with the Users & Permissions `password` attribute settings (rounds, etc.).
 */
async function resolvePasswordHashForDb(strapi, row) {
  const preHashed = emptyToNull(row.hashedPassword);
  if (preHashed && looksLikeBcryptHash(preHashed)) {
    return { hash: preHashed, source: 'imported-bcrypt' };
  }

  const plain = emptyToNull(row.password);
  if (plain) {
    const userService = strapi.plugin('users-permissions').service('user');
    const { password: hashed } = await userService.ensureHashedPasswords({ password: plain });
    return { hash: hashed, source: 'plaintext-hashed' };
  }

  return { hash: null, source: null };
}

/** School app roles (must exist in Strapi Users & Permissions — see `src/index.ts` bootstrap). */
function resolveSchoolRoleName(excelRoleName) {
  const token = String(excelRoleName || '')
    .trim()
    .toLowerCase();
  if (token === 'admin' || token === 'administrator') return 'admin';
  return 'faculty';
}

/**
 * Inserts Users & Permissions users. Only bcrypt hashes are written to the database:
 * spreadsheet bcrypt in `hashedPassword`, or `password` (plain) hashed via the plugin’s `ensureHashedPasswords`.
 * Uses strapi.db.query create so imported bcrypt is not hashed twice.
 */
async function seedUsersPermissions(strapi, rows) {
  if (!rows.length) {
    strapi.log.info('[import] users sheet empty, skip');
    return;
  }

  const roles = await strapi.db.query(UP_ROLE_UID).findMany();
  if (!roles.length) {
    strapi.log.error('[import] no users-permissions roles found; skip user import');
    return;
  }

  for (const row of rows) {
    const username = emptyToNull(row.username);
    const email = emptyToNull(row.email);

    if (!username || !email) {
      strapi.log.warn('[import] user row missing username or email, skip');
      continue;
    }

    const { hash: passwordHash, source: passwordSource } = await resolvePasswordHashForDb(strapi, row);
    if (!passwordHash) {
      strapi.log.warn(
        `[import] user ${username}: need bcrypt in "hashedPassword" or plain text in "password" column, skip`
      );
      continue;
    }
    if (passwordSource === 'plaintext-hashed') {
      strapi.log.info(`[import] user ${username}: hashed plain "password" for database storage`);
    }

    const existing = await strapi.db.query(UP_USER_UID).findOne({
      where: { $or: [{ email }, { username }] },
    });
    if (existing) {
      strapi.log.info(`[import] skip duplicate up_user (email=${email} or username=${username})`);
      continue;
    }

    const targetName = resolveSchoolRoleName(row.role);
    const targetRole = roles.find((r) => r.name && r.name.toLowerCase() === targetName);
    if (!targetRole?.id) {
      strapi.log.error(
        `[import] user ${email}: no Strapi role named "${targetName}" (bootstrap should create admin & faculty), skip`
      );
      continue;
    }

    try {
      await strapi.db.query(UP_USER_UID).create({
        data: {
          username,
          email,
          password: passwordHash,
          provider: 'local',
          confirmed: true,
          blocked: false,
          role: targetRole.id,
        },
      });
      strapi.log.info(`[import] created users-permissions user (${username}, role=${targetName})`);
    } catch (err) {
      strapi.log.error(`[import] user ${email}: ${err.message}`);
    }
  }
}

async function seedFaculty(strapi, facultyRows, boardByTitle) {
  for (const row of facultyRows) {
    const importKey = emptyToNull(row.id);
    if (!importKey || importKey === '__meta__') continue;

    const fullName = emptyToNull(row.name);
    if (!fullName) {
      strapi.log.warn(`[import] faculty ${importKey}: missing name, skip`);
      continue;
    }

    const sectionTitle = emptyToNull(row.boardSection) || emptyToNull(row.department);
    const boardSection = sectionTitle ? boardByTitle.get(sectionTitle) : null;
    if (sectionTitle && !boardSection) {
      strapi.log.warn(`[import] faculty ${importKey}: unknown section "${sectionTitle}", skip`);
      continue;
    }

    const existing = await findOneByField(strapi, UID.facultyMember, 'importKey', importKey);
    if (existing) {
      strapi.log.info(`[import] skip duplicate faculty-member (importKey=${importKey})`);
      continue;
    }

    const email = emptyToNull(row.email);
    if (email) {
      const dupEmail = await strapi.entityService.findMany(UID.facultyMember, {
        filters: { email },
        limit: 1,
      });
      if (dupEmail.length) {
        strapi.log.warn(`[import] faculty ${importKey}: duplicate email ${email}, skip`);
        continue;
      }
    }

    try {
      const pos = row.positionIndex === '' || row.positionIndex === undefined ? 0 : Number(row.positionIndex);
      await strapi.entityService.create(UID.facultyMember, {
        data: {
          importKey,
          fullName,
          roleTitle: emptyToNull(row.role),
          email,
          phone: emptyToNull(row.phone),
          photoUrl: emptyToNull(row.photoUrl),
          positionIndex: Number.isFinite(pos) ? pos : 0,
          ...(boardSection ? { boardSection: boardSection.id } : {}),
        },
      });
      strapi.log.info(`[import] created faculty-member (${importKey})`);
    } catch (err) {
      strapi.log.error(`[import] faculty ${importKey}: ${err.message}`);
    }
  }
}

async function main() {
  const { file } = parseArgs(process.argv);
  let strapi;
  try {
    const appContext = await core.compileStrapi();
    strapi = await core.createStrapi(appContext).load();

    strapi.log.info(`[import] reading ${file}`);
    const data = loadWorkbookRows(file);

    strapi.log.info('[import] 1/7 grade levels');
    const gradeByName = await seedGradeLevels(strapi);

    const sectionOrder = parseSectionOrder(data.faculty);
    if (!sectionOrder.length) {
      strapi.log.warn('[import] no section order from faculty __meta__; using sorted departments');
      const set = new Set();
      for (const r of data.faculty) {
        if (String(r.id) === '__meta__') continue;
        const t = emptyToNull(r.boardSection) || emptyToNull(r.department);
        if (t) set.add(t);
      }
      sectionOrder.push(...[...set].sort());
    }

    strapi.log.info('[import] 2/7 board sections');
    const boardByTitle = await seedBoardSections(strapi, sectionOrder, gradeByName);

    strapi.log.info('[import] 3/7 announcement categories + announcements');
    const catByName = await seedAnnouncementCategories(strapi, data.announcements);
    await seedAnnouncements(strapi, data.announcements, catByName);

    strapi.log.info('[import] 4/7 school events');
    await seedSchoolEvents(strapi, data.events);

    strapi.log.info('[import] 5/7 school profile');
    await upsertSchoolProfile(strapi, data.school_info);

    strapi.log.info('[import] 6/7 users-permissions users');
    await seedUsersPermissions(strapi, data.users);

    strapi.log.info('[import] 7/7 faculty');
    await seedFaculty(strapi, data.faculty, boardByTitle);

    strapi.log.info('[import] done');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    if (strapi) await strapi.destroy();
  }
}

main();
