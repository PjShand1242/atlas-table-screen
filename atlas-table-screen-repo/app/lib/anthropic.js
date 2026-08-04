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
    max_tokens: 1500,
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
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON in model reply");
  const parsed = JSON.parse(m[0]);
  parsed.__sources = sources.slice(0, 6);
  return parsed;
}
