import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { database, persist, type StoredUser } from "./store";

const jwtSecret = process.env.TEXOMAHA_JWT_SECRET ?? "";

if (process.env.NODE_ENV === "production" && jwtSecret.length < 32) {
  throw new Error("Set TEXOMAHA_JWT_SECRET to a random value of at least 32 characters before starting production.");
}

export function signToken(userId: string): string {
  return jwt.sign({ userId }, jwtSecret || "dev-only-change-me", { expiresIn: "30d" });
}

export function requireUserFromHeader(header?: string): StoredUser {
  const token = header?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Authentication required.");
  const payload = jwt.verify(token, jwtSecret || "dev-only-change-me") as { userId: string };
  const user = database.users.find((candidate) => candidate.id === payload.userId);
  if (!user) throw new Error("Authentication required.");
  return user;
}

export function userFromToken(token?: string): StoredUser | null {
  try {
    if (!token) return null;
    const payload = jwt.verify(token, jwtSecret || "dev-only-change-me") as { userId: string };
    return database.users.find((candidate) => candidate.id === payload.userId) ?? null;
  } catch {
    return null;
  }
}

export async function register(email: string, username: string, password: string): Promise<{ user: StoredUser; token: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedUsername = username.trim();
  if (!normalizedEmail || !normalizedUsername || password.length < 8) throw new Error("Use an email, username, and password of at least 8 characters.");
  if (database.users.some((user) => user.email === normalizedEmail)) throw new Error("Email is already registered.");
  if (database.users.some((user) => user.username.toLowerCase() === normalizedUsername.toLowerCase())) throw new Error("Username is already taken.");
  const user: StoredUser = {
    id: uuid(),
    email: normalizedEmail,
    username: normalizedUsername,
    avatar: normalizedUsername.slice(0, 2).toUpperCase(),
    status: "online",
    passwordHash: await bcrypt.hash(password, 12),
    stats: { handsPlayed: 0, handsWon: 0 }
  };
  database.users.push(user);
  persist();
  return { user, token: signToken(user.id) };
}

export async function login(email: string, password: string): Promise<{ user: StoredUser; token: string }> {
  const user = database.users.find((candidate) => candidate.email === email.trim().toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new Error("Invalid email or password.");
  user.status = "online";
  persist();
  return { user, token: signToken(user.id) };
}

export function publicUser(user: StoredUser) {
  return { id: user.id, username: user.username, avatar: user.avatar, status: user.status, stats: user.stats };
}
