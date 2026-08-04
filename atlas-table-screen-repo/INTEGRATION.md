# Integration status: DONE

Your v9 UI is already merged into `app/AtlasApp.jsx` and wired to the backend —
nothing to hand-assemble. This file records what was changed, for reference.

The eight swaps, all applied and compile-checked:

1. Imports — `AtlasApp.jsx` imports auth/generation/stamps/cache helpers from
   `./lib/client` and the avatar engine from `./lib/avatar`. The ~470KB inlined
   avatar bundle and the baked map data were removed from the component.

2. Map data — fetched from `/public/data/mapdata.json` on load instead of being
   baked into the file (dropped the component from 487KB to 64KB).

3. Auth — a new `AuthGate` (sign up / log in with username + password) replaces
   the onboarding-only profile screen. `me()` runs on load to restore a session.

4. Content — every recipe/film/story/chat request goes through
   `apiGenerate(kind, args)` → `/api/generate` (key server-side, web search on).
   The photo→emoji avatar reads the photo via `/api/avatar` (also server-side).

5. Stamps — `awardStamp(country, type)` writes to the database and returns the
   full list; the unlock toast recomputes from it.

6. Profile — `saveProfile()` persists display name + avatar to the account.

7. Cache — per-country recipe/film cache stays local via `loadCache`/`saveCache`
   from `./lib/client` (localStorage-backed; it's regenerable, so it needn't hit
   the DB).

8. Friends — a new `FriendLookup` box on the globe screen calls
   `lookupFriend(username)` and renders that person's earned stamps read-only.

## To run
See `README.md`. Short version: `npm install`, fill `.env.local`, `npm run
db:push`, `npm run dev`.
