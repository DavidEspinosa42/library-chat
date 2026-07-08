# Multi-stage build for the API (docs/01). Build context is the repo ROOT so the
# pnpm workspace and the shared package (consumed as TS source) are available.
# The app runs TypeScript directly via tsx — matching the dev/start scripts, no
# separate compile step.
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

# deps: install only the API and its workspace dependency (shared), skipping the
# web/evals toolchains. Manifests for every workspace package are needed so the
# frozen lockfile resolves.
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY evals/package.json evals/
RUN pnpm install --frozen-lockfile --filter=@library-chat/api...

# runner: node_modules from deps + the actual source. Migrations run at start,
# then the server boots (listens on 0.0.0.0 — see server.ts).
FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app /app
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["sh", "-c", "pnpm run db:migrate && pnpm start"]
