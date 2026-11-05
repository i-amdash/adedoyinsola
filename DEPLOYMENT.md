# Publish on Vercel with Supabase

## Supabase setup

1. In your project's SQL Editor, run the complete contents of `supabase/setup.sql`. It creates the application tables, restricted database functions and the public `project-covers` bucket. It can be rerun without replacing content. It is a bootstrap script; it does not add a CLI migration-history entry.
2. In the project root `.env`, configure `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Copy the server secret from Supabase's API keys settings. A legacy `service_role` key can instead be set as `SUPABASE_SERVICE_ROLE_KEY`. Never prefix either secret with `NEXT_PUBLIC_` or `VITE_`.
3. Keep your existing `ADMIN_PASSWORD_HASH`. If this is a fresh install, run `npm run admin:setup` to choose a password privately. The hash is saved in `.env`.
4. Run `npm run db:check`. It reads the tables, calls the leaderboard function, checks the cover bucket and confirms public table access is denied when a publishable key is available. It never prints credentials or private rows.
5. Restart `npm run dev`. `/api/health` must return `{"ok":true,"storage":"supabase"}`.

`SUPABASE_PUBLISHABLE_KEY` (or the supplied `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) is optional for the preflight. This app accesses the database through its backend; it does not put database credentials in browser code. The supplied `NEXT_PUBLIC_SUPABASE_URL` is also accepted as an alias, although `SUPABASE_URL` is clearer here.

Existing offline data is not silently imported or overwritten. If you have edited `data/content.json`, local cover images, or local player accounts, migrate those before switching environments. A fresh database serves the built-in portfolio content until the first admin save. Guest game history belongs to the browser and origin; localhost history does not move to the live domain.

## Vercel project settings

Import this project folder with **Vite** as the framework. `vercel.json` supplies the build command, `dist` output directory, API function routing and `/admin` fallback. Node.js **24.x** is selected in `package.json` and `.nvmrc`.

Add these environment variables in Vercel for the environments you intend to deploy:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | `https://atgcmosflopbkmfkqrxs.supabase.co` |
| `SUPABASE_SECRET_KEY` | Your server-only secret from the local `.env` |
| `ADMIN_PASSWORD_HASH` | The existing complete hash from the local `.env` |
| `DATA_BACKEND` | `supabase` |
| `RESEND_API_KEY` | Optional. From resend.com, so each project request is emailed to you with its PDF brief |
| `NOTIFY_EMAIL` | Optional. Where requests go (defaults to the email in your profile) |
| `NOTIFY_FROM` | Optional. A sender on a domain you verified in Resend, e.g. `Projects <hello@yourdomain.com>` |

Do not set `DATA_DIR`, `PORT`, `HOST`, or a public-prefixed secret on Vercel. `.env` is ignored and will not automatically become Vercel environment variables. Keep preview environments pointed at a separate Supabase project if preview edits should not affect live content. If you change the Supabase project, also update the `connect-src` origin in `vercel.json`.

The admin and player sign-ins use the existing application accounts and secure cookies, backed by Supabase tables. They are separate from Supabase Auth, so OAuth redirect URL setup and `@supabase/ssr` are not needed. Password reset/email recovery is not implemented.

## Project builder (/build)

Visitors design a website, store, platform or app at `/build`, see a live preview and estimate, and send you the brief. Requests are saved in the `portfolio_requests` table (rerun `supabase/setup.sql` once to create it) and appear under **Requests** in the admin studio; prices are edited under **Pricing** and saved with the rest of your content.

Email is optional. Without `RESEND_API_KEY` requests are still saved. With Resend's test sender (`onboarding@resend.dev`, the default when `NOTIFY_FROM` is unset) Resend only delivers to the email address of your Resend account, so set `NOTIFY_EMAIL` to that address or verify your own domain and set `NOTIFY_FROM`.

## Verify before sharing

```sh
nvm use
npm ci
npm test
npm run build
npm run db:check
```

After deploying:

- Confirm `/api/health` returns `storage: "supabase"` and `/admin` loads directly after a refresh.
- Sign into the studio, upload a cover, save it, and reload. Test an animated GIF as well as a screenshot.
- Start a signed-in game, wait for the countdown, finish it and check the shared leaderboard. A second browser should see the same rankings; its guest history remains separate.
- Check desktop and mobile layout, walking, steering, and asset loading on the real device.

Uploads accept PNG, JPEG, GIF and WebP up to 8 MB. The API issues a signed upload URL only to an authenticated admin. The browser sends the bytes directly to Storage, then the API validates the uploaded file and returns its public URL. Replacement creates a new URL, preserving existing images. Unused uploads can be reviewed in Storage and removed manually once no saved project references them.

The game server checks ownership, elapsed time, expiry and score ranges. These are casual client-reported scores, not an authoritative competitive game system.
