FROM caddy:builder AS builder

RUN xcaddy build \
    --with github.com/caddy-dns/cloudflare@v0.2.4

FROM caddy:latest

COPY --from=builder /usr/bin/caddy /usr/bin/caddy
