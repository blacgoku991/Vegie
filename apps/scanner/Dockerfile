# Scanner isolé : image Playwright officielle (Chromium inclus, même version que le paquet).
# À déployer dans un conteneur dédié : aucun secret applicatif, aucun accès à la base,
# système de fichiers en lecture seule, sortie réseau vers Internet uniquement.
FROM mcr.microsoft.com/playwright:v1.65.1-noble

WORKDIR /app
ENV NODE_ENV=production PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY apps/scanner/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY apps/scanner/src ./src

# Utilisateur non root fourni par l'image Playwright.
USER pwuser
EXPOSE 4100
CMD ["node", "src/index.ts"]
