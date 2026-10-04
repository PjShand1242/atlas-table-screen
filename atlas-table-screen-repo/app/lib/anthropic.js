// Server-only Anthropic wrapper. The API key lives in an env var and never
// reaches the browser. Mirrors the prompts the artifact used, now with web search.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const PROMPTS = {
  foodIdeas: (country, prefs) =>
    `You are a culinary guide for home cooks. Search the web for authentic, well-reviewed recipes, then suggest exactly 4 DIFFERENT home-cookable dishes from ${country}, with variety across regions or meal types.${prefs ? " Cook's preferences: " + prefs + "." : ""} Prefer dishes documented on reputable cooking sites. Respond with ONLY valid JSON, no markdown: {"dishes":[{"dish":"","local_name":"","one_liner":"","time":"","difficulty":"Easy|Medium|Hard"}]}`,
  foodFull: (country, prefs, dish) =>
    `You are a culinary guide for home cooks. Search the web for reputable versions of ${dish} from ${country}, then synthesize ONE reliable home-cook recipe.${prefs ? " Cook's preferences: " + prefs + "." : ""} Base it on the sources; do not copy any single recipe verbatim. Respond with ONLY valid JSON: {"dish":"","local_name":"","region":"","time":"","difficulty":"Easy|Medium|Hard","servings":"","ingredients":[],"steps":[],"context":""}`,
  cinema: (country, prefs) =>
    `You are a world-cinema guide. Search the web for well-reviewed films from ${country}, then recommend from what you find.${prefs ? " Viewer preferences: " + prefs + "." : ""} Respond with ONLY valid JSON: {"films":[{"title":"","year":"","director":"","genre":"","runtime":"","cast":[],"rating":"","why":"","mood":""}],"scene_note":""} Exactly 4 films.`,
  story: (country) =>
    `You are a travel historian. Respond with ONLY valid JSON: {"history":"","table":"","screen":"","facts":[]} about ${country}.`,
  chat: (country, payload) => {
    let ctx = {}; try { ctx = JSON.parse(payload || "{}"); } catch {}
    const role = ctx.domain === "food"
      ? `You are the Kitchen guide for ${country} — a warm, practical cooking companion. Working recipe: ${JSON.stringify(ctx.card)}.`
      : `You are the Cinema guide for ${country} — a knowledgeable, unpretentious film companion. Watchlist: ${JSON.stringify(ctx.card)}.`;
    const transcript = (ctx.messages || []).map(m => (m.role === "user" ? "Traveler: " : "Guide: ") + m.text).join("\n");
    return `${role}\nConversation so far:\n${transcript}\nReply as the Guide in plain conversational text (no JSON), under 150 words, answering the traveler's last message. Respond with ONLY valid JSON: {"reply":"your message"}`;
  },
};

export async function generate(kind, { country, prefs, dish }) {
  const promptMap = {
    foodIdeas: PROMPTS.foodIdeas(country, prefs),
    foodFull: PROMPTS.foodFull(country, prefs, dish),
    cinema: PROMPTS.cinema(country, prefs),
    story: PROMPTS.story(country),
    chat: PROMPTS.chat(country, prefs),
  };
  const prompt = promptMap[kind];
  if (!prompt) throw new Error("unknown kind: " + kind);

  const useSearch = kind !== "story" && kind !== "chat";
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
    ...(useSearch ? { tools: [{ type: "web_search_20250305", name: "web_search" }] } : {}),
  });

  const blocks = msg.content || [];
  const text = blocks.filter(b => b.type === "text").map(b => b.text).join("");
  const sources = [];
  const seen = new Set();
  for (const b of blocks) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content))
      for (const r of b.content) {
        if (r.url && !seen.has(r.url)) { seen.add(r.url); let host = r.url; try { host = new URL(r.url).hostname.replace(/^www\./, ""); } catch {} sources.push({ url: r.url, host }); }
      }
  }
  const parsed = extractJSON(text);
  if (!parsed) throw new Error("no valid JSON in model reply");
  parsed.__sources = sources.slice(0, 6);
  return parsed;
}

// Robustly pull a JSON object out of the model's reply. Handles prose around it,
// code fences, and (critically) a response truncated mid-object by closing any
// still-open brackets/strings so JSON.parse succeeds.
function extractJSON(text) {
  if (!text) return null;
  // strip code fences if present
  let t = text.replace(/```json/gi, "").replace(/```/g, "");
  const start = t.indexOf("{");
  if (start === -1) return null;
  t = t.slice(start);

  // First try: find the matching close brace for a complete object.
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end !== -1) {
    try { return JSON.parse(t.slice(0, end + 1)); } catch {}
  }

  // Fallback: response was likely truncated. Close open string, then close any
  // open arrays/objects in the right order, and parse the repaired fragment.
  let repaired = t;
  // balance quotes
  const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) repaired += '"';
  // walk and record the open-bracket stack
  const stack = [];
  inStr = false; esc = false;
  for (let i = 0; i < repaired.length; i++) {
    const c = repaired[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") stack.pop();
  }
  // drop a dangling trailing comma before closing
  repaired = repaired.replace(/,\s*$/, "");
  while (stack.length) repaired += stack.pop();
  try { return JSON.parse(repaired); } catch {}
  return null;
}
