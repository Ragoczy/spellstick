# Spellstick: the built browser game plus the small Discord login server, in one container.
# Built and pushed by GitHub Actions; runs on Azure Container Apps (see infra/README.md).

# ---- Build: compile the game and the server ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The git SHA shown in the corner of the game (vite.config.ts reads GITHUB_SHA).
ARG BUILD_SHA=dev
ENV GITHUB_SHA=$BUILD_SHA
RUN npm run build && npm run build:server

# ---- Run: the server uses only Node's built-in modules, so no npm install here ----
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
USER node
EXPOSE 8080
CMD ["node", "dist-server/main.js"]
