# ---------------------------------------------------------------------------
# WhatsApp Ads System — imagen Docker multi-stage
# Stage 1: compila el frontend Angular (production)
# Stage 2: imagen final con el backend Node.js (server.js) + app compilada
# ---------------------------------------------------------------------------

# ---- Build: dependencias + compilación de Angular -------------------------
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build -- --configuration production

# ---- Runtime: backend Node.js --------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Solo dependencias de producción (dotenv, pg, ws)
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

# Backend y módulos en tiempo de ejecución
COPY server.js ./
COPY providers ./providers
COPY security ./security

# Frontend compilado (dist/whatsapp-ads-angular/browser)
COPY --from=build /app/dist ./dist

# Directorio de runtime (data/setup.json) — se monta como volumen
RUN mkdir -p /app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/setup/status || exit 1

CMD ["node", "server.js"]
