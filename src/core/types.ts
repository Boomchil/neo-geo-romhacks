export type Region = 'P' | 'S' | 'M' | 'V1' | 'V2' | 'C';

export interface RomFileDef {
  name: string;
  crc32: string;
  size: number;
  region: Region;
  order: number;
}

export interface GameDef {
  id: string;
  name: string;
  logo?: string;
  parent: string | null;
  logoZoom?: number;
  comingSoon?: boolean;
  comingLater?: boolean;
  description?: string;
  notes?: string;
  baseDir?: string;
  year?: number;
  genre?: number;
  developer?: string;
  screenshot?: number;
  adpcmaSize?: number;
  cLayout?: CLayout;
  files: RomFileDef[];
}

export interface CSegment {
  src: number;
  dst: number;
  len: number;
}

export interface CLayout {
  regionSize: number;
  pairs: { segments: CSegment[] }[];
}

export interface PatchFileDef {
  rom: string;
  ips: string;
  sourceCRC: string;
  targetCRC?: string;
}

export interface PatchVariant {
  id: string;
  label: string;
  files?: PatchFileDef[];
  description?: string;
}

export interface PatchDef {
  id: string;
  name?: string;
  game: string;
  author?: string;
  version: string;
  summary?: string;
  issuesUrl?: string;
  files: PatchFileDef[];
  variants?: PatchVariant[];
}

export interface PatchIndexEntry extends PatchDef {
  description: string;
  notes?: string;
  baseDir: string;
}

export interface PatchIndex {
  generatedAt: string;
  games: Record<string, GameDef>;
  patches: PatchIndexEntry[];
}

export type OutputFormat = 'mame' | 'darksoft' | 'neo';
