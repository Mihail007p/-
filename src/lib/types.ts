export type ClientGame = {
  id: string;
  title: string;
  system: string;
  romFilename: string;
  romSizeBytes: number;
  hasCover: boolean;
  isFavorite: boolean;
  playCount: number;
  lastPlayedAt: string | null;
  createdAt: string;
};
