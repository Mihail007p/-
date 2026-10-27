import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const generatedId = () => globalThis.crypto.randomUUID();

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(generatedId),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey().$defaultFn(() => `${generatedId()}${generatedId()}`),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const games = pgTable("games", {
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
  isFavorite: boolean("is_favorite").notNull().default(false),
  playCount: integer("play_count").notNull().default(0),
  lastPlayedAt: timestamp("last_played_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
