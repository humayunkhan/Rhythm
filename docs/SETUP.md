# Running and deploying Rhythm

Stack: React and Vite on Cloudflare Pages, a Hono API on Pages Functions, and Cloudflare D1 (SQLite). All libraries are open source. Only the optional Claude layer is a paid service.

## Run locally

Requires Node 24.

```bash
npm install
```

```bash
copy .dev.vars.example .dev.vars
```

Set `ADMIN_EMAIL` and `ADMIN_SETUP_CODE` in `.dev.vars` to test the admin portal.

```bash
npm run pages:dev
```

Open http://localhost:8788. The command builds the app, applies database migrations locally and serves everything.

```bash
npm test
```

## Deploy to Cloudflare

1. Create the database, then paste the printed id into `database_id` in `wrangler.toml`.

   ```bash
   npx wrangler d1 create rhythm
   ```

2. Apply the schema. Repeat this whenever a new file appears in `migrations/`, because Pages does not do it for you.

   ```bash
   npm run db:migrate:remote
   ```

3. In Cloudflare, go to **Workers & Pages > Create > Pages > Connect to Git** and choose this repository. Use build command `npm run build`, output directory `dist`, and set `NODE_VERSION` to `24`. Each push to the production branch then deploys.
4. In `wrangler.toml`, set `ADMIN_EMAIL` to your address. Add the secrets below under **Settings > Variables and Secrets**.

| Secret | Needed for |
| --- | --- |
| `SESSION_PEPPER` | Password hashing. A long random string. Set it before the first user signs up and never change it, or existing passwords stop working. |
| `ADMIN_SETUP_CODE` | Creating the admin account with email and password |
| `LLM_API_KEY` | The self-hosted LLM that powers the AI perfumer and AI brand concepts |
| `ANTHROPIC_API_KEY` | Claude instead, only used when `LLM_BASE_URL` is empty |
| `AI_KEY_SECRET` | Encrypting users' own AI keys. Optional, since `SESSION_PEPPER` is used without it. Never change it once users have saved keys. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Sign in with Google |
| `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | Sign in with Apple (needs a paid Apple Developer account) |
| `RESEND_API_KEY`, `MAIL_FROM` | Verification and password-reset emails |

Anything left unset is hidden in the UI or falls back to the built-in engine.

## Admin

Your account becomes admin in one of two ways:

- Sign in with Google or Apple using the `ADMIN_EMAIL` address.
- Create an account with that address and enter `ADMIN_SETUP_CODE` when asked.

Registering that address without the code is refused, because email ownership isn't proven at sign-up. The portal is at `/admin`.

Without `RESEND_API_KEY`, users can't reset passwords themselves. An admin can create a one-hour reset link from the Users tab.

## Sign-in providers

- **Google:** create an OAuth client in Google Cloud Console with redirect URI `https://YOUR_DOMAIN/api/auth/google/callback`.
- **Apple:** create a Services ID and a Sign in with Apple key, with return URL `https://YOUR_DOMAIN/api/auth/apple/callback`. Paste the `.p8` contents into `APPLE_PRIVATE_KEY`.

## The AI engine

- **Corpus:** `shared/data/` holds original notes and accords, plus publicly described perfume pyramids. Nothing was scraped, and real formulas are trade secrets, so none are included.
- **Training:** `npm run train` builds a co-occurrence matrix over the corpus, applies PPMI, and factorises it into 24-dimension note embeddings in `shared/generated/model.json`. Re-run it after changing the data, and commit the result.
- **Quality:** held-out AUC is about 0.67, where 0.5 is random. That is a modest result from a small corpus, and more licensed data is the most direct way to improve it.
- **Generation:** runs in the browser. It selects notes by learned affinity, mood, brief and the user's taste, then the balancer enforces dose ranges and indicative IFRA caps.
- **LLM layer:** by default `server/ai.ts` calls the OpenAI-compatible server at `LLM_BASE_URL` with model `LLM_MODEL` (both in `wrangler.toml`), asking for JSON that matches a schema and validating the reply. Set `LLM_MAX_TOKENS` to change the 16000 output cap. `LLM_THINKING = "off"` turns model thinking off through `chat_template_kwargs` (a vLLM and Qwen option), because with it on Qwen used the whole budget reasoning and never answered. Remove it for servers that reject unknown fields, such as OpenAI. Clear `LLM_BASE_URL` to use Claude instead.
- **Users' own keys:** in **My formulas > Your AI provider**, a user can save their own Claude key or any OpenAI-compatible server (OpenAI, OpenRouter, vLLM and so on). It is then used for their AI requests instead of the platform's, with its own daily cap, `AI_OWN_KEY_DAILY_LIMIT` (default 300). If their provider fails, they see why and the built-in engine answers; the platform key is never used as a fallback. Keys are AES-GCM encrypted with `AI_KEY_SECRET` (or `SESSION_PEPPER` if that is unset) and are never returned to the browser or shown to admins. Changing that secret makes saved keys unreadable, and users are asked to enter them again. The server only calls public HTTPS addresses.
- **Claude:** uses `claude-opus-5-5` by default, with server-side refusal fallbacks enabled. Change the model with `ANTHROPIC_MODEL`. Each user is limited to `AI_DAILY_LIMIT` calls a day, and engine limits are re-applied to everything it proposes.
- **Images:** catalogue and accord art is generated procedurally in the browser. It is not produced by an image model.

## Data

To add data, use **Admin > Catalogue** to import JSON. Only import data you have the right to use. Fragrantica's terms restrict scraping, so licensing is the safe route.

IFRA numbers in `shared/data/notes.ts` are indicative and were written from general knowledge. Have a qualified person verify them against the current IFRA Standards before relying on them. Many notes have no modelled limit and show "Verify".

## Caching

- Hashed assets: one year, immutable (`public/_headers`), and cached by a service worker (`public/sw.js`).
- Catalogue data and the engine ship inside the bundle, so browsing makes no database calls after page load.
- Public API config and catalogue overrides: edge-cached for five minutes. Imported data can take that long to appear.
- User data is never cached.
