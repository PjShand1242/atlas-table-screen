// PUT /api/profile — update display name / avatar. Body: { displayName?, avatarFeatures? }
import { prisma } from "../../lib/db";
import { getUserId } from "../../lib/auth";

export async function PUT(req) {
  const uid = await getUserId();
  if (!uid) return Response.json({ error: "sign in first" }, { status: 401 });
  const { displayName, avatarFeatures } = await req.json();
  const user = await prisma.user.update({
    where: { id: uid },
    data: {
      ...(displayName ? { displayName } : {}),
      ...(avatarFeatures !== undefined ? { avatarFeatures } : {}),
    },
  });
  return Response.json({ ok: true, displayName: user.displayName, avatarFeatures: user.avatarFeatures });
}
