// POST /api/auth — { action: "signup"|"login"|"logout", username, password, displayName?, avatarFeatures? }
import { prisma } from "../../lib/db";
import { hashPassword, verifyPassword, createSession, clearSession, getUserId } from "../../lib/auth";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export async function POST(req) {
  const body = await req.json();
  const { action } = body;

  if (action === "logout") { await clearSession(); return Response.json({ ok: true }); }

  if (action === "signup") {
    const { username, password, displayName, avatarFeatures } = body;
    if (!USERNAME_RE.test(username || "")) return Response.json({ error: "Username must be 3-20 letters, numbers, or underscore." }, { status: 400 });
    if (!password || password.length < 6) return Response.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    const exists = await prisma.user.findUnique({ where: { usernameLower: username.toLowerCase() } });
    if (exists) return Response.json({ error: "That username is taken." }, { status: 409 });
    const user = await prisma.user.create({
      data: {
        username, usernameLower: username.toLowerCase(),
        passwordHash: await hashPassword(password),
        displayName: displayName || username,
        avatarFeatures: avatarFeatures || null,
      },
    });
    await createSession(user.id);
    return Response.json({ ok: true, username: user.username, displayName: user.displayName, avatarFeatures: user.avatarFeatures });
  }

  if (action === "login") {
    const { username, password } = body;
    const user = await prisma.user.findUnique({ where: { usernameLower: (username || "").toLowerCase() } });
    if (!user || !(await verifyPassword(password || "", user.passwordHash)))
      return Response.json({ error: "Wrong username or password." }, { status: 401 });
    await createSession(user.id);
    return Response.json({ ok: true, username: user.username, displayName: user.displayName, avatarFeatures: user.avatarFeatures });
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}

// GET /api/auth — who am I? (used on app load)
export async function GET() {
  const uid = await getUserId();
  if (!uid) return Response.json({ user: null });
  const user = await prisma.user.findUnique({
    where: { id: uid },
    include: { stamps: true },
  });
  if (!user) return Response.json({ user: null });
  return Response.json({ user: {
    username: user.username, displayName: user.displayName,
    avatarFeatures: user.avatarFeatures,
    stamps: user.stamps.map(s => ({ country: s.country, type: s.type })),
  }});
}
