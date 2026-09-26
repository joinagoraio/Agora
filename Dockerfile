FROM node:22-bookworm-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.21.0 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ARG NEXT_PUBLIC_SUPABASE_URL=https://__AGORA_SUPABASE_URL_PLACEHOLDER__
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=__AGORA_SUPABASE_ANON_KEY_PLACEHOLDER__
ARG SUPABASE_SERVICE_ROLE_KEY=build-time-service-role-placeholder
ARG TOKEN_ENCRYPTION_KEY=build-time-token-encryption-key-32
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
ENV TOKEN_ENCRYPTION_KEY=$TOKEN_ENCRYPTION_KEY
ENV NODE_OPTIONS=--max-old-space-size=1536
ENV DOCKER_BUILD=1

RUN pnpm build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Must match the playwright version in package.json, or the PDF export looks for a browser build that is not there.
ARG PLAYWRIGHT_VERSION=1.56.1

RUN apt-get update \
  && apt-get install -y --no-install-recommends libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
  && npx -y "playwright@${PLAYWRIGHT_VERSION}" install --with-deps --only-shell chromium \
  && rm -rf /var/lib/apt/lists/* /root/.npm \
  && addgroup --system --gid 1001 agora \
  && adduser --system --uid 1001 --ingroup agora agora

COPY --from=builder /app/public ./public
COPY --from=builder --chown=agora:agora /app/.next/standalone ./
COPY --from=builder --chown=agora:agora /app/.next/static ./.next/static
COPY --chmod=755 docker-entrypoint.sh /docker-entrypoint.sh

USER agora
EXPOSE 3000
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
