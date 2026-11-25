# ---------- build ----------
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app

# Rewrites are compiled into the build, so the internal API URL is a build arg.
ARG API_URL=http://api:4000
ENV API_URL=$API_URL
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @tabletap/shared build && pnpm --filter @tabletap/web build

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime
RUN corepack enable
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/web/.next apps/web/.next
COPY --from=build /app/apps/web/public apps/web/public
COPY --from=build /app/apps/web/package.json apps/web/package.json
COPY --from=build /app/apps/web/next.config.ts apps/web/next.config.ts
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/package.json package.json

WORKDIR /app/apps/web
EXPOSE 3100
CMD ["pnpm", "start"]
