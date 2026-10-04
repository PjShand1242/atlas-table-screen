# Password reset — setup steps (do these after re-uploading the repo)

This build adds email-based password reset. Three things to do:

## 1. Add the database columns (Neon SQL editor)
Run this once — it adds the email fields and the reset-token table:

```sql
ALTER TABLE "User" ADD COLUMN "email" TEXT;
ALTER TABLE "User" ADD COLUMN "emailLower" TEXT;
CREATE UNIQUE INDEX "User_emailLower_key" ON "User"("emailLower");

CREATE TABLE "PasswordReset" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");
CREATE INDEX "PasswordReset_userId_idx" ON "PasswordReset"("userId");
```

## 2. Get a Resend API key
- Sign up free at resend.com
- Create an API key (starts with `re_`)
- In Vercel → Settings → Environment Variables, add:
  - `RESEND_API_KEY` = your `re_...` key
  - `APP_URL` = your site URL, e.g. `https://atlas-table-screen.vercel.app`
    (this is what the reset link points to)
- Leave `RESEND_FROM` unset for now — it defaults to Resend's shared test
  address `onboarding@resend.dev`. Later, when you verify your own domain,
  set `RESEND_FROM` to something like `Atlas <noreply@yourdomain.com>`.

## 3. Redeploy
Adding env vars doesn't auto-redeploy. In Vercel → Deployments → ⋯ → Redeploy.

## Notes
- Existing accounts (yours) have no email yet, so they can't use email reset
  until they re-sign up OR you add an email to your row manually in SQL:
  `UPDATE "User" SET "email"='you@x.com', "emailLower"='you@x.com' WHERE "usernameLower"='yourname';`
- On the free/test sending address, reset emails often land in SPAM. Tell your
  friends to check spam. Verifying a domain fixes this.
- Login now accepts username OR email.
