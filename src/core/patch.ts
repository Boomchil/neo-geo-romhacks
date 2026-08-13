// Validates the loaded romset and builds the complete patched set (non-merged).
import type { GameDef, PatchDef, PatchFileDef, PatchVariant, RomFileDef } from './types';
import type { ZipEntry } from './zip';
import { applyIps, parseIps } from './ips';
import { crc32hex, normalizeCrc } from './crc32';

/**
 * Effective file list for a patch + selected variant: the patch's common `files`, with the
 * variant's files merged on top (overriding by `rom`). No variant => just the common files.
 */
export function effectivePatchFiles(
  patch: Pick<PatchDef, 'files'>,
  variant?: Pick<PatchVariant, 'files'> | null,
): PatchFileDef[] {
  const byRom = new Map<string, PatchFileDef>();
  for (const f of patch.files) byRom.set(f.rom, f);
  for (const f of variant?.files ?? []) byRom.set(f.rom, f);
  return [...byRom.values()];
}

export interface FileStatus {
  /** Canonical name expected in the set. */
  name: string;
  region: RomFileDef['region'];
  expectedCRC: string;
  size: number;
  /** The file was found (by CRC) in the loaded zips. */
  present: boolean;
  /** This file will be patched. */
  patched: boolean;
}

export interface ValidationResult {
  ok: boolean;
  files: FileStatus[];
  /** Names of the missing files (these prevent generation). */
  missing: string[];
}

function indexByCrc(entries: ZipEntry[]): Map<string, ZipEntry> {
  const m = new Map<string, ZipEntry>();
  for (const e of entries) {
    const c = normalizeCrc(e.crc32);
    if (!m.has(c)) m.set(c, e);
  }
  return m;
}

function patchFileFor(patch: PatchDef, romName: string): PatchFileDef | undefined {
  return patch.files.find((f) => f.rom === romName);
}

/**
 * Validates that all files of the complete romset are present (matched by CRC),
 * and indicates which ones will be patched.
 */
export function validate(game: GameDef, patch: PatchDef, entries: ZipEntry[]): ValidationResult {
  const byCrc = indexByCrc(entries);
  const files: FileStatus[] = game.files.map((gf) => {
    const present = byCrc.has(normalizeCrc(gf.crc32));
    return {
      name: gf.name,
      region: gf.region,
      expectedCRC: normalizeCrc(gf.crc32),
      size: gf.size,
      present,
      patched: !!patchFileFor(patch, gf.name),
    };
  });
  const missing = files.filter((f) => !f.present).map((f) => f.name);
  return { ok: missing.length === 0, files, missing };
}

export interface PatchedFile {
  name: string;
  data: Uint8Array;
}

/**
 * Builds the complete patched set. Only call after a successful validation.
 * `ipsByPath`: contents of the .ips files, indexed by the `ips` value of each PatchFileDef.
 * Throws an error if a file is missing or a target CRC does not match.
 */
export function buildPatchedSet(
  game: GameDef,
  patch: PatchDef,
  entries: ZipEntry[],
  ipsByPath: Record<string, Uint8Array>,
): PatchedFile[] {
  const byCrc = indexByCrc(entries);
  const result: PatchedFile[] = [];

  for (const gf of game.files) {
    const src = byCrc.get(normalizeCrc(gf.crc32));
    if (!src) {
      throw new Error(`Missing file: ${gf.name} (CRC ${normalizeCrc(gf.crc32)}).`);
    }

    const pf = patchFileFor(patch, gf.name);
    if (!pf) {
      // Unpatched file: keep it as-is, but with its canonical name.
      result.push({ name: gf.name, data: src.data });
      continue;
    }

    // Patched file.
    if (normalizeCrc(src.crc32) !== normalizeCrc(pf.sourceCRC)) {
      throw new Error(
        `Unexpected source for ${gf.name}: CRC ${normalizeCrc(src.crc32)} ` +
          `(expected ${normalizeCrc(pf.sourceCRC)}).`,
      );
    }
    const ips = ipsByPath[pf.ips];
    if (!ips) throw new Error(`IPS not found: ${pf.ips}.`);

    const patched = applyIps(src.data, parseIps(ips));

    if (pf.targetCRC) {
      const got = crc32hex(patched);
      if (got !== normalizeCrc(pf.targetCRC)) {
        throw new Error(
          `Patch failed on ${gf.name}: got CRC ${got}, expected ${normalizeCrc(pf.targetCRC)}.`,
        );
      }
    }
    result.push({ name: gf.name, data: patched });
  }

  return result;
}
