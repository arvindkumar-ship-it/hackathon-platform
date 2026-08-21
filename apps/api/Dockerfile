# syntax=docker/dockerfile:1

##### Stage 1: deps — install full workspace deps with lockfile #####
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile

##### Stage 2: build — generate prisma client, compile nest #####
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate
WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api ./apps/api

WORKDIR /repo/apps/api
RUN pnpm exec prisma generate
RUN pnpm run build

##### Stage 3: runtime — minimal production image #####
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/prisma.config.ts ./apps/api/prisma.config.ts

WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["node", "dist/src/main"]