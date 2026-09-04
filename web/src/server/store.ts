import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FriendRequest, GameRoom, PublicUser } from "../shared/types";

export interface StoredUser extends PublicUser {
  email: string;
  passwordHash: string;
  stats: { handsPlayed: number; handsWon: number };
}

export interface Database {
  users: StoredUser[];
  friendRequests: FriendRequest[];
  friendships: Array<{ userA: string; userB: string; createdAt: number }>;
  rooms: GameRoom[];
}

const databasePath = join(process.env.TEXOMAHA_DATA_DIR ?? join(process.cwd(), "data"), "texomaha.json");

export function loadDatabase(): Database {
  if (!existsSync(databasePath)) return { users: [], friendRequests: [], friendships: [], rooms: [] };
  return JSON.parse(readFileSync(databasePath, "utf8")) as Database;
}

export function saveDatabase(database: Database): void {
  mkdirSync(dirname(databasePath), { recursive: true });
  writeFileSync(databasePath, JSON.stringify(database, null, 2));
}

export const database = loadDatabase();

export function persist(): void {
  saveDatabase(database);
}
