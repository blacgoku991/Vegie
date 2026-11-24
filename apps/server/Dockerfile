# API + workers Vigie. Node exécute directement le TypeScript (type stripping, Node ≥ 22.18).
# Déploiement cible : hébergeur UE (ex. Scaleway Paris, OVHcloud), Postgres managé chiffré au repos.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Manifestes de tous les espaces de travail (requis par le lockfile), puis sources utiles.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/scanner/package.json apps/scanner/
COPY apps/console/package.json apps/console/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --omit=dev --workspace @vigie/server --no-audit --no-fund
COPY packages/shared packages/shared
COPY apps/server/src apps/server/src

USER node
EXPOSE 4000
# ROLE=api | worker | all : séparer l'API et les workers en production.
CMD ["node", "apps/server/src/index.ts"]
