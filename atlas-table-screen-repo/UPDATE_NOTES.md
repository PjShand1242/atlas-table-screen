# What's in this update

Four things, all built and compile-checked:

1. **"Cook this" fix** — the detailed-recipe call was failing with a JSON error
   because long recipes got cut off mid-response. Raised the response limit and
   made the JSON parser repair truncated replies. (app/lib/anthropic.js)

2. **Log out button** — now in the Passport popup, next to Close.

3. **Account settings** — in the Passport popup, an "Account settings" panel to
   change display name, email, and password (password change asks for the
   current one first). (app/AtlasApp.jsx, app/api/profile/route.js)

4. **Email password reset** — "Forgot password?" on the login screen; signup now
   collects an email. (This needs the Resend + DB setup in
   PASSWORD_RESET_SETUP.md to actually send mail.)

## How to deploy with GitHub Desktop

1. In Finder, open your cloned repo:
   Documents / GitHub / atlas-table-screen / atlas-table-screen-repo
2. Copy the contents of this bundle INTO that folder, replacing files when asked.
   (The folders — app, prisma, public — and the loose files like package.json.)
3. Open GitHub Desktop. It will show a list of "Changed files" on the left —
   that's how you know it worked.
4. Bottom-left: type a summary like "Add profile editing, logout, reset; fix Cook this"
   then click **Commit to main**.
5. Top bar: click **Push origin**.
6. Vercel auto-deploys. (Then do the DB + Resend steps below for email reset.)

## One-time setup still needed for EMAIL RESET (not the other 3 features)
See PASSWORD_RESET_SETUP.md — the Neon SQL for email columns, and the Resend
account + env vars. The Cook this fix, logout, and account settings all work
without any of that.
