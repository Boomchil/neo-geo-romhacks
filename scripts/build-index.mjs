#!/usr/bin/env node
// Scans public/patches (game.json per game + patch.json per patch), validates the data and
// generates public/patches.index.json. No dependencies. On invalid data: exit 1 (CI fails).
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, relative } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const PATCHES_DIR = join(PUBLIC, 'patches');

const errors = [];
const err = (m) => errors.push(m);
const normCrc = (c) => String(c).trim().toLowerCase().padStart(8, '0');
// A valid CRC is a string of 1 to 8 hex digits (not a number, not undefined).
const validCrc = (c) => typeof c === 'string' && /^[0-9a-f]{1,8}$/i.test(c.trim());

// First meaningful line of a description, stripped of basic Markdown, for the patch cards.
function deriveSummary(md) {
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line || /^[#>\-*|`]/.test(line)) continue; // skip headings, quotes, lists, tables, fences
    const text = line.replace(/\*\*|__|[*_`]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    return text.length > 160 ? text.slice(0, 157) + '…' : text;
  }
  return '';
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    err(`Unreadable JSON: ${relative(ROOT, path)} - ${e.message}`);
    return null;
  }
}

/** Recursive list of files named `target` under `dir`. */
function findFiles(dir, target) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...findFiles(p, target));
    else if (name === target) out.push(p);
  }
  return out;
}

// --- Games ---
const games = {};
for (const gamePath of findFiles(PATCHES_DIR, 'game.json')) {
  const g = readJson(gamePath);
  if (!g) continue;
  if (!g.id) {
    err(`Invalid game.json (missing id): ${relative(ROOT, gamePath)}`);
    continue;
  }
  if (!Array.isArray(g.files)) {
    if (g.comingSoon || g.comingLater) g.files = []; // upcoming games may not have a romset defined yet
    else {
      err(`Invalid game.json (files): ${relative(ROOT, gamePath)}`);
      continue;
    }
  }
  for (const f of g.files) {
    if (!validCrc(f.crc32)) {
      err(`Game ${g.id}, file "${f.name ?? '?'}": invalid crc32 ${JSON.stringify(f.crc32)} (8 hex digits as a string expected).`);
    }
    f.crc32 = normCrc(f.crc32);
    if (!f.name || typeof f.size !== 'number' || !f.region) {
      err(`Invalid game file in ${g.id}: ${JSON.stringify(f)}`);
    }
  }
  // Logo convention: logo.png in the game folder → served-relative path (or none).
  const gameDir = dirname(gamePath);
  const gameBase = relative(PUBLIC, gameDir).split(/[\\/]/).join('/');
  g.baseDir = gameBase;
  if (existsSync(join(gameDir, 'logo.png'))) g.logo = `${gameBase}/logo.png`;
  else delete g.logo;
  // Teaser games (coming soon / later) can carry a game-level description.md (there's no patch to hold one).
  if (g.comingSoon || g.comingLater) {
    const gDescPath = join(gameDir, 'description.md');
    if (existsSync(gDescPath)) g.description = readFileSync(gDescPath, 'utf8');
    const gNotesPath = join(gameDir, 'notes.md');
    if (existsSync(gNotesPath)) g.notes = readFileSync(gNotesPath, 'utf8');
  }
  if (games[g.id]) err(`Duplicate game: ${g.id}`);
  games[g.id] = g;
}

// --- Patches ---
const patches = [];
const seenPatchIds = new Set();
for (const patchPath of findFiles(PATCHES_DIR, 'patch.json')) {
  const p = readJson(patchPath);
  if (!p) continue;
  const dir = dirname(patchPath);
  const baseDir = relative(PUBLIC, dir).split(/[\\/]/).join('/');

  if (!p.id || !p.game || !Array.isArray(p.files)) {
    err(`Invalid patch.json (id/game/files): ${baseDir}`);
    continue;
  }
  if (seenPatchIds.has(p.id)) {
    err(`Duplicate patch: "${p.id}" (${baseDir}) - each patch must have a unique id.`);
  }
  seenPatchIds.add(p.id);

  const game = games[p.game];
  if (!game) {
    err(`Patch "${p.id}": unknown game "${p.game}" (missing patches/${p.game}/game.json).`);
  }

  // Validate a list of patch files (common, or a variant's). `ctx` annotates error messages.
  const validateFiles = (files, ctx) => {
    for (const pf of files) {
      if (!validCrc(pf.sourceCRC)) {
        err(`Patch "${p.id}"${ctx}: invalid sourceCRC for "${pf.rom ?? '?'}" ${JSON.stringify(pf.sourceCRC)}.`);
      }
      if (pf.targetCRC != null && !validCrc(pf.targetCRC)) {
        err(`Patch "${p.id}"${ctx}: invalid targetCRC for "${pf.rom ?? '?'}" ${JSON.stringify(pf.targetCRC)}.`);
      }
      pf.sourceCRC = normCrc(pf.sourceCRC);
      if (pf.targetCRC) pf.targetCRC = normCrc(pf.targetCRC);
      if (!pf.rom || !pf.ips || !pf.sourceCRC) {
        err(`Patch "${p.id}"${ctx}: invalid file entry ${JSON.stringify(pf)}`);
        continue;
      }
      if (!existsSync(join(dir, pf.ips))) {
        err(`Patch "${p.id}"${ctx}: IPS not found "${pf.ips}" in ${baseDir}.`);
      }
      if (game) {
        const gf = game.files.find((f) => f.name === pf.rom);
        if (!gf) {
          err(`Patch "${p.id}"${ctx}: the file "${pf.rom}" does not exist in the game "${p.game}".`);
        } else if (gf.crc32 !== pf.sourceCRC) {
          err(
            `Patch "${p.id}"${ctx}: sourceCRC ${pf.sourceCRC} for "${pf.rom}" ` +
            `≠ game CRC ${gf.crc32}. The patch applies to the original file.`,
          );
        }
      }
    }
  };
  validateFiles(p.files, '');

  // Optional selectable versions. Each variant's files are validated like the common ones, and an
  // optional per-variant description is inlined from description.<id>.md.
  let variants;
  if (p.variants != null) {
    if (!Array.isArray(p.variants)) {
      err(`Patch "${p.id}": "variants" must be an array.`);
    } else {
      const seenV = new Set();
      variants = p.variants.map((v) => {
        if (!v.id || !v.label) err(`Patch "${p.id}": each variant needs an "id" and a "label".`);
        if (seenV.has(v.id)) err(`Patch "${p.id}": duplicate variant id "${v.id}".`);
        seenV.add(v.id);
        if (v.files != null && !Array.isArray(v.files)) err(`Patch "${p.id}" variant "${v.id}": "files" must be an array.`);
        const vFiles = Array.isArray(v.files) ? v.files : [];
        validateFiles(vFiles, ` variant "${v.id}"`);
        const vDescPath = join(dir, `description.${v.id}.md`);
        const vDesc = existsSync(vDescPath) ? readFileSync(vDescPath, 'utf8') : undefined;
        return { id: v.id, label: v.label ?? v.id, files: vFiles, ...(vDesc ? { description: vDesc } : {}) };
      });
    }
  }

  const descPath = join(dir, 'description.md');
  const description = existsSync(descPath) ? readFileSync(descPath, 'utf8') : '';
  const notesPath = join(dir, 'notes.md');
  const notes = existsSync(notesPath) ? readFileSync(notesPath, 'utf8') : '';

  patches.push({
    id: p.id,
    // name is optional: when omitted the title comes from description.md.
    ...(p.name ? { name: p.name } : {}),
    game: p.game,
    ...(p.author ? { author: p.author } : {}),
    version: p.version ?? '',
    summary: p.summary ?? deriveSummary(description),
    ...(p.issuesUrl ? { issuesUrl: String(p.issuesUrl) } : {}),
    files: p.files,
    ...(variants ? { variants } : {}),
    description,
    ...(notes ? { notes } : {}),
    baseDir,
  });
}

if (errors.length) {
  console.error(`\n[build-index] ${errors.length} error(s):`);
  for (const e of errors) console.error('  • ' + e);
  process.exit(1);
}

patches.sort((a, b) => a.game.localeCompare(b.game) || (a.name ?? a.id).localeCompare(b.name ?? b.id));

const index = { generatedAt: new Date().toISOString(), games, patches };
const outPath = join(PUBLIC, 'patches.index.json');
writeFileSync(outPath, JSON.stringify(index, null, 2));
console.log(
  `[build-index] OK - ${Object.keys(games).length} game(s), ${patches.length} patch(es) → ${relative(ROOT, outPath)}`,
);
