\# Deployment Environment Checklist



Source of truth for every env var the production stack needs. Base this on `apps/api/.env.example`, confirmed current as of this checklist. Do not invent new vars beyond what's listed here without re-checking source code first (see note on Redis below — that mismatch was verified against `src/health/indicators/redis.health.ts` and `src/jobs/jobs.module.ts` before this doc was written).



\## How to use this

1\. Copy this list into a real `.env` file at the repo root (never commit it).

2\. Fill every value marked \*\*MUST CHANGE\*\*.

3\. Run `docker compose -f docker-compose.prod.yml up -d --build`.



\---



\## App

| Var | Dev default | Prod guidance |

|---|---|---|

| `NODE\_ENV` | development | \*\*MUST CHANGE\*\* → `production` |

| `PORT` | 4000 | 4000 (internal container port, fine as-is) |

| `API\_PREFIX` | api/v1 | keep as-is |

| `WEB\_URL` | http://localhost:3000 | \*\*MUST CHANGE\*\* → real public web URL (for CORS/cookie domain logic) |



\## Database

| Var | Dev default | Prod guidance |

|---|---|---|

| `DATABASE\_URL` | postgres://hackathon:hackathon\_dev\_password@localhost:5432/hackathon | \*\*MUST CHANGE\*\* — use strong password, and host must be `postgres` (the compose service name), not `localhost` |

| `POSTGRES\_USER` | \*(not in .env.example — new for prod compose)\* | \*\*NEW, MUST SET\*\* — must match the user embedded in `DATABASE\_URL` |

| `POSTGRES\_PASSWORD` | \*(not in .env.example — new for prod compose)\* | \*\*NEW, MUST SET\*\* — must match the password embedded in `DATABASE\_URL` |

| `POSTGRES\_DB` | \*(not in .env.example — new for prod compose)\* | \*\*NEW, MUST SET\*\* — must match the db name embedded in `DATABASE\_URL` |



\## Redis

> \*\*Verified this session against source\*\* (`redis.health.ts` + `jobs.module.ts`): the app reads `REDIS\_HOST` / `REDIS\_PORT` / `REDIS\_PASSWORD` separately. A `REDIS\_URL` var previously sat in `.env.example` but was never consumed anywhere in `src/` — it has been removed. Do not reintroduce a single `REDIS\_URL` var without re-adding equivalent parsing in code first.



| Var | Dev default | Prod guidance |

|---|---|---|

| `REDIS\_HOST` | localhost | in compose, overridden to `redis` (service name) — no action needed in `.env` |

| `REDIS\_PORT` | 6379 | keep as-is |

| `REDIS\_PASSWORD` | \*(empty)\* | \*\*MUST CHANGE\*\* → set a real password |



\## JWT / Auth

| Var | Dev default | Prod guidance |

|---|---|---|

| `JWT\_ACCESS\_SECRET` | \*(empty)\* | \*\*MUST CHANGE\*\* — generate with `openssl rand -hex 32`, never reuse dev value |

| `JWT\_REFRESH\_SECRET` | \*(empty)\* | \*\*MUST CHANGE\*\* — generate separately from access secret |

| `JWT\_ACCESS\_TTL` | 15m | keep as-is unless product requires otherwise |

| `JWT\_REFRESH\_TTL` | 7d | keep as-is |

| `JWT\_ISSUER` | designarena-api | keep as-is |

| `JWT\_AUDIENCE` | designarena-web | keep as-is |



\## Auth Cookie

| Var | Dev default | Prod guidance |

|---|---|---|

| `AUTH\_COOKIE\_NAME` | hackathon\_refresh | keep as-is |

| `AUTH\_COOKIE\_SECURE` | false | \*\*MUST CHANGE\*\* → `true` (requires HTTPS in prod) |

| `AUTH\_COOKIE\_SAME\_SITE` | lax | review — `strict` may be more appropriate in prod depending on cross-site flows |

| `AUTH\_COOKIE\_DOMAIN` | \*(empty)\* | \*\*MUST CHANGE\*\* → real prod domain, e.g. `.yourdomain.com` |



\## Password hashing (Argon2)

| Var | Dev default | Prod guidance |

|---|---|---|

| `ARGON2\_MEMORY\_COST` | 19456 | keep unless a security review says otherwise |

| `ARGON2\_TIME\_COST` | 2 | keep as-is |

| `ARGON2\_PARALLELISM` | 1 | keep as-is |



\## Storage (S3 / MinIO)

| Var | Dev default | Prod guidance |

|---|---|---|

| `STORAGE\_ENDPOINT` | http://localhost:9000 | in compose, overridden to `http://minio:9000` for container-to-container calls. \*\*If using real AWS S3 instead of self-hosted MinIO in prod, replace entirely\*\* with the AWS endpoint — not yet decided, flag as open question. |

| `STORAGE\_REGION` | us-east-1 | keep unless using real AWS in a different region |

| `STORAGE\_FORCE\_PATH\_STYLE` | true | keep `true` for MinIO; set `false` if switching to real AWS S3 |

| `STORAGE\_ACCESS\_KEY` | \*(empty)\* | \*\*MUST CHANGE\*\* — real MinIO root user or AWS access key |

| `STORAGE\_SECRET\_KEY` | \*(empty)\* | \*\*MUST CHANGE\*\* — real MinIO root password or AWS secret key |

| `STORAGE\_BUCKET` | hackathon-private | confirm bucket exists / gets created in prod MinIO before first deploy |

| `UPLOAD\_INTENT\_TTL\_SECONDS` | 600 | keep as-is |

| `DOWNLOAD\_URL\_TTL\_SECONDS` | 300 | keep as-is |



\---



\## Known open items (do not silently resolve — confirm with the team first)

\- \[ ] `GET /events` / `GET /events/:id` unauthenticated access — still an unresolved open question as of this checklist, unrelated to env vars but blocks a full "production ready" sign-off.

\- \[ ] `/metrics` endpoint should be restricted in production (noted in `docs/security-baseline.md`, not yet implemented).

\- \[ ] `apps/web/package.json` declares `packageManager: pnpm@11.21.0`, while the repo root `package.json` declares `pnpm@10.14.0` — the Docker build in this checklist pins `10.14.0` (matches root, matches locally verified `pnpm -v`). This inconsistency should be fixed at the source rather than worked around indefinitely.

\- \[ ] Decide: self-hosted MinIO in production, or migrate to real AWS S3? Current compose setup assumes MinIO continues into prod. If moving to S3, several storage vars above need review.

\- \[ ] No git / version control yet on this repo — strongly recommended before any production deploy.

