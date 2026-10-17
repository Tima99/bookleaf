# Deployment

> No live deployment was performed from this workspace (the repository owner asked for all
> work to stay local). These are the exact steps to deploy it.

## Topology

| Component            | Suggested host               | Notes                                                                               |
| -------------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| `apps/web` (Next.js) | Vercel                       | Root directory `apps/web`; build `pnpm turbo run build --filter=@bookleaf/web`      |
| `apps/api` (Express) | Render / Railway web service | Single instance (in-process SSE + rate limits); long-lived HTTP connections allowed |
| MongoDB              | MongoDB Atlas (M0+)          | Allow the API's egress IPs                                                          |

## API environment (`apps/api`)

| Variable                                                        | Required      | Example / notes                                                                |
| --------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------ |
| `NODE_ENV`                                                      | yes           | `production`                                                                   |
| `PORT`                                                          | host-provided | `4000`                                                                         |
| `MONGODB_URI`                                                   | yes           | `mongodb+srv://…/bookleaf`                                                     |
| `JWT_SECRET`                                                    | yes           | ≥ 32 random chars                                                              |
| `SESSION_TTL_HOURS`                                             | no            | `8`                                                                            |
| `CORS_ORIGINS`                                                  | yes           | `https://bookleaf-support.vercel.app`                                          |
| `COOKIE_SAMESITE`                                               | yes           | `none` when web and API are on different sites; `lax` if on sibling subdomains |
| `COOKIE_SECURE`                                                 | yes           | `true`                                                                         |
| `COOKIE_DOMAIN`                                                 | no            | e.g. `.example.com` for sibling subdomains                                     |
| `TRUST_PROXY`                                                   | yes on PaaS   | `1`                                                                            |
| `AI_PROVIDER`                                                   | no            | `anthropic` (default) / `openai` / `none`                                      |
| `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`                         | optional      | empty → manual mode                                                            |
| `AI_TRIAGE_MODEL`, `AI_DRAFT_MODEL`                             | no            | override defaults                                                              |
| `AI_TRIAGE_TIMEOUT_MS`, `AI_DRAFT_TIMEOUT_MS`, `AI_MAX_RETRIES` | no            | `20000`, `60000`, `1`                                                          |
| `LOG_LEVEL`                                                     | no            | `info`                                                                         |

Build & start (Render):

```bash
# Build command
corepack enable && pnpm install --frozen-lockfile && pnpm turbo run build --filter=@bookleaf/api
# Start command
node apps/api/dist/server.js
# Health check path
/health/ready
```

## Web environment (`apps/web`)

| Variable                | Example                                                 |
| ----------------------- | ------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`   | `https://bookleaf-api.onrender.com`                     |
| `NEXT_PUBLIC_DEMO_MODE` | `true` to show demo-account shortcuts on the login page |

## Seeding the deployed database

The seed never runs automatically. From a trusted machine:

```bash
cd apps/api
MONGODB_URI="mongodb+srv://…" NODE_ENV=production \
SEED_AUTHOR_PASSWORD='<demo author password>' SEED_ADMIN_PASSWORD='<demo admin password>' \
pnpm seed --file ../../data/bookleaf_sample_data.json
```

In production the seed refuses to run without explicit passwords. It is idempotent —
re-running updates authors/books in place and never duplicates tickets or resets passwords.

## Post-deploy checklist

1. `GET /health/ready` → `{"status":"ready"}`.
2. Sign in as an author → My Books shows the dataset; create a ticket.
3. Sign in as an admin in another browser → the ticket appears without refresh; open it,
   check triage, generate/edit a draft, send → the author sees it live.
4. If cookies don't stick across sites, verify `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`,
   `CORS_ORIGINS` matches the web origin exactly, and `TRUST_PROXY=1`.
5. Make sure the host doesn't buffer `text/event-stream` (the API sends `X-Accel-Buffering: no`).

## Scaling notes

To run more than one API instance: move the event bus to Redis pub/sub (or MongoDB change
streams), rate-limit stores to Redis, and background triage to a durable queue. Each is
behind an interface (`TicketEventBus`, `createRateLimiters`, `BackgroundJobs`).
