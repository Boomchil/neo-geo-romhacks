// Shared region assembly for cart-style outputs (.neo, Darksoft).
// Turns the patched per-chip files into the linear Neo Geo regions, applying the
// known cart-layout rules (2MB P meg-swap, C odd/even interleave).
import type { CLayout, GameDef, Region } from '../types';
import type { PatchedFile } from '../patch';

export interface OutputFile {
  filename: string;
  data: Uint8Array;
  mime: string;
}

/** Concatenate byte arrays into one. */
export function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Pad with `fill` up to the next multiple of `multiple` (no-op if already aligned). */
export function padTo(data: Uint8Array, multiple: number, fill = 0xff): Uint8Array {
  const rem = data.length % multiple;
  if (rem === 0) return data;
  const out = new Uint8Array(data.length + (multiple - rem));
  out.set(data);
  out.fill(fill, data.length);
  return out;
}

/** Pad with `fill` (default 0x00) to an exact target size (no-op if already ≥ size). */
export function padToSize(data: Uint8Array, size: number, fill = 0): Uint8Array {
  if (data.length >= size) return data;
  const out = new Uint8Array(size);
  out.set(data);
  if (fill !== 0) out.fill(fill, data.length);
  return out;
}

export interface Regions {
  P: Uint8Array;
  S: Uint8Array;
  M: Uint8Array;
  V1: Uint8Array;
  V2: Uint8Array;
  /** Individual C ROMs, in order (consecutive entries form odd/even pairs). */
  C: Uint8Array[];
}

function filesOfRegion(game: GameDef, byName: Map<string, Uint8Array>, region: Region): Uint8Array[] {
  return game.files
    .filter((f) => f.region === region)
    .sort((a, b) => a.order - b.order)
    .map((f) => {
      const d = byName.get(f.name);
      if (!d) throw new Error(`Missing data for ${f.name} while assembling region ${region}.`);
      return d;
    });
}

/** Assemble the linear regions from a patched set. */
export function assembleRegions(game: GameDef, patched: PatchedFile[]): Regions {
  const byName = new Map(patched.map((p) => [p.name, p.data]));
  let P = concatBytes(filesOfRegion(game, byName, 'P'));
  // Neo Geo addresses 1MB of program at a time; a 2MB program is stored with the
  // upper 1MB bank first (the cart layout the flashcarts expect).
  if (P.length === 0x200000) {
    P = concatBytes([P.subarray(0x100000), P.subarray(0, 0x100000)]);
  }
  return {
    P,
    S: concatBytes(filesOfRegion(game, byName, 'S')),
    M: concatBytes(filesOfRegion(game, byName, 'M')),
    V1: concatBytes(filesOfRegion(game, byName, 'V1')),
    V2: concatBytes(filesOfRegion(game, byName, 'V2')),
    C: filesOfRegion(game, byName, 'C'),
  };
}

/** Interleave two equal-length buffers in `width`-byte chunks: a-chunk, b-chunk, a-chunk… */
function interleaveTwo(a: Uint8Array, b: Uint8Array, width: number): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  let o = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += width) {
    for (let k = 0; k < width; k++) out[o++] = a[i + k];
    for (let k = 0; k < width; k++) out[o++] = b[i + k];
  }
  return out;
}

/** Interleave each consecutive C ROM pair (c1/c2, c3/c4, …) into one buffer per pair. */
function interleavePairs(croms: Uint8Array[], width: number): Uint8Array[] {
  const pairs: Uint8Array[] = [];
  for (let i = 0; i + 1 < croms.length; i += 2) {
    pairs.push(interleaveTwo(croms[i], croms[i + 1], width));
  }
  if (croms.length % 2 === 1) pairs.push(croms[croms.length - 1]); // unpaired (not expected on Neo Geo)
  return pairs;
}

export function assembleC(croms: Uint8Array[], width: number, layout?: CLayout): Uint8Array {
  const pairs = interleavePairs(croms, width);
  if (!layout) return concatBytes(pairs);
  const region = new Uint8Array(layout.regionSize); // unwritten bytes stay 0 = the cart's zero gap
  layout.pairs.forEach((pl, i) => {
    const ip = pairs[i] ?? new Uint8Array(0);
    for (const s of pl.segments) region.set(ip.subarray(s.src, s.src + s.len), s.dst);
  });
  return region;
}
