FROM node:22-alpine
RUN npm install -g pnpm

WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @workspace/api-server run build

EXPOSE 3000
CMD ["node", "artifacts/api-server/dist/index.mjs"]
