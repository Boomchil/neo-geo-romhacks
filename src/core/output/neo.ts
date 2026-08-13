// NeoSD ".neo" output: 4096-byte header + P,S,M,V1,V2,C (C interleaved 1-byte).
import type { GameDef } from '../types';
import type { PatchedFile } from '../patch';
import { assembleRegions, assembleC, concatBytes, padTo, type OutputFile } from './regions';

const ALIGN_PSMV = 0x10000; // 64KB for P/S/M/V
const ALIGN_C = 0x40000; // 256KB for C

function writeAscii(buf: Uint8Array, offset: number, fieldLen: number, str: string): void {
  const max = fieldLen - 1;
  for (let i = 0; i < str.length && i < max; i++) {
    buf[offset + i] = str.charCodeAt(i) & 0x7f;
  }
}

export function buildNeoOutput(game: GameDef, patched: PatchedFile[]): OutputFile {
  const r = assembleRegions(game, patched);

  const P = padTo(r.P, ALIGN_PSMV);
  const S = padTo(r.S, ALIGN_PSMV);
  const M = padTo(r.M, ALIGN_PSMV);
  const V1 = padTo(r.V1, ALIGN_PSMV);
  const V2 = padTo(r.V2, ALIGN_PSMV);
  const C = game.cLayout ? assembleC(r.C, 1, game.cLayout) : padTo(assembleC(r.C, 1), ALIGN_C);

  const header = new Uint8Array(4096);
  const dv = new DataView(header.buffer);
  header[0] = 0x4e; // 'N'
  header[1] = 0x45; // 'E'
  header[2] = 0x4f; // 'O'
  header[3] = 1; // version
  dv.setUint32(0x04, P.length, true);
  dv.setUint32(0x08, S.length, true);
  dv.setUint32(0x0c, M.length, true);
  dv.setUint32(0x10, V1.length, true);
  dv.setUint32(0x14, V2.length, true);
  dv.setUint32(0x18, C.length, true);
  dv.setUint32(0x1c, game.year ?? 0, true);
  dv.setUint32(0x20, game.genre ?? 0, true);
  dv.setUint32(0x24, game.screenshot ?? 0, true);
  const ngh = r.P.length > 0x109 ? r.P[0x108] | (r.P[0x109] << 8) : 0;
  dv.setUint32(0x28, ngh, true);
  writeAscii(header, 0x2c, 33, game.name);
  writeAscii(header, 0x4d, 17, game.developer ?? '');

  const data = concatBytes([header, P, S, M, V1, V2, C]);
  return { filename: `${game.id}.neo`, data, mime: 'application/octet-stream' };
}
