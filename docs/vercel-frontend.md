# Vercel frontend (Accepted Admissions)

Host the Vite portal on Vercel. The Express API stays on Railway. The browser keeps calling same-origin `/api/...`; Vercel rewrites those requests to Railway.

Do not put Clerk secrets, Stripe secrets, or Railway API env in the Vercel project. See `docs/accepted-admissions-provisioning.md` for portal access (owner-only; this file does not change invites).

## Vercel project settings

Create one Vercel project pointed at this Git repository. Use these settings (also encoded in the root `vercel.json`):

| Setting | Value |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | `.` (repository root — leave the default) |
| Install Command | `pnpm install` |
| Build Command | `pnpm --filter @workspace/accepted-admissions run build` |
| Output Directory | `artifacts/accepted-admissions/dist/public` |
| Node.js | 22.x or 24.x (Vite 7). Do not switch the install to npm; the root `preinstall` script rejects non-pnpm clients. |

Root Directory must stay the **repository root**. The portal depends on workspace package `@workspace/api-client-react` (`workspace:*`) and a Vite alias into `attached_assets/`. Setting Root Directory to `artifacts/accepted-admissions` will not install those workspace deps unless you add extra “include files outside of Root Directory” wiring and an install that still runs `pnpm install` from the repo root. Prefer `.` so `vercel.json` at the repo root is the config Vercel reads.

There is no root `vite.config.ts`. The Vite config lives in `artifacts/accepted-admissions/vite.config.ts` and is invoked by the filtered build command above. If the Vite preset looks confused because the config is not at the repo root, switch Framework to Other and keep the same Install / Build / Output overrides.

## Environment variables (Vercel)

Set these on the Vercel project (Production; Preview too if you deploy preview URLs):

| Name | Required | When it is read |
| --- | --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | **Yes** | Vite build (`import.meta.env`). The app throws at runtime if it is missing. |
| `PUBLIC_SITE_ORIGIN` | No | Vite build (`vite.config.ts`). Canonical / Open Graph / sitemap / robots. Defaults to `https://www.acceptedadmissions.org`. For a private Vercel test host you may set this to the Vercel HTTPS origin. |
| `BASE_PATH` | No | Vite build. Leave unset (defaults to `/`). |

Optional: `VITE_CLERK_PROXY_URL` (for example `/api/__clerk`) if Clerk Frontend API should go through the same `/api` rewrite. Leave unset unless that proxy is already configured in Clerk and on Railway.

Do not set `VITE_API_URL`. The client uses `setBaseUrl` from Vite `BASE_URL` and relative `/api/...` paths.

## `vercel.json` routing

Rewrites are listed so `/api` is proxied **before** the SPA fallback:

1. `/api/:path*` → `https://accepted-admissions-platform-production.up.railway.app/api/:path*`
   - Path after `/api/` is preserved, including nested segments.
   - Query string is preserved by Vercel.
   - Method is preserved (this is a rewrite, not a redirect).
   - Request headers are forwarded as Vercel allows. `Host` becomes the Railway host; `X-Forwarded-Host` / `X-Forwarded-Proto` / `X-Forwarded-For` carry the Vercel public origin.
2. Non-file routes that are **not** under `/api/` → `/index.html` (Vite SPA). Static files in the output directory (hashed assets, `favicon.svg`, `robots.txt`, `sitemap.xml`) are served from the filesystem first and are not rewritten.

`Cache-Control: private, no-store` is applied to `/api/*` so authenticated JSON is not cached at the CDN.

## Railway API: CORS, cookies, `APP_ORIGIN`

The portal does not call Railway from the browser. `fetch('/api/...')` is same-origin on the Vercel host; Vercel’s edge proxies to Railway. Because of that:

- **CORS is not required** for these browser calls. `artifacts/api-server` depends on `cors` but does not enable a CORS middleware or origin allowlist. Do not add a CORS allowlist unless you later call Railway **cross-origin** from the browser.
- **Cookie / Clerk session** stays first-party on the Vercel host. `customFetch` uses default `fetch` credentials (`same-origin`). `@clerk/express` `clerkMiddleware` reads the Clerk session from those forwarded cookies (this app does not store bearer tokens in `localStorage`).
- Railway already prefers `X-Forwarded-Host` for the Clerk frontend proxy host (`getClerkProxyHost`). Vercel external rewrites set that header to the Vercel hostname, which is what Clerk proxy URL generation needs.

**You must set `APP_ORIGIN` on Railway** to the Vercel HTTPS origin once it exists (for example `https://<project>.vercel.app`). Do not invent a production custom domain here. `APP_ORIGIN` is used for Stripe Checkout success/cancel URLs and, when `GOOGLE_CALENDAR_REDIRECT_URI` is unset, the Google Calendar OAuth callback (`${APP_ORIGIN}/api/calendar/oauth/callback`). Those paths then hit Vercel `/api/...` and are rewritten to Railway.

Until `APP_ORIGIN` is that Vercel URL, hosted payment redirects and Calendar OAuth return URLs will not land on this frontend.

Also add the same Vercel HTTPS origin in the Clerk Dashboard as an allowed/authorized domain (and in Google’s OAuth redirect URIs if tutors use Calendar). Stripe webhooks should continue to post **directly to Railway**, not through Vercel.

## Private test portal

Use Vercel Deployment Protection (Vercel Authentication or a password) on the project so the test host is not public. That is a dashboard setting, not repo config.
