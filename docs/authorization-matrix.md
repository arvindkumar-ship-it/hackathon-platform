# Authorization Matrix — DesignArena API

Generated for Phase 11. Source of truth: actual controller code as of Phase 7 fix (build-verified).

Legend: 🔓 Public (no guard) | 🔐 Any authenticated user | 🔒 Role-restricted

## Auth (`/auth`)
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/auth/login` | 🔓 Public | Credentials-based, rate-limited (see Task B) |
| POST | `/auth/refresh` | 🔓 Public | Cookie-based, rate-limited (see Task B) |
| POST | `/auth/logout` | 🔓 Public | Cookie-based, idempotent no-op if no token |
| GET | `/auth/me` | 🔐 Any authenticated | `JwtAuthGuard` |
| GET | `/auth/admin-check` | 🔒 ADMIN, SUPER_ADMIN | Test/diagnostic endpoint |

## Events (`/events`)
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/events` | 🔒 ADMIN, SUPER_ADMIN | |
| GET | `/events/public` | 🔓 Public | Excludes DRAFT/ARCHIVED, safe field projection |
| GET | `/events/public/:slug` | 🔓 Public | Same as above |
| GET | `/events` | ⚠️ **NO GUARD** | **Gap: returns ALL events including DRAFT, unauthenticated.** Not fixed in Phase 11 — flagged only, per default posture (see Open Question 5, unresolved). |
| GET | `/events/:id` | ⚠️ **NO GUARD** | **Same gap** — any single event including DRAFT is fully readable unauthenticated. Also: no `UuidParamPipe` validation on `:id` here (inconsistent with Teams/Submissions/Judging/Leaderboard controllers, which all validate). |
| PATCH | `/events/:id` | 🔒 ADMIN, SUPER_ADMIN | |
| PATCH | `/events/:id/status` | 🔒 ADMIN, SUPER_ADMIN | Added in Phase 7 fix. Enforces `EVENT_STATUS_TRANSITIONS` map + leaderboard-snapshot preconditions. |
| DELETE | `/events/:id` | 🔒 SUPER_ADMIN only | Hard delete, cascades per schema |

## Teams (controller-level `JwtAuthGuard`)
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/events/:eventId/teams` | 🔒 PARTICIPANT | |
| GET | `/events/:eventId/teams` | 🔐 Any authenticated | Ownership/visibility logic (if any) is inside `TeamsService`, not verified in this audit |
| GET | `/teams/:teamId` | 🔐 Any authenticated | Same — service-level check not verified |
| PATCH | `/teams/:teamId` | 🔒 PARTICIPANT | Presumed leader-only inside service — not verified |
| DELETE | `/teams/:teamId/members/:userId` | 🔒 PARTICIPANT | Presumed leader-only inside service — not verified |

## Submissions (controller-level `JwtAuthGuard`)
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/events/:eventId/submissions` | 🔒 PARTICIPANT | |
| GET | `/events/:eventId/submissions/me` | 🔒 PARTICIPANT | |
| GET | `/submissions/:submissionId` | 🔐 Any authenticated | Ownership check inside `SubmissionsService.getById` — not verified in this audit |
| PATCH | `/submissions/:submissionId` | 🔒 PARTICIPANT | Leader-only enforced in `UploadsService`-style pattern presumed — verify in `SubmissionsService` |
| POST | `/submissions/:submissionId/upload-intent` | 🔒 PARTICIPANT | Leader-only, DRAFT-only enforced in `UploadsService` ✅ verified |
| POST | `/submissions/:submissionId/assets/:assetId/complete` | 🔒 PARTICIPANT | Leader-only, DRAFT-only ✅ verified |
| DELETE | `/submissions/:submissionId/assets/:assetId` | 🔒 PARTICIPANT | Leader-only, DRAFT-only ✅ verified |
| GET | `/submissions/:submissionId/assets/:assetId/download-url` | 🔐 Any authenticated | Team-member-or-admin check ✅ verified inside `UploadsService.getDownloadUrl` |
| POST | `/submissions/:submissionId/submit` | 🔒 PARTICIPANT | |

## Judging (controller-level `JwtAuthGuard`)
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/admin/events/:eventId/rubric` | 🔒 ADMIN, SUPER_ADMIN | Weight-sum-to-100 validated |
| GET | `/events/:eventId/rubric` | 🔐 Any authenticated | |
| PATCH | `/admin/rubric/:rubricId` | 🔒 ADMIN, SUPER_ADMIN | DRAFT-only |
| POST | `/admin/rubric/:rubricId/publish` | 🔒 ADMIN, SUPER_ADMIN | Requires ≥1 criterion, weight-sum validated |
| POST | `/admin/events/:eventId/assignments` | 🔒 ADMIN, SUPER_ADMIN | Requires published rubric + active judge |
| GET | `/admin/events/:eventId/assignments` | 🔒 ADMIN, SUPER_ADMIN | |
| GET | `/judge/assignments` | 🔒 JUDGE | Own assignments only |
| GET | `/judge/assignments/:assignmentId/submission` | 🔒 JUDGE | Ownership enforced ✅ verified |
| POST | `/judge/assignments/:assignmentId/evaluation` | 🔒 JUDGE | Freeze-state + rubric-published guards ✅ verified |
| POST | `/judge/evaluations/:evaluationId/submit` | 🔒 JUDGE | All-criteria-scored + freeze-state guards ✅ verified |

## Leaderboard (fixed in Phase 7 work)
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/events/:eventId/leaderboard` | 🔓 Public | Service-gated: only visible when event is WINNERS_REVEALED or COMPLETED and snapshot is PUBLISHED. Response excludes judge identity/notes/storage keys per spec. |
| GET | `/admin/events/:eventId/leaderboard/preview` | 🔒 ADMIN, SUPER_ADMIN | |
| POST | `/admin/events/:eventId/leaderboard/recalculate` | 🔒 ADMIN, SUPER_ADMIN | |
| POST | `/admin/events/:eventId/leaderboard/freeze` | 🔒 ADMIN, SUPER_ADMIN | |
| POST | `/admin/events/:eventId/winners/reveal` | 🔒 ADMIN, SUPER_ADMIN | |

## Admin (controller-level `JwtAuthGuard` + `RolesGuard(ADMIN, SUPER_ADMIN)`)
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/admin/overview` | 🔒 ADMIN, SUPER_ADMIN | |
| GET | `/admin/users` | 🔒 ADMIN, SUPER_ADMIN | |
| PATCH | `/admin/users/:userId/status` | 🔒 ADMIN, SUPER_ADMIN | Audit-logged (via `AuditService`, IP/UA/requestId captured) |
| PATCH | `/admin/users/:userId/role` | 🔒 **SUPER_ADMIN only** | Correctly overridden tighter than controller default — role escalation is the most sensitive action, good pattern |
| GET | `/admin/judges` | 🔒 ADMIN, SUPER_ADMIN | |
| GET | `/admin/notifications/health` | 🔒 ADMIN, SUPER_ADMIN | |

## Invitations (controller-level `JwtAuthGuard`)
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/teams/:teamId/invitations` | 🔒 PARTICIPANT | |
| POST | `/invitations/:token/accept` | 🔐 Any authenticated | Token itself is the real access control (hashed, expiring) |
| GET | `/invitations` | 🔐 Any authenticated | Own invitations only, presumed — not verified |

## Health (`/health`)
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/health`, `/health/live`, `/health/ready` | 🔓 Public | Intentional — required for load balancer / orchestrator probes |

## Audit (`/audit`)
| — | — | — | **Not yet reviewed — `audit.controller.ts` contents were never pasted into this project's working session. Flag for follow-up before treating this matrix as fully complete.** |

---

## Summary of gaps found (not fixed, documented only per current scope agreement)
1. `GET /events` and `GET /events/:id` — no auth guard, leaks DRAFT events. **Needs explicit decision from project owner.**
2. `EventsController` doesn't use `UuidParamPipe` on `:id`/`:slug` params, unlike every other controller. Minor input-validation inconsistency.
3. `AuditController` endpoints never reviewed — unknown access level.
4. Several service-level ownership checks (Teams, some Submissions/Invitations paths) were not independently verified in this audit — flagged as "presumed correct, not confirmed" above.