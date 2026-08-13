import type { GameDef } from '../types';
import type { PatchedFile } from '../patch';
import { buildZip } from '../zip';
import type { OutputFile } from './regions';

export function buildMameOutput(game: GameDef, files: PatchedFile[]): OutputFile {
  const data = buildZip(files.map((f) => ({ name: f.name, data: f.data })));
  return { filename: `${game.id}.zip`, data, mime: 'application/zip' };
}
