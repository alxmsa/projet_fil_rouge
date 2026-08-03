# syntax=docker/dockerfile:1

# --- Étape 1 : dépendances de production uniquement -------------------------
# Image épinglée sur un digest de version précis (pas de `latest`), Alpine
# pour minimiser la surface et la taille finale.
FROM node:24.18.1-alpine3.24 AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# npm ci = install reproductible à partir du lockfile ; --omit=dev exclut
# jest/supertest/nodemon de l'image de prod (remplace l'ancien --only=production,
# déprécié depuis npm 7).
RUN npm ci --omit=dev

# --- Étape 2 : image d'exécution --------------------------------------------
FROM node:24.18.1-alpine3.24 AS runtime
ENV NODE_ENV=production
WORKDIR /app

# L'image officielle node:alpine fournit déjà un utilisateur non-root "node"
# (uid 1000) : pas besoin d'en recréer un, juste s'en servir.
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

USER node

EXPOSE 3000

# Vérifie que /health répond réellement, pas seulement que le process tourne.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/server.js"]
