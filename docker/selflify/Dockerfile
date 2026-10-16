FROM caddy:builder AS caddy-builder

RUN xcaddy build \
    --with github.com/caddy-dns/cloudflare@v0.2.4

FROM node:20-alpine AS base

WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache bash jq

FROM base AS deps

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases ./.yarn/releases
COPY packages/selflify-cli/package.json ./packages/selflify-cli/package.json
RUN node .yarn/releases/yarn-4.13.0.cjs install --immutable

FROM deps AS dev

COPY --from=caddy-builder /usr/bin/caddy /usr/bin/caddy
CMD ["node", ".yarn/releases/yarn-4.13.0.cjs", "dev", "--hostname", "0.0.0.0", "--port", "3000"]

FROM deps AS builder

COPY . .
RUN node .yarn/releases/yarn-4.13.0.cjs build
RUN node .yarn/releases/yarn-4.13.0.cjs upload:build

FROM deps AS upload-builder
COPY . .
RUN node .yarn/releases/yarn-4.13.0.cjs upload:build

FROM base AS upload
RUN mkdir /state && chown 10001:0 /state
COPY --from=upload-builder /workspace/dist/upload/upload.js /workspace/upload.cjs
USER 10001:0
CMD ["node", "/workspace/upload.cjs"]

FROM base AS deploy-init
COPY --from=caddy-builder /usr/bin/caddy /usr/bin/caddy
COPY --from=upload-builder /workspace/dist/upload/prepare-deploy.js /workspace/prepare-deploy.cjs
CMD ["node", "/workspace/prepare-deploy.cjs"]

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
