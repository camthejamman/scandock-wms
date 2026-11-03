# syntax=docker/dockerfile:1
# Build context is the repository root (npm workspaces need the root lockfile).
FROM node:24-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/erp-mock/package.json apps/erp-mock/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
RUN npm ci -w apps/api --ignore-scripts

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/api apps/api
RUN npm run build -w apps/api

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/erp-mock/package.json apps/erp-mock/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
RUN npm ci -w apps/api --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY apps/api/src/db/schema.sql apps/api/dist/db/schema.sql
USER node
EXPOSE 4000
HEALTHCHECK --interval=5s --timeout=3s --retries=20 CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "apps/api/dist/server.js"]
