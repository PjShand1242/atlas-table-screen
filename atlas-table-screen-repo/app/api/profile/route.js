// PUT /api/profile — update display name / avatar / email / password.
// Body: { displayName?, avatarFeatures?, email?, currentPassword?, newPassword? }
import { prisma } from "../../lib/db";
import { getUserId, verifyPassword, hashPassword } from "../../lib/auth";

export async function PUT(req) {
  const uid = await getUserId();
  if (!uid) return Response.json({ error: "sign in first" }, { status: 401 });
  const body = await req.json();
  const { displayName, avatarFeatures, email, currentPassword, newPassword } = body;

  const data = {};
  if (displayName) data.displayName = displayName;
  if (avatarFeatures !== undefined) data.avatarFeatures = avatarFeatures;

  // Email change — validate and ensure it's not taken by someone else
  if (email !== undefined) {
    const emailClean = (email || "").trim();
    if (emailClean && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailClean))
      return Response.json({ error: "Enter a valid email." }, { status: 400 });
    if (emailClean) {
      const taken = await prisma.user.findFirst({
        where: { emailLower: emailClean.toLowerCase(), NOT: { id: uid } },
      });
      if (taken) return Response.json({ error: "That email is already in use." }, { status: 409 });
      data.email = emailClean;
      data.emailLower = emailClean.toLowerCase();
    }
  }

  // Password change — require the current password to confirm identity
  if (newPassword) {
    if (newPassword.length < 6)
      return Response.json({ error: "New password must be at least 6 characters." }, { status: 400 });
    const me = await prisma.user.findUnique({ where: { id: uid } });
    if (!me || !(await verifyPassword(currentPassword || "", me.passwordHash)))
      return Response.json({ error: "Current password is incorrect." }, { status: 403 });
    data.passwordHash = await hashPassword(newPassword);
  }

  if (Object.keys(data).length === 0)
    return Response.json({ error: "Nothing to update." }, { status: 400 });

  const user = await prisma.user.update({ where: { id: uid }, data });
  return Response.json({
    ok: true,
    displayName: user.displayName,
    avatarFeatures: user.avatarFeatures,
    email: user.email,
  });
}
