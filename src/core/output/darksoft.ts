import type { GameDef, Region } from '../types';
import type { PatchedFile } from '../patch';
import { assembleRegions, assembleC, concatBytes, padToSize, type OutputFile } from './regions';
import { buildZip } from '../zip';

export function buildDarksoftOutput(
  game: GameDef,
  patched: PatchedFile[],
  changedRoms: string[],
): OutputFile {
  const changed = new Set<Region>(
    game.files.filter((f) => changedRoms.includes(f.name)).map((f) => f.region),
  );
  const touches = (...regs: Region[]) => regs.some((r) => changed.has(r));

  const r = assembleRegions(game, patched);
  const files: { name: string; data: Uint8Array }[] = [];
  const add = (name: string, data: Uint8Array) => files.push({ name: `${game.id}/${name}`, data });

  if (touches('P')) add('prom', r.P);
  if (touches('S')) add('srom', r.S);
  if (touches('M')) add('m1rom', r.M);
  if (touches('V1', 'V2')) {
    // vroma0 = ADPCM-A (V1) zero-padded to its cart region size, then ADPCM-B (V2).
    // Note: some sets store a mirrored V layout instead; this rebuilds the simple zero-padded form.
    const v1 = padToSize(r.V1, game.adpcmaSize ?? r.V1.length);
    add('vroma0', concatBytes([v1, r.V2]));
  }
  if (touches('C')) {
    // Same layout as .neo (bank splits/gaps are physical to the cart); Darksoft just interleaves 2-byte.
    add('crom0', assembleC(r.C, 2, game.cLayout));
  }

  return { filename: `${game.id}-darksoft.zip`, data: buildZip(files), mime: 'application/zip' };
}
