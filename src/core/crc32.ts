// CRC32 (IEEE 802.3), table-based implementation. No dependencies.

const TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC32 of a buffer, returned as an unsigned integer. */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** CRC32 as lowercase 8-character hexadecimal (MAME format). */
export function crc32hex(data: Uint8Array): string {
  return crc32(data).toString(16).padStart(8, '0');
}

/** Normalizes a CRC string for comparison (lowercase, 8 digits). */
export function normalizeCrc(crc: string): string {
  return crc.trim().toLowerCase().padStart(8, '0');
}
