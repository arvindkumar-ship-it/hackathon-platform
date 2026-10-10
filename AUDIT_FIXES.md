# Upload acceptance policy

Repair branch: `fix/internship-audit-20261010`. Changes are scoped to audit findings; no deployment or live provider action is included.

## Changed

The placeholder content scanner now rejects uploads rather than declaring unscanned content safe. Files can only be replaced while a submission is DRAFT; the testing-only SUBMITTED bypass was removed. Restored the missing notifications dependency in auth test fixtures and added a scanner regression.

## Verification

`pnpm --filter @hackathon/api exec jest --runInBand`

Commands are entry points, not a claim that every live integration was executed. See the repair bundle for actual results.

## Setup and remaining evidence

The API has 47 passing local unit tests. They do not prove live storage scanning, Prisma transaction races, email delivery or participant-to-admin browser journeys. Configure a real ContentScanner implementation before accepting assets; the placeholder intentionally blocks acceptance. Live PostgreSQL/Redis/S3 integration and deployment checks remain open. UI-Verse is the companion frontend, not a separate full-stack application.
