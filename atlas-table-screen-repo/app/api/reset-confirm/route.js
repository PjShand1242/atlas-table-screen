// POST /api/reset-confirm — { token, password }
// Verifies the one-time token, sets the new password, marks token used.
import { prisma } from "../../lib/db";
import { hashResetToken, hashPassword } from "../../lib/auth";

export async function POST(req) {
  try {
    const { token, password } = await req.json();
    if (!token || !password || password.length < 6)
      return Response.json({ error: "Password must be at least 6 characters." }, { status: 400 });

    const rec = await prisma.passwordReset.findUnique({ where: { tokenHash: hashResetToken(token) } });
    if (!rec || rec.usedAt || rec.expiresAt < new Date())
      return Response.json({ error: "This reset link is invalid or has expired. Request a new one." }, { status: 400 });

    await prisma.user.update({ where: { id: rec.userId }, data: { passwordHash: await hashPassword(password) } });
    await prisma.passwordReset.update({ where: { id: rec.id }, data: { usedAt: new Date() } });
    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Something went wrong. Try requesting a new link." }, { status: 500 });
  }
}
