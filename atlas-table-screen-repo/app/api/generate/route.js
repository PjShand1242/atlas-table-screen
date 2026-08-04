// POST /api/generate — the browser calls THIS instead of Anthropic directly.
// The key stays server-side. Body: { kind, country, prefs?, dish? }
import { generate } from "../../lib/anthropic";
import { getUserId } from "../../lib/auth";

export async function POST(req) {
  const uid = await getUserId();
  if (!uid) return Response.json({ error: "sign in first" }, { status: 401 });
  try {
    const { kind, country, prefs, dish } = await req.json();
    if (!kind || !country) return Response.json({ error: "missing kind/country" }, { status: 400 });
    const data = await generate(kind, { country, prefs, dish });
    return Response.json(data);
  } catch (e) {
    console.error(e);
    return Response.json({ error: "generation failed" }, { status: 500 });
  }
}
