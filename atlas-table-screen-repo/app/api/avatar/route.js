// POST /api/avatar — reads an uploaded photo server-side and maps it to avatar
// features. Body: { image (base64), mediaType, prompt }. Key stays private.
import Anthropic from "@anthropic-ai/sdk";
import { getUserId } from "../../lib/auth";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req) {
  const uid = await getUserId();
  if (!uid) return Response.json({ error: "sign in first" }, { status: 401 });
  try {
    const { image, mediaType, prompt } = await req.json();
    if (!image || !prompt) return Response.json({ error: "missing image/prompt" }, { status: 400 });
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: image } },
        { type: "text", text: prompt },
      ] }],
    });
    const text = (msg.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    return Response.json({ text });
  } catch (e) { console.error(e); return Response.json({ error: "avatar read failed" }, { status: 500 }); }
}
