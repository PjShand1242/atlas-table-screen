// GET /api/friends?u=<username> — public lookup of a friend's stamps.
// Anyone signed in can view any username's earned stamps (public passport).
import { prisma } from "../../lib/db";
import { getUserId } from "../../lib/auth";

export async function GET(req) {
  const uid = await getUserId();
  if (!uid) return Response.json({ error: "sign in first" }, { status: 401 });
  const u = new URL(req.url).searchParams.get("u") || "";
  if (u.trim().length < 2) return Response.json({ error: "type a username" }, { status: 400 });

  // exact match first, then prefix matches for a small suggestion list
  const exact = await prisma.user.findUnique({
    where: { usernameLower: u.toLowerCase() },
    include: { stamps: true },
  });
  if (exact) {
    return Response.json({ user: {
      username: exact.username, displayName: exact.displayName,
      avatarFeatures: exact.avatarFeatures,
      stamps: exact.stamps.map(s => ({ country: s.country, type: s.type })),
    }});
  }
  const matches = await prisma.user.findMany({
    where: { usernameLower: { startsWith: u.toLowerCase() } },
    take: 6, select: { username: true, displayName: true },
  });
  return Response.json({ user: null, suggestions: matches });
}
