// POST /api/reset-request — { identifier }  (username OR email)
// Always returns ok (so we don't reveal whether an account exists). If a match
// with an email is found, emails a one-time reset link.
import { prisma } from "../../lib/db";
import { makeResetToken } from "../../lib/auth";
import { sendResetEmail } from "../../lib/email";

export async function POST(req) {
  try {
    const { identifier } = await req.json();
    const id = (identifier || "").trim().toLowerCase();
    if (!id) return Response.json({ ok: true }); // say nothing

    const user = await prisma.user.findFirst({
      where: { OR: [{ usernameLower: id }, { emailLower: id }] },
    });

    // Only proceed if we found a user AND they have an email on file.
    if (user && user.email) {
      const { raw, hash } = makeResetToken();
      await prisma.passwordReset.create({
        data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      });
      const base = process.env.APP_URL || new URL(req.url).origin;
      const link = `${base}/reset?token=${raw}`;
      try { await sendResetEmail(user.email, link); }
      catch (e) { console.error("reset email failed", e); }
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: true }); // still say nothing on error
  }
}
