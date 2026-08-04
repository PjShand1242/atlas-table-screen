// Minimal cookie-session auth using a signed JWT (jose) + bcrypt password hashing.
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

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
