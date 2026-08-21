# Security Baseline — DesignArena API
Snapshot as of Phase 11 work. Update this file whenever a security-relevant control changes.

## Transport / HTTP layer
- **Helmet** active globally (`crossOriginResourcePolicy: cross-origin`). Default Helmet CSP is currently in effect (not customized) — no explicit `contentSecurityPolicy` directives set.
- **CORS**: locked to a single configured origin (`WEB_URL`), credentials allowed, explicit method/header allowlist (`Content-Type`, `Authorization`, `X-Request-Id`).
- **Global rate limiting**: `@nestjs/throttler`, 100 requests / 60s per client (default throttler), applied globally via `APP_GUARD`.
- **Per-route rate limiting** (added Phase 11 Task B): `POST /auth/login` 5/60s, `POST /auth/refresh` 20/60s, `POST /submissions/:id/upload-intent` 10/60s.
- **Global input validation**: `class-validator` `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true` — unknown/extra body fields are rejected outright.
- `express-rate-limit` is an installed but **unused** dependency — intentionally not wired up to avoid a redundant second rate-limiter; left in `package.json` untouched pending explicit decision to remove it.

## Authentication
- Passwords hashed with **argon2id**, cost params configurable via env (`ARGON2_MEMORY_COST`, `ARGON2_TIME_COST`, `ARGON2_PARALLELISM`).
- **Access tokens**: short-lived JWT (`JWT_ACCESS_TTL`, default 15m), signed with `JWT_ACCESS_SECRET`, issuer/audience claims enforced (`JWT_ISSUER`/`JWT_AUDIENCE`), `type: 'access'` claim checked to prevent refresh-token misuse as access token.
- **Refresh tokens**: opaque random 64-byte value, never stored raw — only SHA-256 hash persisted (`RefreshToken.tokenHash`, unique). Delivered via **httpOnly cookie** scoped to `/api/v1/auth` path, `secure`/`sameSite`/`domain` configurable per environment.
- **Rotation**: every refresh revokes the old token and issues a new one atomically inside a single Prisma transaction — no window where a stale token could be reused without the new one existing.
- **Reuse/theft detection**: presenting an already-revoked or expired refresh token triggers `revokeAllUserTokens()` — the entire session family for that user is invalidated, not just the one token.
- User active-status is re-checked from DB on every access-token validation (`JwtStrategy.validate` → `getUserById`), so deactivating a user takes effect immediately even on already-issued tokens.

## Authorization
- Role-based via `@Roles()` decorator + `RolesGuard`, standard NestJS Reflector pattern. See `docs/authorization-matrix.md` for the full endpoint-by-endpoint breakdown and known gaps.
- Role escalation (`PATCH /admin/users/:userId/role`) is restricted tighter than the rest of the admin surface — SUPER_ADMIN only, correctly.

## CSRF
- **No dedicated CSRF protection currently.** Refresh-token cookie is `httpOnly` + configurable `SameSite`, which provides partial mitigation but is not a complete substitute for a CSRF token defense-in-depth layer, especially if `AUTH_COOKIE_SAME_SITE` is ever misconfigured to `none` in a given environment.
- **Status: open decision pending, not yet implemented.** See Phase 11 execution plan, Open Question 2.

## File uploads
- Per-`AssetType` whitelist: extension + MIME type + max byte size (`upload-policy.ts`).
- Ownership enforced: only the team leader can create upload intents / complete / delete assets, and only while the submission is still `DRAFT`.
- Presigned URLs are short-TTL (`UPLOAD_INTENT_TTL_SECONDS` / `DOWNLOAD_URL_TTL_SECONDS`, both configurable, default 600s/300s).
- Post-upload integrity check: `HeadObjectCommand` verifies actual `ContentLength`/`ContentType` match what was declared at intent-creation time; mismatches are marked `REJECTED`.
- Download access gated by team-membership or admin role, verified server-side.
- **Gap: no malware/content scanning.** `AssetStatus.SCANNING` enum value exists in schema but is never used — assets go straight from `PENDING` to `SAFE` after the head-check, with no scan step. **Status: open decision pending.** See Phase 11 execution plan, Open Question 3.

## Audit logging
- `AuditLog` model (Phase 8): `eventType`, `severity`, `outcome`, `actorId`, `targetType`, `targetId`, `eventId`, `requestId`, `ipAddress`, `userAgent`, `metadata`, `createdAt` — indexed on multiple query patterns.
- `AuditService.record()` sanitizes metadata before persisting — hard-blocks a set of known-sensitive keys (`password`, `passwordHash`, `accessToken`, `refreshToken`, `token`, `secret`, `apiKey`, `authorization`, `signedUrl`, `uploadUrl`), truncates strings, strips IPv6-mapped-IPv4 prefix from IP addresses.
- Currently wired into admin status/role change endpoints (captures IP/UA/requestId). Not yet confirmed whether it's wired into login failures — recommend verifying/adding `LOGIN_FAILED` audit events on failed login attempts if not already present (the `AuditAction` enum already has a `LOGIN_FAILED` value defined).

## Secrets handling
- All secrets sourced from environment variables (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, DB/Redis URLs). `.env.example` documents required keys without real values.
- Dev-only `docker-compose.dev.yml` has hardcoded dev credentials (`hackathon_dev_password`, `minioadmin`/`minioadmin`) — acceptable for local dev, **must not be reused in any production compose file** (see Phase 11 Task H).

## Known open gaps (tracked, not yet resolved)
| Gap | Severity | Status |
|---|---|---|
| `GET /events`, `GET /events/:id` unauthenticated, leaks DRAFT events | Medium | Documented, fix pending owner decision |
| No CSRF token layer | Medium | Pending approach decision |
| No upload malware scanning | Low-Medium (mitigated by strict MIME/extension whitelist) | Pending approach decision |
| No metrics endpoint | Low (operational, not a vulnerability) | Planned, Task F |
| No Redis/Storage health checks | Low (operational) | Planned, Task E |
| No production docker-compose | Medium (deployment risk) | Planned, Task H |
| No automated DB backups | High (data-loss risk) | See `docs/backup-strategy.md`, Task A |