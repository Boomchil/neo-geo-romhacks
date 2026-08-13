// Reading / writing zip via fflate, with CRC32 computation per entry.
import { unzipSync, zipSync } from 'fflate';
import { crc32hex } from './crc32';

export interface ZipEntry {
  /** Full path within the archive (may contain subfolders, e.g. "maglordh/005-p1.p1"). */
  name: string;
  data: Uint8Array;
  crc32: string;
  size: number;
}

/** Decompresses all entries (excluding folders) and computes their CRC32. */
export function readZipEntries(data: Uint8Array): ZipEntry[] {
  const files = unzipSync(data);
  const entries: ZipEntry[] = [];
  for (const [name, bytes] of Object.entries(files)) {
    if (name.endsWith('/')) continue; // folder entry
    entries.push({ name, data: bytes, crc32: crc32hex(bytes), size: bytes.length });
  }
  return entries;
}

/** Builds a zip from a list of files (flat names). */
export function buildZip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const obj: Record<string, Uint8Array> = {};
  for (const e of entries) obj[e.name] = e.data;
  return zipSync(obj, { level: 6 });
}
