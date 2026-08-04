// POST /api/sync — award a stamp when the user confirms cooked/watched.
// Body: { country, type }  (idempotent: unique constraint prevents duplicates)
import { prisma } from "../../lib/db";
import { getUserId } from "../../lib/auth";

export async function POST(req) {
  const uid = await getUserId();
  if (!uid) return Response.json({ error: "sign in first" }, { status: 401 });
  const { country, type } = await req.json();
  if (!country || !["food", "cinema"].includes(type))
    return Response.json({ error: "bad stamp" }, { status: 400 });
  try {
    await prisma.stamp.upsert({
      where: { userId_country_type: { userId: uid, country, type } },
      create: { userId: uid, country, type },
      update: {},
    });
  } catch (e) { console.error(e); return Response.json({ error: "sync failed" }, { status: 500 }); }
  const stamps = await prisma.stamp.findMany({ where: { userId: uid } });
  return Response.json({ stamps: stamps.map(s => ({ country: s.country, type: s.type })) });
}
