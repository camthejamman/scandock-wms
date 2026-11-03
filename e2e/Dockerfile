# syntax=docker/dockerfile:1
# Same image the CI job uses, so screenshots/visual snapshots are reproducible.
FROM mcr.microsoft.com/playwright:v1.64.1-noble
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/erp-mock/package.json apps/erp-mock/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
RUN npm ci -w e2e --ignore-scripts
COPY tsconfig.base.json ./
COPY e2e e2e
WORKDIR /repo/e2e
ENV CI=1
CMD ["npx", "playwright", "test"]
