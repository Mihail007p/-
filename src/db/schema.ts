import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const generatedId = () => globalThis.crypto.randomUUID();

export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(generatedId),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey().$defaultFn(() => `${generatedId()}${generatedId()}`),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

export const games = sqliteTable("games", {
  id: text("id").primaryKey().$defaultFn(generatedId),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  system: text("system").notNull(),
  romFilename: text("rom_filename").notNull(),
  romStoragePath: text("rom_storage_path").notNull(),
  romSizeBytes: integer("rom_size_bytes").notNull().default(0),
  coverStoragePath: text("cover_storage_path"),
  coverFilename: text("cover_filename"),
  isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
  playCount: integer("play_count").notNull().default(0),
  lastPlayedAt: integer("last_played_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
