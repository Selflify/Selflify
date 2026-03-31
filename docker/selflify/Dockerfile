FROM caddy:builder AS caddy-builder

RUN xcaddy build \
    --with github.com/caddy-dns/cloudflare@v0.2.4

FROM node:20-alpine AS base

WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
RUN apk add --no-cache bash jq

FROM base AS deps

COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

FROM deps AS dev

COPY --from=caddy-builder /usr/bin/caddy /usr/bin/caddy
CMD ["yarn", "dev", "--hostname", "0.0.0.0", "--port", "3000"]

FROM deps AS builder

COPY . .
RUN yarn build

FROM deps AS cleanup

COPY . .

FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=caddy-builder /usr/bin/caddy /usr/bin/caddy
COPY --from=builder /workspace/.next/standalone ./
COPY --from=builder /workspace/.next/static ./.next/static
COPY --from=builder /workspace/public ./public

EXPOSE 3000

CMD ["sh", "-lc", "unset HOSTNAME && node server.js"]
