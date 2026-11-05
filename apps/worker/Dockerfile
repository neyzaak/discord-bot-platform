FROM node:20-alpine
RUN npm i -g pnpm@9
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --prod=false
COPY packages/core packages/core
COPY apps/worker apps/worker
CMD ["pnpm", "--filter", "@platform/worker", "start"]
