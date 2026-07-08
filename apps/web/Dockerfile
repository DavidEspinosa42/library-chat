# Web build → static assets served by nginx (docs/01). Build context is the repo
# ROOT (pnpm workspace + shared package). nginx proxies /api to the api service,
# same-origin, so the auth cookie flows without CORS.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY evals/package.json evals/
RUN pnpm install --frozen-lockfile --filter=@library-chat/web...
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/
RUN pnpm --filter=@library-chat/web build

FROM nginx:alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
