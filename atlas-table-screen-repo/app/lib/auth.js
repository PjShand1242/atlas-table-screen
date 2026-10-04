// Minimal cookie-session auth using a signed JWT (jose) + bcrypt password hashing.
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import crypto from "crypto";

const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || "dev-only-change-me");
const COOKIE = "atlas_session";

export async function hashPassword(pw) { return bcrypt.hash(pw, 10); }
export async function verifyPassword(pw, hash) { return bcrypt.compare(pw, hash); }

export async function createSession(userId) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession() { (await cookies()).delete(COOKIE); }

export async function getUserId() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try { const { payload } = await jwtVerify(token, secret()); return payload.uid; }
  catch { return null; }
}

// ---- password reset tokens ----
// We hand the user a random raw token in the email link, but store only its
// SHA-256 hash. Even someone reading the database can't reuse a reset link.
export function makeResetToken() {
  const raw = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}
export function hashResetToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
