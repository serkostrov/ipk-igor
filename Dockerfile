# Dokploy / production image: build Vite SPA, serve with nginx.
#
# VITE_* must be available at CONTAINER START (Dokploy → Environment).
# Vite bakes import.meta.env at build time, but docker-entrypoint.sh writes
# /env.js from runtime env so Environment vars work without rebuild.
# Build Arguments still work if you prefer baking values into the image.

# ─── build ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
# Skip lifecycle scripts (prepare = format+lint) — build only what we need.
RUN npm ci --ignore-scripts

COPY . .

# Optional: bake values into the bundle (runtime /env.js still overrides).
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_ANON_KEY=
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

# ─── runtime ───────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
COPY --from=build /app/dist /usr/share/nginx/html

ENV VITE_SUPABASE_URL= \
    VITE_SUPABASE_ANON_KEY=

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
