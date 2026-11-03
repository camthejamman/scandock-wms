# syntax=docker/dockerfile:1
FROM node:24-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/erp-mock/package.json apps/erp-mock/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
RUN npm ci -w apps/erp-mock --ignore-scripts

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/erp-mock apps/erp-mock
RUN npm run build -w apps/erp-mock

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/erp-mock/package.json apps/erp-mock/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
RUN npm ci -w apps/erp-mock --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /repo/apps/erp-mock/dist apps/erp-mock/dist
USER node
EXPOSE 4100
HEALTHCHECK --interval=5s --timeout=3s --retries=20 CMD wget -qO- http://127.0.0.1:4100/erp/health || exit 1
CMD ["node", "apps/erp-mock/dist/server.js"]
