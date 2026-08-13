// Reading and applying IPS patches. No dependencies.
// Format: "PATCH" | (offset[3] size[2] data[size])* | RLE when size==0 (run[2] byte[1]) | "EOF" | [truncate[3]]

export interface IpsRecord {
  offset: number;
  /** RLE: fills `run` bytes with `value`. Otherwise: writes `data`. */
  rle: boolean;
  run?: number;
  value?: number;
  data?: Uint8Array;
}

export interface IpsPatch {
  records: IpsRecord[];
  /** Final truncation length (IPS extension), or null. */
  truncate: number | null;
}

const MAGIC = [0x50, 0x41, 0x54, 0x43, 0x48]; // "PATCH"
const EOF = [0x45, 0x4f, 0x46]; // "EOF"

function readBE(data: Uint8Array, pos: number, bytes: number): number {
  let v = 0;
  for (let i = 0; i < bytes; i++) v = v * 256 + data[pos + i];
  return v;
}

function matches(data: Uint8Array, pos: number, sig: number[]): boolean {
  if (pos + sig.length > data.length) return false;
  for (let i = 0; i < sig.length; i++) if (data[pos + i] !== sig[i]) return false;
  return true;
}

export function parseIps(data: Uint8Array): IpsPatch {
  if (!matches(data, 0, MAGIC)) {
    throw new Error('Invalid IPS file (missing "PATCH" header).');
  }
  const records: IpsRecord[] = [];
  let truncate: number | null = null;
  let p = MAGIC.length;

  while (p < data.length) {
    if (matches(data, p, EOF)) {
      const rest = data.length - (p + EOF.length);
      if (rest === 0) {
        p += EOF.length;
        break;
      }
      if (rest === 3) {
        p += EOF.length;
        truncate = readBE(data, p, 3);
        p += 3;
        break;
      }
      // "EOF" encountered mid-stream: treat it as offset 0x454F46 (rare but legal).
    }
    if (p + 5 > data.length) {
      throw new Error('Truncated IPS file (incomplete record header).');
    }
    const offset = readBE(data, p, 3);
    p += 3;
    const size = readBE(data, p, 2);
    p += 2;
    if (size === 0) {
      if (p + 3 > data.length) throw new Error('Truncated IPS file (incomplete RLE record).');
      const run = readBE(data, p, 2);
      p += 2;
      const value = data[p];
      p += 1;
      records.push({ offset, rle: true, run, value });
    } else {
      if (p + size > data.length) throw new Error('Truncated IPS file (incomplete record data).');
      records.push({ offset, rle: false, data: data.slice(p, p + size) });
      p += size;
    }
  }

  return { records, truncate };
}

/** Minimum file size this patch can produce (largest offset written). */
export function ipsMaxEnd(patch: IpsPatch): number {
  let max = 0;
  for (const r of patch.records) {
    const len = r.rle ? r.run! : r.data!.length;
    max = Math.max(max, r.offset + len);
  }
  return max;
}

/** Applies the patch to a copy of `base` and returns the result. */
export function applyIps(base: Uint8Array, patch: IpsPatch): Uint8Array {
  const needed = Math.max(base.length, ipsMaxEnd(patch));
  let out = new Uint8Array(needed);
  out.set(base);

  for (const r of patch.records) {
    if (r.rle) {
      out.fill(r.value!, r.offset, r.offset + r.run!);
    } else {
      out.set(r.data!, r.offset);
    }
  }

  if (patch.truncate != null && patch.truncate < out.length) {
    out = out.slice(0, patch.truncate);
  }
  return out;
}
