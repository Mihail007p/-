export type SystemDef = {
  id: string;
  label: string;
  shortLabel: string;
  core: string;
  extensions: string[];
  emoji: string;
};

export const SYSTEMS: SystemDef[] = [
  { id: "nes", label: "Nintendo (NES / Famicom)", shortLabel: "NES", core: "nes", extensions: [".nes", ".fds", ".unif", ".zip"], emoji: "🕹️" },
  { id: "snes", label: "Super Nintendo (SNES)", shortLabel: "SNES", core: "snes", extensions: [".smc", ".sfc", ".fig", ".zip"], emoji: "🎮" },
  { id: "gb", label: "Game Boy", shortLabel: "GB", core: "gb", extensions: [".gb", ".zip"], emoji: "🎒" },
  { id: "gbc", label: "Game Boy Color", shortLabel: "GBC", core: "gb", extensions: [".gbc", ".zip"], emoji: "🎒" },
  { id: "gba", label: "Game Boy Advance", shortLabel: "GBA", core: "gba", extensions: [".gba", ".zip"], emoji: "📱" },
  { id: "n64", label: "Nintendo 64", shortLabel: "N64", core: "n64", extensions: [".n64", ".z64", ".v64", ".zip"], emoji: "🎲" },
  { id: "nds", label: "Nintendo DS", shortLabel: "NDS", core: "nds", extensions: [".nds", ".zip"], emoji: "📲" },
  { id: "segaMD", label: "Sega Genesis / Mega Drive", shortLabel: "Genesis", core: "segaMD", extensions: [".md", ".gen", ".smd", ".bin", ".zip"], emoji: "🌀" },
  { id: "segaGG", label: "Sega Game Gear", shortLabel: "GameGear", core: "segaGG", extensions: [".gg", ".zip"], emoji: "🔷" },
  { id: "segaMS", label: "Sega Master System", shortLabel: "SMS", core: "segaMS", extensions: [".sms", ".zip"], emoji: "🟦" },
  { id: "psx", label: "PlayStation (PS1)", shortLabel: "PS1", core: "psx", extensions: [".cue", ".bin", ".iso", ".pbp", ".chd", ".zip", ".m3u"], emoji: "💿" },
  { id: "atari2600", label: "Atari 2600", shortLabel: "Atari", core: "atari2600", extensions: [".a26", ".bin", ".zip"], emoji: "👾" },
  { id: "arcade", label: "Arcade (MAME/FBNeo)", shortLabel: "Arcade", core: "arcade", extensions: [".zip"], emoji: "🏟️" },
];

export const SYSTEM_MAP = new Map(SYSTEMS.map((s) => [s.id, s]));

export function getSystem(id: string): SystemDef | undefined {
  return SYSTEM_MAP.get(id);
}

export const MAX_ROM_SIZE_BYTES = 500 * 1024 * 1024; // 500MB
export const MAX_COVER_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
export const MAX_GAME_TITLE_LENGTH = 120;
export const MAX_ROM_FILENAME_LENGTH = 255;

export function isValidRomFilename(filename: string): boolean {
  return filename.length > 0 && filename.length <= MAX_ROM_FILENAME_LENGTH && !/[\\/\u0000-\u001f\u007f]/.test(filename);
}

export function isValidCoverFilename(filename: string): boolean {
  return filename.length > 0 && filename.length <= MAX_ROM_FILENAME_LENGTH && !/[\\/\u0000-\u001f\u007f]/.test(filename);
}

export function isExtensionAllowed(filename: string, system: SystemDef): boolean {
  const lower = filename.toLowerCase();
  return system.extensions.some((ext) => lower.endsWith(ext));
}
