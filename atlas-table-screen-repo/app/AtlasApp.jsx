"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { me, signup, login, logout, requestReset, generate as apiGenerate,
         awardStamp, saveProfile, updateAccount, lookupFriend, loadCache, saveCache } from "./lib/client";
import * as AvatarLib from "./lib/avatar";

// Follow-up chat helper: posts the running transcript to the backend generate proxy.
// The server understands kind:"chat" (add a matching branch in app/lib/anthropic.js
// if you want live chat; until then this surfaces a friendly message).
async function apiChat(domain, country, card, messages) {
  try {
    const data = await apiGenerate("chat", { country, prefs: JSON.stringify({ domain, card, messages }) });
    return (data && data.reply) ? String(data.reply) : "The guide is resting — ask again shortly.";
  } catch {
    return "The guide is resting — ask again shortly.";
  }
}

/* ============================================================
   ATLAS OF TABLE & SCREEN — v3
   Real cartography: Natural Earth country shapes, projected and
   baked in. World map with clickable continents; continent maps
   with real borders and tappable countries. Everything else from
   v2 carries over: photo avatars, split follow-up chats, IMDb-
   style film cards, stamp-based unlock progression.
   ============================================================ */

// MAPDATA is now fetched from /data/mapdata.json at runtime (see App()).
let MAPDATA = null;

const C = {
  ink: "#0C141F",
  panel: "#152136",
  panelHi: "#1D2C47",
  line: "#2A3B58",
  paper: "#EDE4D0",
  dim: "#8FA0B8",
  brass: "#DCA843",
  chili: "#E4573F",
  reel: "#52B8CB",
  leaf: "#7BA05B",
};

const CONT_COLORS = {
  africa: "#7FA05B",
  europe: "#5E86B0",
  asia: "#C2924C",
  namerica: "#A8604F",
  samerica: "#4F9E8C",
  oceania: "#8A6FA8",
};

const AVATARS = ["🧑‍🍳","🎬","🧭","🍜","🎥","🌶️","🍿","🥘","🎞️","🍋","🔪","🌍","🍕","🎭","🗺️","🍣","📽️","🧄","🥟","🌮","🎟️","🍲","🛩️","🐙"];

const STARTER_UNLOCKED = 4;
const STAMPS_PER_UNLOCK = 1;

const CONTINENTS = [
  { id: "africa", name: "Africa", label: [498, 298] },
  { id: "europe", name: "Europe", label: [500, 138] },
  { id: "asia", name: "Asia", label: [672, 188] },
  { id: "namerica", name: "North America", label: [218, 152] },
  { id: "samerica", name: "South America", label: [305, 345] },
  { id: "oceania", name: "Oceania", label: [838, 365] },
];
const orderOf = ct => MAPDATA.continents[ct.id].order;
function allCountries() { return MAPDATA ? Object.keys(MAPDATA.cc) : []; }


function flagOf(name) {
  const cc = MAPDATA.cc[name];
  if (!cc) return "🏳️";
  return [...cc.toUpperCase()].map(ch => String.fromCodePoint(0x1F1E6 + ch.charCodeAt(0) - 65)).join("");
}
// ALL_COUNTRIES computed lazily via allCountries() since MAPDATA loads at runtime

/* ---------- progression ---------- */
function stampsInContinent(stamps, continent) {
  return stamps.filter(s => orderOf(continent).includes(s.country)).length;
}
function unlockedCount(stamps, continent) {
  return Math.min(orderOf(continent).length,
    STARTER_UNLOCKED + Math.floor(stampsInContinent(stamps, continent) / STAMPS_PER_UNLOCK));
}
function isUnlocked(stamps, continent, countryName) {
  const idx = orderOf(continent).indexOf(countryName);
  return idx > -1 && idx < unlockedCount(stamps, continent);
}
function continentOf(countryName) {
  return CONTINENTS.find(ct => orderOf(ct).includes(countryName));
}

/* ---------- backend-backed helpers ----------
   Content generation, auth, stamps, and profile now go through the backend
   (see ./lib/client). loadCache/saveCache are imported from there too. */
async function callClaudeJSON(prompt) {
  // kept for the follow-up chat only; routed through the backend generate proxy
  // via a lightweight "chat" kind is not defined server-side, so chat uses apiChat below.
  throw new Error("callClaudeJSON is not used in the deployed build");
}

function chatPrompt(domain, country, card, messages) {
  const role = domain === "food"
    ? `You are the Kitchen guide for ${country} — a warm, practical cooking companion. The traveler is working from this recipe: ${JSON.stringify(card)}.`
    : `You are the Cinema guide for ${country} — a knowledgeable, unpretentious film companion. The traveler has this watchlist: ${JSON.stringify(card)}.`;
  const transcript = messages.map(m => (m.role === "user" ? "Traveler: " : "Guide: ") + m.text).join("\n");
  return `${role}\nConversation so far:\n${transcript}\nReply as the Guide in plain conversational text (no JSON, no markdown headers), under 150 words. Answer the traveler's last message directly.`;
}

/* ---------- avatar digitizer ---------- */
/* ---------- Genmoji-style avatar: Claude vision reads the photo, Avataaars draws it ---------- */
// avatar engine now imported from ./lib/avatar
/*! Bundled license information:

@dicebear/core/lib/index.js:
  (*!
   * DiceBear (@dicebear/core)
   *
   * Code licensed under MIT (https://github.com/dicebear/dicebear/blob/main/LICENSE)
   * Copyright (c) 2024 Florian Körner
   *)

@dicebear/initials/lib/index.js:
  (*!
   * DiceBear Initials (@dicebear/initials)
   *
   * Code licensed under MIT (https://github.com/dicebear/dicebear/blob/v4/packages/initials/LICENSE)
   * Copyright (c) 2024 Florian Körner
   *)
*/

const buildAvatarSVG = f => AvatarLib.buildAvatarSVG(f);
const SKIN = AvatarLib.SKIN_HEX.map(h => "#" + h);
const HAIR = Object.fromEntries(Object.entries(AvatarLib.HAIR_HEX).map(([k, v]) => [k, "#" + v]));
const BGS = AvatarLib.BG_HEX.map(h => "#" + h);
const SHIRTS = AvatarLib.SHIRT_HEX.map(h => "#" + h);

async function callClaudeVision(b64, mediaType, prompt) {
  // Photo->emoji reads a photo, so it must run server-side (key stays private).
  // Optional: add app/api/avatar/route.js to enable it. Until then, this fails
  // gracefully and the "Build it myself" emoji studio remains available.
  const r = await fetch("/api/avatar", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: b64, mediaType, prompt }),
  });
  if (!r.ok) throw new Error("Photo avatar isn't enabled — use Build it myself.");
  const data = await r.json();
  if (!data.text || !data.text.trim()) throw new Error("Couldn't read that photo — try Build it myself.");
  return data.text;
}

const FEATURE_PROMPT = `The user uploaded their own photo to generate their own cartoon avatar, with their consent. Do not identify who they are — only map their visible appearance to these avatar parameters. Respond with ONLY valid JSON, no markdown, no preamble: {"skin":1-6 (1 lightest, 6 deepest),"hair_style":"bald|buzz|short|side_part|curly|wavy|long|bun|afro|dreads|big_hair|bob","hair_color":"black|dark_brown|brown|light_brown|blonde|red|gray|white","facial_hair":"none|stubble|mustache|goatee|beard","glasses":"none|round|rect","brows":"thin|thick","eyes":"round|narrow","smile":"soft|big"}`;

function digitizePhoto(file, done, fail) {
  try {
    const reader = new FileReader();
    reader.onerror = () => fail("Couldn't read that photo.");
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => fail("That doesn't look like an image file.");
      img.onload = async () => {
        try {
          // shrink hard before sending — the API proxy 500s on heavy payloads
          const s = Math.min(img.width, img.height);
          const toB64 = (size, q) => {
            const c = document.createElement("canvas");
            c.width = size; c.height = size;
            c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
            return c.toDataURL("image/jpeg", q).split(",")[1];
          };
          let features = null, lastErr = null;
          for (const [size, q] of [[224, 0.6], [140, 0.5]]) {
            try {
              const text = await callClaudeVision(toB64(size, q), "image/jpeg", FEATURE_PROMPT);
              const m = text.match(/\{[\s\S]*\}/);
              if (!m) throw new Error("no JSON in reply: " + text.slice(0, 100));
              features = JSON.parse(m[0]);
              break;
            } catch (e) { lastErr = e; }
          }
          if (!features) throw lastErr || new Error("unknown");
          const clean = { ...DEFAULT_FEATURES };
          for (const k of Object.keys(DEFAULT_FEATURES)) if (features[k]) clean[k] = features[k];
          done({ url: featuresToUrl(clean), features: clean });
        } catch (e) {
          console.error(e);
          fail("Couldn't sketch — " + String(e && e.message ? e.message : e).slice(0, 130));
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  } catch { fail("Couldn't process that photo."); }
}


const DEFAULT_FEATURES = { skin: 2, hair_style: "short", hair_color: "dark_brown", facial_hair: "none", glasses: "none", brows: "thin", eyes: "round", smile: "big", bubble: 1, shirt: 1 };
function featuresToUrl(f) { return "data:image/svg+xml;utf8," + encodeURIComponent(buildAvatarSVG(f)); }

function EmojiBuilder({ initial, onDone, onCancel }) {
  const [f, setF] = useState({ ...DEFAULT_FEATURES, ...(initial || {}) });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const OPT = {
    hair_style: ["bald","buzz","short","side_part","curly","wavy","long","bun","afro","dreads","big_hair","bob"],
    facial_hair: ["none","stubble","mustache","goatee","beard"],
    glasses: ["none","round","rect"],
    brows: ["thin","thick"], eyes: ["round","narrow"], smile: ["soft","big"],
  };
  const chip = (k, v) => (
    <button key={v} onClick={() => set(k, v)} style={{
      padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
      background: f[k] === v ? C.brass : "transparent", color: f[k] === v ? C.ink : C.dim,
      border: `1px solid ${f[k] === v ? C.brass : C.line}`,
    }}>{v.replace("_", " ")}</button>
  );
  const row = (label, inner) => (
    <div style={{ margin: "10px 0" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.dim, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{inner}</div>
    </div>
  );
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(6,10,16,0.86)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, maxHeight: "88vh", overflowY: "auto", background: C.panel, border: `2px solid ${C.brass}`, borderRadius: 14, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src={featuresToUrl(f)} alt="emoji preview" style={{ width: 84, height: 84 }} />
          <div>
            <Eyebrow>Emoji studio</Eyebrow>
            <div style={{ fontFamily: "Georgia, serif", color: C.paper, fontSize: 20, fontWeight: 700 }}>Build your emoji</div>
          </div>
        </div>
        {row("Skin", SKIN.map((c, i) => (
          <button key={i} onClick={() => set("skin", i + 1)} style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer", border: `2.5px solid ${f.skin === i + 1 ? C.brass : C.line}` }} />
        )))}
        {row("Hair", OPT.hair_style.map(v => chip("hair_style", v)))}
        {row("Hair color", Object.entries(HAIR).map(([k, c]) => (
          <button key={k} onClick={() => set("hair_color", k)} style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer", border: `2.5px solid ${f.hair_color === k ? C.brass : C.line}` }} />
        )))}
        {row("Facial hair", OPT.facial_hair.map(v => chip("facial_hair", v)))}
        {row("Glasses", OPT.glasses.map(v => chip("glasses", v)))}
        {row("Brows", OPT.brows.map(v => chip("brows", v)))}
        {row("Eyes", OPT.eyes.map(v => chip("eyes", v)))}
        {row("Smile", OPT.smile.map(v => chip("smile", v)))}
        {row("Bubble", BGS.map((c, i) => (
          <button key={i} onClick={() => set("bubble", i + 1)} style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer", border: `2.5px solid ${f.bubble === i + 1 ? C.brass : C.line}` }} />
        )))}
        {row("Shirt", SHIRTS.map((c, i) => (
          <button key={i} onClick={() => set("shirt", i + 1)} style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer", border: `2.5px solid ${f.shirt === i + 1 ? C.brass : C.line}` }} />
        )))}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <Btn onClick={() => onDone({ url: featuresToUrl(f), features: f })} style={{ flex: 1 }}>Use this emoji</Btn>
          <Btn ghost onClick={onCancel}>Cancel</Btn>
        </div>
        <p style={{ color: C.dim, fontSize: 10.5, marginBottom: 0, marginTop: 10 }}>Avatar art: "Avataaars" by Pablo Stanley</p>
      </div>
    </div>
  );
}

/* ---------- atoms ---------- */
function Btn({ children, onClick, color = C.brass, ghost, disabled, style }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: ghost ? "transparent" : color, color: ghost ? color : C.ink,
      border: ghost ? `1px solid ${color}` : "none", borderRadius: 8,
      padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: disabled ? "wait" : "pointer",
      opacity: disabled ? 0.6 : 1, fontFamily: "inherit", ...style,
    }}>{children}</button>
  );
}
function Eyebrow({ children, color = C.brass }) {
  return <div style={{ fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color, fontWeight: 700 }}>{children}</div>;
}
function AvatarBadge({ profile, size = 22 }) {
  if (profile.avatarImg) {
    return <img src={profile.avatarImg} alt="avatar" style={{ width: size, height: size, borderRadius: "30%", objectFit: "cover", border: `1px solid ${C.brass}` }} />;
  }
  return <span style={{ fontSize: size - 2 }}>{profile.avatar}</span>;
}

/* ---------- search ---------- */
function CountrySearch({ stamps, onGo }) {
  const [q, setQ] = useState("");
  const results = q.trim().length < 2 ? [] :
    allCountries().filter(n => n.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6);
  return (
    <div style={{ position: "relative", maxWidth: 380, margin: "0 auto 8px" }}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔎 Search any country…"
        style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 999, border: `1px solid ${C.line}`, background: C.panel, color: C.paper, fontSize: 14, fontFamily: "inherit" }} />
      {results.length > 0 && (
        <div style={{ position: "absolute", top: "110%", left: 0, right: 0, background: C.panelHi, border: `1px solid ${C.line}`, borderRadius: 12, zIndex: 20, overflow: "hidden" }}>
          {results.map(name => {
            const ct = continentOf(name);
            const open = isUnlocked(stamps, ct, name);
            return (
              <button key={name} onClick={() => { setQ(""); onGo(ct, name, open); }} style={{
                display: "flex", justifyContent: "space-between", width: "100%", padding: "11px 14px",
                background: "transparent", border: "none", borderBottom: `1px solid ${C.line}`,
                color: open ? C.paper : C.dim, cursor: "pointer", fontSize: 14, fontFamily: "inherit",
              }}>
                <span>{flagOf(name)} {name} <span style={{ color: C.dim, fontSize: 12 }}>· {ct.name}</span></span>
                <span>{open ? "→" : "🔒"}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- world map ---------- */
function WorldMap({ onPick, visited }) {
  const [hover, setHover] = useState(null);
  const { w, h, countries } = MAPDATA.world;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", display: "block", background: "linear-gradient(160deg, #13253E 0%, #0E1B2E 60%, #0C1626 100%)", borderRadius: 14, border: `1.5px solid ${C.line}` }}>
        {countries.map((cn, i) => {
          const active = cn.c && hover === cn.c;
          return (
            <path key={i} d={cn.d}
              fill={cn.c ? CONT_COLORS[cn.c] : "#22314A"}
              opacity={cn.c ? (active ? 1 : 0.62) : 0.5}
              stroke={active ? C.paper : C.ink}
              strokeWidth={active ? 0.8 : 0.5}
              onMouseEnter={() => cn.c && setHover(cn.c)}
              onMouseLeave={() => setHover(null)}
              onClick={() => cn.c && onPick(CONTINENTS.find(x => x.id === cn.c))}
              style={{ cursor: cn.c ? "pointer" : "default", transition: "opacity .15s" }} />
          );
        })}
        {CONTINENTS.map(ct => (
          <g key={ct.id} onClick={() => onPick(ct)} style={{ cursor: "pointer", pointerEvents: "none" }}>
            <text x={ct.label[0]} y={ct.label[1]} textAnchor="middle" fontSize="15" fontWeight="800"
              fill={hover === ct.id ? C.paper : C.paper} opacity={hover === ct.id ? 1 : 0.75}
              style={{ fontFamily: "Georgia, serif", letterSpacing: "0.14em", textTransform: "uppercase", paintOrder: "stroke", stroke: C.ink, strokeWidth: 3 }}>
              {ct.name}
            </text>
            {visited[ct.id] > 0 && (
              <circle cx={ct.label[0] + ct.name.length * 5.6 + 12} cy={ct.label[1] - 5} r="4.5" fill={C.chili} stroke={C.ink} strokeWidth="1" />
            )}
          </g>
        ))}
      </svg>
      <p style={{ textAlign: "center", color: C.dim, fontSize: 13, fontStyle: "italic", fontFamily: "Georgia, serif", margin: "8px 0 0" }}>
        {hover ? "Tap to zoom into " + CONTINENTS.find(c => c.id === hover).name : "Tap a continent, or search above"}
      </p>
    </div>
  );
}

/* ---------- continent map (real borders) ---------- */
function ContinentMap({ continent, stamps, onPickCountry, onLockedTap }) {
  const [hover, setHover] = useState(null);
  const nUnlocked = unlockedCount(stamps, continent);
  const got = stampsInContinent(stamps, continent);
  const nextIn = STAMPS_PER_UNLOCK - (got % STAMPS_PER_UNLOCK);
  const allOpen = nUnlocked >= orderOf(continent).length;
  const shapes = MAPDATA.continents[continent.id].shapes;
  const color = CONT_COLORS[continent.id];

  const playState = {};
  orderOf(continent).forEach((name, idx) => { playState[name] = idx < nUnlocked; });

  const handle = (name, open) => open ? onPickCountry(name) : onLockedTap(continent, name);

  return (
    <div>
      <svg viewBox={`0 0 ${MAPDATA.cw} ${MAPDATA.ch}`} style={{ width: "100%", maxWidth: 620, display: "block", margin: "0 auto", background: "linear-gradient(160deg, #13253E 0%, #0E1B2E 100%)", borderRadius: 14, border: `1.5px solid ${C.line}` }}>
        {/* context countries first, playable on top */}
        {shapes.filter(s => !s.p).map((s, i) => (
          <path key={"c" + i} d={s.d} fill="#233350" opacity="0.75" stroke={C.ink} strokeWidth="0.6" />
        ))}
        {shapes.filter(s => s.p).map(s => {
          const open = playState[s.n];
          const cStamps = stamps.filter(x => x.country === s.n);
          const isH = hover === s.n;
          return (
            <path key={s.n} d={s.d}
              fill={open ? color : "#1A2740"}
              opacity={open ? (isH ? 1 : 0.82) : 0.9}
              stroke={cStamps.length ? C.brass : open ? C.paper : C.line}
              strokeWidth={isH ? 1.4 : cStamps.length ? 1.2 : 0.8}
              onMouseEnter={() => setHover(s.n)} onMouseLeave={() => setHover(null)}
              onClick={() => handle(s.n, open)}
              style={{ cursor: "pointer", transition: "opacity .15s" }} />
          );
        })}
        {shapes.filter(s => s.p && !playState[s.n]).map(s => (
          <text key={"l" + s.n} x={s.x} y={s.y + 3} textAnchor="middle" fontSize="8" opacity="0.85"
            onClick={() => onLockedTap(continent, s.n)} style={{ cursor: "pointer" }}>{"🔒"}</text>
        ))}
        {shapes.filter(s => s.p && playState[s.n]).map(s => {
          const cStamps = stamps.filter(x => x.country === s.n);
          return (
            <g key={"m" + s.n} onClick={() => onPickCountry(s.n)}
               onMouseEnter={() => setHover(s.n)} onMouseLeave={() => setHover(null)}
               style={{ cursor: "pointer" }}>
              <circle cx={s.x} cy={s.y} r="9.5" fill={C.ink} opacity="0.9"
                stroke={cStamps.length ? C.brass : C.reel} strokeWidth="1.5" />
              <text x={s.x} y={s.y + 3.5} textAnchor="middle" fontSize="9.5" style={{ pointerEvents: "none" }}>
                {flagOf(s.n)}
              </text>
              <text x={s.x} y={s.y + 21} textAnchor="middle" fontSize="9" fontWeight="700" fill={C.paper}
                style={{ pointerEvents: "none", paintOrder: "stroke", stroke: C.ink, strokeWidth: 2.5 }}>
                {s.n.length > 16 ? s.n.slice(0, 15) + "…" : s.n}
              </text>
              {cStamps.length > 0 && (
                <text x={s.x + 10} y={s.y - 8} fontSize="8" style={{ pointerEvents: "none" }}>
                  {cStamps.map(st => (st.type === "food" ? "🍴" : "🎬")).join("")}
                </text>
              )}
            </g>
          );
        })}
              </svg>
      <p style={{ textAlign: "center", color: C.dim, fontSize: 13, fontStyle: "italic", margin: "8px 0 0" }}>
        {allOpen
          ? "All of " + continent.name + " is open to you."
          : `${nUnlocked}/${orderOf(continent).length} countries open · ${nextIn} more stamp${nextIn > 1 ? "s" : ""} here unlocks ${orderOf(continent)[nUnlocked]}`}
      </p>
    </div>
  );
}

/* ---------- onboarding ---------- */
function Onboarding({ onDone, submitting, authError }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [av, setAv] = useState(AVATARS[0]);
  const [img, setImg] = useState(null);
  const [feat, setFeat] = useState(null);
  const [photoErr, setPhotoErr] = useState(null);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const fileRef = useRef(null);
  return (
    <div style={{ maxWidth: 460, margin: "40px auto", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 28 }}>
      <Eyebrow>New expedition</Eyebrow>
      <h2 style={{ fontFamily: "Georgia, serif", color: C.paper, margin: "8px 0 4px", fontSize: 26 }}>Issue your passport</h2>
      <p style={{ color: C.dim, fontSize: 14, marginTop: 0 }}>Every country you cook or watch your way through earns a stamp.</p>

      <label style={{ color: C.dim, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>Traveler name</label>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Prajay"
        style={{ width: "100%", boxSizing: "border-box", margin: "6px 0 14px", padding: "12px 14px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.ink, color: C.paper, fontSize: 15, fontFamily: "inherit" }} />

      <label style={{ color: C.dim, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>Username <span style={{ textTransform: "none", letterSpacing: 0 }}>(friends look you up by this)</span></label>
      <input value={username} onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} placeholder="3-20 letters, numbers, _" autoCapitalize="none"
        style={{ width: "100%", boxSizing: "border-box", margin: "6px 0 14px", padding: "12px 14px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.ink, color: C.paper, fontSize: 15, fontFamily: "inherit" }} />

      <label style={{ color: C.dim, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>Email <span style={{ textTransform: "none", letterSpacing: 0 }}>(for password reset)</span></label>
      <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@example.com" autoCapitalize="none"
        style={{ width: "100%", boxSizing: "border-box", margin: "6px 0 14px", padding: "12px 14px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.ink, color: C.paper, fontSize: 15, fontFamily: "inherit" }} />

      <label style={{ color: C.dim, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>Password</label>
      <PasswordField value={password} onChange={e => setPassword(e.target.value)} placeholder="at least 6 characters" />

      <label style={{ color: C.dim, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>Passport photo</label>
      <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "8px 0 12px" }}>
        <button onClick={() => fileRef.current && fileRef.current.click()} style={{
          display: "flex", alignItems: "center", gap: 10, background: C.ink, border: `1.5px dashed ${C.reel}`,
          borderRadius: 10, padding: "10px 14px", color: C.reel, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit",
        }}>{busyPhoto ? "✨ Sketching your emoji…" : img ? "📸 Retake photo" : "📸 From a photo"}</button>
        <button onClick={() => setBuilderOpen(true)} style={{
          display: "flex", alignItems: "center", gap: 10, background: C.ink, border: `1.5px dashed ${C.brass}`,
          borderRadius: 10, padding: "10px 14px", color: C.brass, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit",
        }}>🎨 Build it myself</button>
        {img && <img src={img} alt="digitized avatar" style={{ width: 52, height: 52, borderRadius: "30%", objectFit: "cover", border: `2px solid ${C.brass}` }} />}
        {img && <button onClick={() => setImg(null)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>use icon instead</button>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={e => {
          const f = e.target.files && e.target.files[0];
          if (f) { setBusyPhoto(true); setPhotoErr(null);
            digitizePhoto(f, d => { setImg(d.url); setFeat(d.features); setBusyPhoto(false); }, m => { setPhotoErr(m); setBusyPhoto(false); }); }
          e.target.value = "";
        }} />
      {photoErr && <p style={{ color: C.chili, fontSize: 13 }}>{photoErr}</p>}
      <p style={{ color: C.dim, fontSize: 12, marginTop: 0 }}>Your photo is shown once to the AI guide, which reads your features (hair, glasses, smile) and draws you as an emoji. Only the drawn emoji is stored — never the photo.</p>

      {!img && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 6, margin: "8px 0 22px" }}>
          {AVATARS.map(a => (
            <button key={a} onClick={() => setAv(a)} style={{
              fontSize: 22, padding: "6px 0", borderRadius: 10, cursor: "pointer",
              border: `2px solid ${a === av ? C.brass : C.line}`,
              background: a === av ? C.panelHi : "transparent",
            }}>{a}</button>
          ))}
        </div>
      )}

      {authError && <p style={{ color: C.chili, fontSize: 13, margin: "0 0 8px" }}>{authError}</p>}
      <Btn onClick={() => name.trim() && username.length >= 3 && email.includes("@") && password.length >= 6 && onDone({ name: name.trim(), username, email, password, avatar: av, avatarImg: img, avatarFeatures: feat })} disabled={!name.trim() || username.length < 3 || !email.includes("@") || password.length < 6 || submitting} style={{ width: "100%", marginTop: img ? 10 : 0 }}>
        {submitting ? "Issuing passport…" : "Begin the journey"}
      </Btn>
      {builderOpen && <EmojiBuilder initial={feat}
        onDone={d => { setImg(d.url); setFeat(d.features); setPhotoErr(null); setBuilderOpen(false); }}
        onCancel={() => setBuilderOpen(false)} />}
    </div>
  );
}

/* ---------- passport ---------- */
function Passport({ profile, stamps, onClose, onNewAvatar, onLogout, onProfileSaved }) {
  const total = allCountries().length * 2;
  const fileRef = useRef(null);
  const [photoErr, setPhotoErr] = useState(null);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sName, setSName] = useState(profile.name || "");
  const [sEmail, setSEmail] = useState(profile.email || "");
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [saveMsg, setSaveMsg] = useState(null);
  const [saveErr, setSaveErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const saveSettings = async () => {
    setSaving(true); setSaveErr(null); setSaveMsg(null);
    const patch = {};
    if (sName && sName !== profile.name) patch.displayName = sName;
    if (sEmail !== (profile.email || "")) patch.email = sEmail;
    if (newPw) { patch.newPassword = newPw; patch.currentPassword = curPw; }
    if (Object.keys(patch).length === 0) { setSaveErr("Nothing changed."); setSaving(false); return; }
    try {
      const res = await updateAccount(patch);
      setSaveMsg("Saved."); setCurPw(""); setNewPw("");
      if (onProfileSaved) onProfileSaved({ name: res.displayName, email: res.email });
    } catch (e) { setSaveErr(e.message || "Couldn't save."); }
    setSaving(false);
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(6,10,16,0.82)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, maxHeight: "85vh", overflowY: "auto", background: C.panel, border: `2px solid ${C.brass}`, borderRadius: 14, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <AvatarBadge profile={profile} size={44} />
            <div>
              <Eyebrow>Passport</Eyebrow>
              <h2 style={{ fontFamily: "Georgia, serif", color: C.paper, margin: "2px 0", fontSize: 22 }}>{profile.name}</h2>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn ghost onClick={onLogout} style={{ padding: "6px 14px" }}>Log out</Btn>
            <Btn ghost onClick={onClose} style={{ padding: "6px 14px" }}>Close</Btn>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 2px" }}>
          <button onClick={() => fileRef.current && fileRef.current.click()} style={{
            background: "none", border: `1px dashed ${C.reel}`, borderRadius: 8, color: C.reel,
            cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "6px 12px", fontFamily: "inherit",
          }}>{busyPhoto ? "✨ Sketching…" : "📸 Emoji from photo"}</button>
          <button onClick={() => setBuilderOpen(true)} style={{
            background: "none", border: `1px dashed ${C.brass}`, borderRadius: 8, color: C.brass,
            cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "6px 12px", fontFamily: "inherit",
          }}>🎨 Build / edit emoji</button>
          {photoErr && <span style={{ color: C.chili, fontSize: 12 }}>{photoErr}</span>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={e => {
            const f = e.target.files && e.target.files[0];
            if (f) { setBusyPhoto(true); setPhotoErr(null);
              digitizePhoto(f, d => { setBusyPhoto(false); onNewAvatar(d); }, m => { setPhotoErr(m); setBusyPhoto(false); }); }
            e.target.value = "";
          }} />
        {builderOpen && <EmojiBuilder initial={profile.avatarFeatures}
          onDone={d => { setBuilderOpen(false); setPhotoErr(null); onNewAvatar(d); }}
          onCancel={() => setBuilderOpen(false)} />}
        <div style={{ marginTop: 10 }}>
          <button onClick={() => { setSettingsOpen(v => !v); setSaveMsg(null); setSaveErr(null); }} style={{
            background: "none", border: `1px solid ${C.line}`, borderRadius: 8, color: C.dim,
            cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "6px 12px", fontFamily: "inherit",
          }}>⚙️ {settingsOpen ? "Hide account settings" : "Account settings"}</button>
        </div>
        {settingsOpen && (
          <div style={{ marginTop: 12, padding: 14, border: `1px solid ${C.line}`, borderRadius: 10, background: C.ink }}>
            <label style={{ color: C.dim, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>Display name</label>
            <input value={sName} onChange={e => setSName(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", margin: "6px 0 12px", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.panel, color: C.paper, fontSize: 14, fontFamily: "inherit" }} />
            <label style={{ color: C.dim, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>Email</label>
            <input value={sEmail} onChange={e => setSEmail(e.target.value)} type="email" autoCapitalize="none"
              style={{ width: "100%", boxSizing: "border-box", margin: "6px 0 12px", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.panel, color: C.paper, fontSize: 14, fontFamily: "inherit" }} />
            <div style={{ borderTop: `1px solid ${C.line}`, margin: "4px 0 12px" }} />
            <label style={{ color: C.dim, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>Change password <span style={{ textTransform: "none", letterSpacing: 0 }}>(leave blank to keep)</span></label>
            <input value={curPw} onChange={e => setCurPw(e.target.value)} type="password" placeholder="Current password"
              style={{ width: "100%", boxSizing: "border-box", margin: "6px 0 8px", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.panel, color: C.paper, fontSize: 14, fontFamily: "inherit" }} />
            <input value={newPw} onChange={e => setNewPw(e.target.value)} type="password" placeholder="New password (min 6)"
              style={{ width: "100%", boxSizing: "border-box", margin: "0 0 12px", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.panel, color: C.paper, fontSize: 14, fontFamily: "inherit" }} />
            {saveErr && <p style={{ color: C.chili, fontSize: 13, margin: "0 0 8px" }}>{saveErr}</p>}
            {saveMsg && <p style={{ color: C.brass, fontSize: 13, margin: "0 0 8px" }}>{saveMsg}</p>}
            <Btn onClick={saveSettings} disabled={saving} style={{ width: "100%" }}>{saving ? "Saving…" : "Save changes"}</Btn>
          </div>
        )}
        <p style={{ color: C.dim, fontSize: 13 }}>{stamps.length} of {total} stamps · 🍴 kitchen · 🎬 cinema · stamps unlock new countries</p>
        {stamps.length === 0 ? (
          <p style={{ color: C.dim, fontStyle: "italic" }}>No stamps yet — open a country's Kitchen or Cinema to earn your first.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {stamps.map((s, i) => (
              <div key={i} style={{
                border: `1.5px dashed ${s.type === "food" ? C.chili : C.reel}`, borderRadius: 10,
                padding: "10px 6px", textAlign: "center", transform: `rotate(${(i % 5 - 2) * 3}deg)`, background: C.ink,
              }}>
                <div style={{ fontSize: 22 }}>{flagOf(s.country)}</div>
                <div style={{ color: C.paper, fontSize: 12, fontWeight: 700 }}>{s.country}</div>
                <div style={{ fontSize: 13 }}>{s.type === "food" ? "🍴" : "🎬"}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- content panels ---------- */
function Sources({ list }) {
  if (!list || list.length === 0) return null;
  return (
    <div style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
      <Eyebrow>Sources the guide checked</Eyebrow>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {list.map((s, i) => (
          <a key={i} href={s.url} target="_blank" rel="noreferrer" style={{
            display: "inline-block", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            background: C.ink, border: `1px solid ${C.line}`, borderRadius: 999, padding: "5px 11px",
            color: C.reel, fontSize: 12, textDecoration: "none", fontWeight: 600,
          }}>{s.host} ↗</a>
        ))}
      </div>
    </div>
  );
}

function RecipePanel({ data, done, onCooked, sources }) {
  return (
    <div>
      <h3 style={{ fontFamily: "Georgia, serif", color: C.paper, fontSize: 24, margin: "4px 0" }}>{data.dish}</h3>
      <p style={{ color: C.brass, margin: "0 0 2px", fontStyle: "italic" }}>{data.local_name} · {data.region}</p>
      <p style={{ color: C.dim, fontSize: 13, margin: "4px 0 14px" }}>⏱ {data.time} · {data.difficulty} · Serves {data.servings}</p>
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ background: C.ink, borderRadius: 10, padding: 16, border: `1px solid ${C.line}` }}>
          <Eyebrow color={C.chili}>Ingredients</Eyebrow>
          <ul style={{ color: C.paper, fontSize: 14, lineHeight: 1.7, paddingLeft: 18, margin: "8px 0 0" }}>
            {data.ingredients.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        </div>
        <div style={{ background: C.ink, borderRadius: 10, padding: 16, border: `1px solid ${C.line}` }}>
          <Eyebrow color={C.chili}>Method</Eyebrow>
          <ol style={{ color: C.paper, fontSize: 14, lineHeight: 1.7, paddingLeft: 18, margin: "8px 0 0" }}>
            {data.steps.map((x, i) => <li key={i} style={{ marginBottom: 6 }}>{x}</li>)}
          </ol>
        </div>
      </div>
      <p style={{ color: C.dim, fontSize: 13, fontStyle: "italic", marginTop: 14 }}>{data.context}</p>
      {done ? (
        <div style={{ marginTop: 10, color: C.brass, fontWeight: 800, fontSize: 14 }}>🍴 Cooked — Kitchen stamp earned</div>
      ) : (
        <Btn onClick={onCooked} color={C.chili} style={{ marginTop: 10 }}>🍴 I cooked this — claim the stamp</Btn>
      )}
      <Sources list={sources} />
    </div>
  );
}

function CinemaPanel({ data, watched, onToggleWatched, sources }) {
  return (
    <div>
      <p style={{ color: C.dim, fontSize: 13, fontStyle: "italic", marginTop: 4 }}>{data.scene_note}</p>
      <div style={{ display: "grid", gap: 10 }}>
        {data.films.map((f, i) => (
          <div key={i} style={{ background: C.ink, border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.reel}`, borderRadius: 10, padding: "12px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ color: C.paper, fontFamily: "Georgia, serif", fontSize: 16 }}>
                {f.title} <span style={{ color: C.dim, fontWeight: 400 }}>({f.year})</span>
              </strong>
              <span style={{ color: C.brass, fontWeight: 800, fontSize: 14 }}>★ {f.rating}</span>
            </div>
            <div style={{ color: C.dim, fontSize: 12.5, margin: "3px 0" }}>
              {f.genre} · {f.runtime} · dir. {f.director}
            </div>
            {f.cast && f.cast.length > 0 && (
              <div style={{ color: C.dim, fontSize: 12.5 }}>With {f.cast.join(", ")}</div>
            )}
            <div style={{ color: C.paper, fontSize: 14, margin: "6px 0 4px" }}>{f.why}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ color: C.reel, fontSize: 12 }}>{f.mood}</span>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <a href={"https://www.imdb.com/find/?q=" + encodeURIComponent(f.title + " " + f.year)}
                   target="_blank" rel="noreferrer" style={{ color: C.reel, fontSize: 12, textDecoration: "none", fontWeight: 700 }}>
                  IMDb ↗
                </a>
                <button onClick={() => onToggleWatched(f.title)} style={{
                  background: watched.includes(f.title) ? C.reel : "transparent", color: watched.includes(f.title) ? C.ink : C.reel,
                  border: `1px solid ${C.reel}`, borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}>{watched.includes(f.title) ? "Watched ✓" : "Mark watched"}</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p style={{ color: C.dim, fontSize: 11.5, fontStyle: "italic" }}>Ratings are drawn from the sources below where available — tap IMDb to confirm. Mark your first film watched to earn the Cinema stamp.</p>
      <Sources list={sources} />
    </div>
  );
}

function StoryPanel({ data }) {
  const rows = [["A brief history", data.history, C.brass], ["At the table", data.table, C.chili], ["On the screen", data.screen, C.reel]];
  return (
    <div style={{ display: "grid", gap: 12, marginTop: 6 }}>
      {rows.map(([t, body, col]) => (
        <div key={t} style={{ background: C.ink, border: `1px solid ${C.line}`, borderRadius: 10, padding: 16 }}>
          <Eyebrow color={col}>{t}</Eyebrow>
          <p style={{ color: C.paper, fontSize: 14, lineHeight: 1.65, margin: "8px 0 0" }}>{body}</p>
        </div>
      ))}
      <div style={{ background: C.ink, border: `1px dashed ${C.brass}`, borderRadius: 10, padding: 16 }}>
        <Eyebrow>Did you know</Eyebrow>
        <ul style={{ color: C.paper, fontSize: 14, lineHeight: 1.7, paddingLeft: 18, margin: "8px 0 0" }}>
          {data.facts.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      </div>
    </div>
  );
}

/* ---------- follow-up chat ---------- */
function GuideChat({ domain, country, card, messages, onMessages }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const endRef = useRef(null);
  const col = domain === "food" ? C.chili : C.reel;

  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const withUser = [...messages, { role: "user", text }];
    onMessages(withUser);
    setInput(""); setBusy(true); setErr(null);
    try {
      const reply = await apiChat(domain, country, card, withUser);
      onMessages([...withUser, { role: "assistant", text: reply.trim() }]);
    } catch (e) {
      console.error(e);
      setErr("The guide didn't hear you — try again.");
      onMessages(messages);
      setInput(text);
    }
    setBusy(false);
  };

  return (
    <div style={{ marginTop: 20, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
      <Eyebrow color={col}>{domain === "food" ? "Ask the kitchen" : "Ask the cinema"}</Eyebrow>
      <div style={{ maxHeight: 260, overflowY: "auto", margin: "10px 0", display: "grid", gap: 8 }}>
        {messages.length === 0 && (
          <p style={{ color: C.dim, fontSize: 13, fontStyle: "italic", margin: 0 }}>
            {domain === "food"
              ? "Follow up on this recipe — swap an ingredient, scale it, ask why a step matters."
              : "Follow up on this list — where to stream, similar films, which one first."}
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            justifySelf: m.role === "user" ? "end" : "start", maxWidth: "85%",
            background: m.role === "user" ? C.panelHi : C.ink,
            border: `1px solid ${m.role === "user" ? C.line : col}`,
            borderRadius: m.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
            padding: "9px 13px", color: C.paper, fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap",
          }}>{m.text}</div>
        ))}
        {busy && <div style={{ color: C.dim, fontSize: 13, fontStyle: "italic" }}>Guide is thinking…</div>}
        <div ref={endRef} />
      </div>
      {err && <p style={{ color: C.chili, fontSize: 13 }}>{err}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") send(); }}
          placeholder={domain === "food" ? "e.g. Can I make this without a wok?" : "e.g. Which of these should I watch first?"}
          style={{ flex: 1, padding: "11px 14px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.panel, color: C.paper, fontSize: 14, fontFamily: "inherit" }} />
        <Btn onClick={send} disabled={busy || !input.trim()} color={col}>Send</Btn>
      </div>
    </div>
  );
}

/* ---------- country view ---------- */
function CountryView({ country, onBack, onStamp }) {
  const [tab, setTab] = useState("food");
  const [prefs, setPrefs] = useState({ food: "", cinema: "" });
  const [cache, setCache] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => { setCache(null); setCache(loadCache(country)); }, [country]);

  const update = (patch) => {
    setCache(prev => {
      const next = { ...(prev || {}), ...patch };
      saveCache(country, next);
      return next;
    });
  };

  const run = async (fn) => {
    setLoading(true); setErr(null);
    try { await fn(); }
    catch (e) { console.error(e); setErr("Couldn't reach the guide — try again in a moment."); }
    setLoading(false);
  };

  const getIdeas = () => run(async () => {
    const data = await apiGenerate("foodIdeas", { country, prefs: prefs.food });
    update({ foodOptions: data.dishes, foodOptionSources: data.__sources || [], food: null, foodChat: [], foodDone: false });
  });
  const getRecipe = (dishName) => run(async () => {
    const data = await apiGenerate("foodFull", { country, prefs: prefs.food, dish: dishName });
    update({ food: data, foodChat: [], foodDone: false });
  });
  const getCinema = () => run(async () => {
    const data = await apiGenerate("cinema", { country, prefs: prefs.cinema });
    update({ cinema: data, cinemaChat: [], cinemaWatched: [] });
  });
  const getStory = () => run(async () => {
    const data = await apiGenerate("story", { country });
    update({ story: data });
  });

  const tabs = [
    ["food", "🍴 Kitchen", C.chili],
    ["cinema", "🎬 Cinema", C.reel],
    ["story", "📜 Story", C.brass],
  ];

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 14, padding: 0, marginBottom: 10, fontFamily: "inherit" }}>← back to map</button>
      <h2 style={{ fontFamily: "Georgia, serif", color: C.paper, fontSize: 32, margin: "0 0 14px" }}>{flagOf(country)} {country}</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        {tabs.map(([id, label, col]) => (
          <button key={id} onClick={() => { setTab(id); setErr(null); }} style={{
            padding: "9px 16px", borderRadius: 999, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
            background: tab === id ? col : "transparent", color: tab === id ? C.ink : col,
            border: `1.5px solid ${col}`,
          }}>{label}</button>
        ))}
      </div>
      <p style={{ color: C.dim, fontSize: 11.5, fontStyle: "italic", margin: "0 0 12px" }}>
        ℹ️ The guide searches the web for reputable recipes and film info, then writes each card and lists the sources it checked below. It synthesizes rather than copying, so still confirm details that matter (the source and IMDb links are there for that).</p>

      {tab !== "story" && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <input value={prefs[tab]} onChange={e => { const v = e.target.value; setPrefs(p => ({ ...p, [tab]: v })); }}
            placeholder={tab === "food" ? "Preferences — e.g. vegetarian, 30 min, low fuss…" : "Preferences — e.g. thrillers, something recent, family night…"}
            style={{ flex: 1, minWidth: 220, padding: "11px 14px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.panel, color: C.paper, fontSize: 14, fontFamily: "inherit" }} />
          {tab === "food" ? (
            <Btn onClick={getIdeas} disabled={loading} color={C.chili}>
              {loading ? "Consulting…" : cache && cache.foodOptions ? "New ideas" : "Get dish ideas"}
            </Btn>
          ) : (
            <Btn onClick={getCinema} disabled={loading} color={C.reel}>
              {loading ? "Consulting…" : cache && cache.cinema ? "New list" : "Get films"}
            </Btn>
          )}
        </div>
      )}
      {tab === "story" && !(cache && cache.story) && (
        <Btn onClick={getStory} disabled={loading} style={{ marginBottom: 14 }}>
          {loading ? "Consulting…" : "Tell me the story"}
        </Btn>
      )}

      {err && <p style={{ color: C.chili }}>{err}</p>}
      {loading && <p style={{ color: C.dim, fontStyle: "italic" }}>Your guide is thinking…</p>}

      {!loading && tab === "food" && cache && (
        cache.food ? (
          <div>
            {cache.foodOptions && cache.foodOptions.length > 0 && (
              <button onClick={() => update({ food: null })} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 8, fontFamily: "inherit" }}>← other dish ideas</button>
            )}
            <RecipePanel data={cache.food} done={!!cache.foodDone} sources={cache.food.__sources}
              onCooked={() => { update({ foodDone: true }); onStamp(country, "food"); }} />
            <GuideChat domain="food" country={country} card={cache.food}
              messages={cache.foodChat || []} onMessages={m => update({ foodChat: m })} />
          </div>
        ) : cache.foodOptions && cache.foodOptions.length > 0 ? (
          <div style={{ display: "grid", gap: 10 }}>
            {cache.foodOptions.map((d, i) => (
              <div key={i} style={{ background: C.ink, border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.chili}`, borderRadius: 10, padding: "12px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ color: C.paper, fontFamily: "Georgia, serif", fontSize: 16 }}>{d.dish}</strong>
                  <span style={{ color: C.dim, fontSize: 12.5, alignSelf: "center" }}>⏱ {d.time} · {d.difficulty}</span>
                </div>
                {d.local_name && <div style={{ color: C.brass, fontSize: 13, fontStyle: "italic" }}>{d.local_name}</div>}
                <div style={{ color: C.paper, fontSize: 14, margin: "6px 0 8px" }}>{d.one_liner}</div>
                <Btn onClick={() => getRecipe(d.dish)} color={C.chili} style={{ padding: "7px 14px", fontSize: 13 }}>Cook this →</Btn>
              </div>
            ))}
            <Sources list={cache.foodOptionSources} />
          </div>
        ) : (
          <p style={{ color: C.dim, fontStyle: "italic" }}>
            Ask the kitchen for dish ideas from {country}. Pick one, cook it, and earn the Kitchen stamp.
          </p>
        )
      )}

      {!loading && tab === "cinema" && cache && (
        cache.cinema ? (
          <div>
            <CinemaPanel data={cache.cinema} watched={cache.cinemaWatched || []} sources={cache.cinema.__sources}
              onToggleWatched={title => {
                const cur = cache.cinemaWatched || [];
                const next = cur.includes(title) ? cur.filter(t => t !== title) : [...cur, title];
                update({ cinemaWatched: next });
                if (!cur.includes(title)) onStamp(country, "cinema");
              }} />
            <GuideChat domain="cinema" country={country} card={cache.cinema}
              messages={cache.cinemaChat || []} onMessages={m => update({ cinemaChat: m })} />
          </div>
        ) : (
          <p style={{ color: C.dim, fontStyle: "italic" }}>
            Ask for a watchlist from {country}'s cinema. Watch one to earn the Cinema stamp.
          </p>
        )
      )}

      {!loading && tab === "story" && cache && cache.story && <StoryPanel data={cache.story} />}
    </div>
  );
}

/* ---------- app ---------- */


/* ---------- password field with show/hide ---------- */
function PasswordField({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", margin: "6px 0 18px" }}>
      <input value={value} onChange={onChange} type={show ? "text" : "password"} placeholder={placeholder}
        style={{ width: "100%", boxSizing: "border-box", padding: "12px 52px 12px 14px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.ink, color: C.paper, fontSize: 15, fontFamily: "inherit" }} />
      <button type="button" onClick={() => setShow(v => !v)}
        style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.brass, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

/* ---------- auth gate: sign up or log in ---------- */
function AuthGate({ onAuthed }) {
  const [mode, setMode] = useState("signup"); // "signup" | "login"
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);
  const [lu, setLu] = useState(""); const [lp, setLp] = useState("");

  const doSignup = async (d) => {
    setSubmitting(true); setErr(null);
    try {
      const u = await signup({ username: d.username, email: d.email, password: d.password, displayName: d.name, avatarFeatures: d.avatarFeatures || null });
      onAuthed(u);
    } catch (e) { setErr(e.message || "Sign up failed"); setSubmitting(false); }
  };
  const doLogin = async () => {
    setSubmitting(true); setErr(null);
    try { const u = await login(lu, lp); onAuthed(u); }
    catch (e) { setErr(e.message || "Log in failed"); setSubmitting(false); }
  };
  const [resetId, setResetId] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const doReset = async () => {
    setSubmitting(true); setErr(null);
    try { await requestReset(resetId); setResetSent(true); }
    catch { setResetSent(true); } // we always show the same message
    setSubmitting(false);
  };

  if (mode === "login") {
    return (
      <div style={{ maxWidth: 460, margin: "40px auto", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 28 }}>
        <Eyebrow>Welcome back</Eyebrow>
        <h2 style={{ fontFamily: "Georgia, serif", color: C.paper, margin: "8px 0 14px", fontSize: 26 }}>Log in</h2>
        <input value={lu} onChange={e => setLu(e.target.value)} placeholder="Username or email" autoCapitalize="none"
          style={{ width: "100%", boxSizing: "border-box", margin: "6px 0 12px", padding: "12px 14px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.ink, color: C.paper, fontSize: 15, fontFamily: "inherit" }} />
        <PasswordField value={lp} onChange={e => setLp(e.target.value)} placeholder="Password" />
        {err && <p style={{ color: C.chili, fontSize: 13, margin: "0 0 8px" }}>{err}</p>}
        <Btn onClick={doLogin} disabled={submitting || !lu || !lp} style={{ width: "100%" }}>{submitting ? "Logging in…" : "Log in"}</Btn>
        <p style={{ color: C.dim, fontSize: 13, marginTop: 14, textAlign: "center" }}>
          <button onClick={() => { setErr(null); setResetSent(false); setResetId(lu); setMode("forgot"); }} style={{ background: "none", border: "none", color: C.brass, cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: "underline" }}>Forgot password?</button>
        </p>
        <p style={{ color: C.dim, fontSize: 13, marginTop: 2, textAlign: "center" }}>
          New here? <button onClick={() => { setErr(null); setMode("signup"); }} style={{ background: "none", border: "none", color: C.brass, cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: "underline" }}>Issue a passport</button>
        </p>
      </div>
    );
  }

  if (mode === "forgot") {
    return (
      <div style={{ maxWidth: 460, margin: "40px auto", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 28 }}>
        <Eyebrow>Reset password</Eyebrow>
        <h2 style={{ fontFamily: "Georgia, serif", color: C.paper, margin: "8px 0 6px", fontSize: 26 }}>Forgot your password?</h2>
        {resetSent ? (
          <div>
            <p style={{ color: C.dim, fontSize: 14 }}>If an account matches that username or email, we've sent a reset link. Check your inbox (and spam folder) — the link expires in an hour.</p>
            <Btn onClick={() => { setErr(null); setMode("login"); }} style={{ width: "100%", marginTop: 8 }}>Back to log in</Btn>
          </div>
        ) : (
          <div>
            <p style={{ color: C.dim, fontSize: 14, marginTop: 0 }}>Enter your username or the email you signed up with, and we'll send a reset link.</p>
            <input value={resetId} onChange={e => setResetId(e.target.value)} placeholder="Username or email" autoCapitalize="none"
              style={{ width: "100%", boxSizing: "border-box", margin: "6px 0 14px", padding: "12px 14px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.ink, color: C.paper, fontSize: 15, fontFamily: "inherit" }} />
            <Btn onClick={doReset} disabled={submitting || !resetId.trim()} style={{ width: "100%" }}>{submitting ? "Sending…" : "Send reset link"}</Btn>
            <p style={{ color: C.dim, fontSize: 13, marginTop: 14, textAlign: "center" }}>
              <button onClick={() => { setErr(null); setMode("login"); }} style={{ background: "none", border: "none", color: C.brass, cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: "underline" }}>Back to log in</button>
            </p>
          </div>
        )}
      </div>
    );
  }
  return (
    <div>
      <Onboarding onDone={doSignup} submitting={submitting} authError={err} />
      <p style={{ color: C.dim, fontSize: 13, marginTop: -18, marginBottom: 30, textAlign: "center" }}>
        Already have a passport? <button onClick={() => { setErr(null); setMode("login"); }} style={{ background: "none", border: "none", color: C.brass, cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: "underline" }}>Log in</button>
      </p>
    </div>
  );
}

/* ---------- friend lookup: search a username, see their stamps ---------- */
function FriendLookup() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(false);

  const search = async (name) => {
    const u = (name ?? q).trim();
    if (u.length < 2) { setErr("Type at least 2 characters."); return; }
    setBusy(true); setErr(null); setResult(null); setSuggestions([]);
    try {
      const res = await lookupFriend(u);
      if (res.user) setResult(res.user);
      else { setSuggestions(res.suggestions || []); if (!res.suggestions || !res.suggestions.length) setErr(`No traveler named "${u}".`); }
    } catch (e) { setErr(e.message || "Lookup failed"); }
    setBusy(false);
  };

  return (
    <div style={{ maxWidth: 620, margin: "0 auto 14px" }}>
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ display: "block", margin: "0 auto", background: "none", border: `1px solid ${C.line}`, color: C.dim, borderRadius: 999, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
          🔎 Look up a friend's passport
        </button>
      ) : (
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={q} onChange={e => setQ(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} onKeyDown={e => e.key === "Enter" && search()} placeholder="Friend's username" autoCapitalize="none"
              style={{ flex: 1, boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.ink, color: C.paper, fontSize: 15, fontFamily: "inherit" }} />
            <Btn onClick={() => search()} disabled={busy}>{busy ? "…" : "Find"}</Btn>
          </div>
          {err && <p style={{ color: C.chili, fontSize: 13, margin: "10px 0 0" }}>{err}</p>}
          {suggestions.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {suggestions.map(s => (
                <button key={s.username} onClick={() => { setQ(s.username); search(s.username); }} style={{ background: C.ink, border: `1px solid ${C.line}`, color: C.paper, borderRadius: 999, padding: "5px 12px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
                  {s.displayName} <span style={{ color: C.dim }}>@{s.username}</span>
                </button>
              ))}
            </div>
          )}
          {result && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <AvatarBadge profile={{ avatarImg: result.avatarFeatures ? AvatarLib.featuresToUrl(result.avatarFeatures) : null, name: result.displayName }} size={30} />
                <div>
                  <div style={{ color: C.paper, fontWeight: 700 }}>{result.displayName} <span style={{ color: C.dim, fontWeight: 400 }}>@{result.username}</span></div>
                  <div style={{ color: C.brass, fontSize: 13 }}>{(result.stamps || []).length} 🏷 stamps earned</div>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(result.stamps || []).length === 0 && <span style={{ color: C.dim, fontSize: 13 }}>No stamps yet — they're just getting started.</span>}
                {(result.stamps || []).map((s, i) => (
                  <span key={i} style={{ background: C.ink, border: `1px solid ${C.line}`, borderRadius: 999, padding: "4px 10px", fontSize: 13, color: C.paper }}>
                    {flagOf(s.country)} {s.country} · {s.type === "food" ? "🍴" : "🎬"}
                  </span>
                ))}
              </div>
            </div>
          )}
          <button onClick={() => { setOpen(false); setResult(null); setSuggestions([]); setErr(null); setQ(""); }} style={{ display: "block", margin: "12px auto 0", background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>close</button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [stamps, setStamps] = useState([]);
  const [view, setView] = useState({ mode: "globe" });
  const [passportOpen, setPassportOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    fetch("/data/mapdata.json").then(r => r.json()).then(d => { MAPDATA = d; setMapReady(true); });
    me().then(u => {
      if (u) {
        setProfile({ name: u.displayName || u.username, username: u.username, email: u.email || "",
                     avatarImg: u.avatarFeatures ? AvatarLib.featuresToUrl(u.avatarFeatures) : null,
                     avatarFeatures: u.avatarFeatures || null });
        setStamps((u.stamps || []).map(s => ({ ...s, ts: Date.now() })));
      }
      setReady(true);
    });
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3800);
  };

  const persist = (p) => { if (p) saveProfile({ displayName: p.name, avatarFeatures: p.avatarFeatures || null }); };

  const addStamp = useCallback(async (country, type) => {
    const prev = stamps;
    if (prev.some(s => s.country === country && s.type === type)) return;
    let list;
    try { list = await awardStamp(country, type); }
    catch { showToast("Couldn't save that stamp — try again."); return; }
    const next = list.map(s => ({ ...s, ts: Date.now() }));
    setStamps(next);
    const ct = continentOf(country);
    const before = unlockedCount(prev, ct);
    const after = unlockedCount(next, ct);
    if (after > before && after <= orderOf(ct).length) {
      showToast(`🔓 ${orderOf(ct)[after - 1]} unlocked in ${ct.name}!`);
    } else {
      showToast(`${flagOf(country)} Stamp earned — ${country} ${type === "food" ? "Kitchen" : "Cinema"}!`);
    }
  }, [stamps]);

  const visitedByContinent = {};
  CONTINENTS.forEach(ct => { visitedByContinent[ct.id] = stampsInContinent(stamps, ct); });

  const goToCountry = (ct, name, open) => {
    if (!open) {
      const need = STAMPS_PER_UNLOCK - (stampsInContinent(stamps, ct) % STAMPS_PER_UNLOCK);
      showToast(`🔒 ${name} is locked — ${need} more stamp${need > 1 ? "s" : ""} in ${ct.name} to open it.`);
      setView({ mode: "continent", continent: ct });
      return;
    }
    setView({ mode: "country", continent: ct, country: name });
  };

  if (!ready || !mapReady) return <div style={{ background: C.ink, minHeight: "100vh", color: C.dim, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Georgia, serif" }}>Unrolling the map…</div>;

  return (
    <div style={{ background: C.ink, minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif", padding: "0 16px 60px" }}>
      <header style={{ maxWidth: 900, margin: "0 auto", padding: "18px 0", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.line}` }}>
        <div onClick={() => setView({ mode: "globe" })} style={{ cursor: "pointer" }}>
          <Eyebrow>Atlas of</Eyebrow>
          <div style={{ fontFamily: "Georgia, serif", color: C.paper, fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>Table & Screen</div>
        </div>
        {profile && (
          <button onClick={() => setPassportOpen(true)} style={{
            display: "flex", alignItems: "center", gap: 8, background: C.panel, border: `1.5px solid ${C.brass}`,
            borderRadius: 999, padding: "7px 14px", cursor: "pointer", color: C.paper, fontWeight: 700, fontSize: 14, fontFamily: "inherit",
          }}>
            <AvatarBadge profile={profile} size={24} /> {profile.name}
            <span style={{ color: C.brass }}>· {stamps.length} 🏷</span>
          </button>
        )}
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", paddingTop: 22 }}>
        {!profile ? (
          <AuthGate onAuthed={u => { setProfile({ name: u.displayName || u.username, username: u.username, email: u.email || "", avatarImg: u.avatarFeatures ? AvatarLib.featuresToUrl(u.avatarFeatures) : null, avatarFeatures: u.avatarFeatures || null }); me().then(fu => { if (fu) setStamps((fu.stamps||[]).map(s=>({...s,ts:Date.now()}))); }); }} />
        ) : view.mode === "globe" ? (
          <div>
            <FriendLookup />
            <CountrySearch stamps={stamps} onGo={goToCountry} />
            <p style={{ textAlign: "center", color: C.dim, fontStyle: "italic", fontFamily: "Georgia, serif", fontSize: 15, margin: "12px 0 10px" }}>
              Every country holds a kitchen, a cinema, and a story.
            </p>
            <WorldMap onPick={ct => setView({ mode: "continent", continent: ct })} visited={visitedByContinent} />
          </div>
        ) : view.mode === "continent" ? (
          <div style={{ maxWidth: 660, margin: "0 auto" }}>
            <button onClick={() => setView({ mode: "globe" })} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 14, padding: 0, marginBottom: 6, fontFamily: "inherit" }}>← back to world map</button>
            <h2 style={{ fontFamily: "Georgia, serif", color: C.paper, fontSize: 30, margin: "0 0 2px" }}>{view.continent.name}</h2>
            <p style={{ color: C.dim, fontSize: 14, marginTop: 0 }}>Tap a country.</p>
            <ContinentMap continent={view.continent} stamps={stamps}
              onPickCountry={name => goToCountry(view.continent, name, true)}
              onLockedTap={(ct, name) => {
                const need = STAMPS_PER_UNLOCK - (stampsInContinent(stamps, ct) % STAMPS_PER_UNLOCK);
                showToast(`🔒 ${name} is locked — ${need} more stamp${need > 1 ? "s" : ""} in ${ct.name} opens the next country.`);
              }} />
          </div>
        ) : (
          <CountryView country={view.country} onStamp={addStamp}
            onBack={() => setView({ mode: "continent", continent: view.continent })} />
        )}
      </main>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: C.brass, color: C.ink, fontWeight: 800, padding: "12px 22px", borderRadius: 999, boxShadow: "0 6px 24px rgba(0,0,0,0.5)", zIndex: 60, maxWidth: "90vw", textAlign: "center" }}>
          {toast}
        </div>
      )}
      {passportOpen && profile && <Passport profile={profile} stamps={stamps} onClose={() => setPassportOpen(false)}
        onNewAvatar={d => { const p = { ...profile, avatarImg: d.url, avatarFeatures: d.features }; setProfile(p); persist(p); }}
        onProfileSaved={patch => { const p = { ...profile, name: patch.name || profile.name, email: patch.email ?? profile.email }; setProfile(p); }}
        onLogout={async () => { try { await logout(); } catch {} setProfile(null); setPassportOpen(false); setStamps([]); }} />}
    </div>
  );
}
