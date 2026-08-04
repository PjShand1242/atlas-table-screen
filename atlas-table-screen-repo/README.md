# Atlas of Table & Screen

A shareable web app: explore a world map, cook and watch your way through
every country, earn passport stamps, and look up friends to see theirs.

This repo is the **live** version of the app — a Next.js frontend plus a small
backend that holds your API key, searches the web for vetted recipes and films,
and stores user accounts and stamps in a database.

---

## What you need (all free to start)

1. **Node.js 18+** — check with `node -v`
2. **An Anthropic API key** — https://console.anthropic.com/settings/keys
3. **A GitHub account** — to push the repo
4. **A Vercel account** — https://vercel.com (sign in with GitHub)
5. **A Postgres database** — easiest is Vercel's built-in Postgres (Storage tab),
   or a free one at https://neon.tech

---

## Run it locally first

```bash
# 1. install dependencies
npm install

# 2. create your env file and fill in the three values
cp .env.example .env.local
#    - ANTHROPIC_API_KEY : from the Anthropic console
#    - DATABASE_URL       : from Vercel Postgres or Neon
#    - AUTH_SECRET        : run  openssl rand -base64 32  and paste the output

# 3. create the database tables
npm run db:push

# 4. start the dev server
npm run dev
#    open http://localhost:3000
```

Sign up with a username, build your emoji, earn a stamp, then open a second
browser (or incognito), sign up as a "friend," and search the first username —
you'll see their stamps.

---

## Deploy it live (share with anyone)

```bash
# 1. put it on GitHub
git init
git add .
git commit -m "Atlas of Table & Screen"
git branch -M main
git remote add origin https://github.com/<you>/atlas-table-screen.git
git push -u origin main
```

Then in the Vercel dashboard:

1. **New Project** → import your GitHub repo.
2. Under **Storage**, create a Postgres database — Vercel auto-adds
   `DATABASE_URL` to the project.
3. Under **Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY`
   - `AUTH_SECRET`  (the `openssl rand` value)
4. **Deploy.** After the first build, run the table setup once — open the
   project's terminal (or locally with the production `DATABASE_URL`) and run:
   ```bash
   npm run db:push
   ```
5. Visit your `*.vercel.app` URL. Share it.

---

## How the pieces fit

- `app/page.jsx` — the whole UI (map, country pages, emoji studio, passport,
  friend search). This is your v9 artifact, adapted to call the backend.
- `app/api/generate` — proxies recipe/film/story requests to Claude **with your
  key server-side** and web search on. The browser never sees the key.
- `app/api/auth` — signup / login / logout / "who am I".
- `app/api/sync` — awards a stamp when you confirm you cooked or watched.
- `app/api/friends` — looks up any username's public stamps.
- `app/lib/*` — db client, auth, the Anthropic wrapper, the avatar engine.
- `prisma/schema.prisma` — the `User` and `Stamp` tables.

## What this costs

Every recipe / film / search now bills **your** Anthropic account (the free
artifact sandbox is gone). For you and friends it's a few dollars a month.
If it grows, add per-user daily limits in `app/api/generate/route.js`.

## Wishlist unlocked by having a backend

- True generated-portrait Genmoji (image model, server-side)
- Live IMDb/TMDB ratings via their APIs
- MCP connectors (your Letterboxd, your recipe manager)
- Friend leaderboards, following, shared trips
- Map zoom/pan for dense continents
