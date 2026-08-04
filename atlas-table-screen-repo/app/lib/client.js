// Browser-side helpers the React app calls. These replace the artifact's
// window.storage and direct Anthropic fetches. All hit YOUR backend.

export async function me() {
  const r = await fetch("/api/auth", { method: "GET" });
  return (await r.json()).user;
}
export async function signup(data) {
  const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "signup", ...data }) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || "signup failed"); return j;
}
export async function login(username, password) {
  const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", username, password }) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || "login failed"); return j;
}
export async function logout() { await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) }); }

// Generation now goes through the backend. Same shape the UI already expects.
export async function generate(kind, args) {
  const r = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, ...args }) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || "generation failed"); return j;
}
export async function awardStamp(country, type) {
  const r = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ country, type }) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || "sync failed"); return j.stamps;
}
export async function saveProfile(patch) {
  const r = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  return (await r.json());
}
export async function lookupFriend(username) {
  const r = await fetch("/api/friends?u=" + encodeURIComponent(username));
  const j = await r.json(); if (!r.ok) throw new Error(j.error || "lookup failed"); return j;
}

// Per-country content (recipes/films) is still cached locally so revisiting a
// country is instant and free — it's regenerable, so it doesn't need the DB.
export function loadCache(country) {
  try { return JSON.parse(localStorage.getItem("atlas-cache-" + country) || "{}"); } catch { return {}; }
}
export function saveCache(country, cache) {
  try { localStorage.setItem("atlas-cache-" + country, JSON.stringify(cache)); } catch {}
}
